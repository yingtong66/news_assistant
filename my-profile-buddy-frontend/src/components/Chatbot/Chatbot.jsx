/* ------------------------------------------------------------------
中文注释（组件整体流程说明）

1) 组件用途
   - Chatbot.jsx 是聊天主界面：展示消息列表、输入框、历史会话抽屉；同时在需要时弹出画像编辑对话框（ChangeProfile）。

2) 状态变量
   - enabeld：控制输入框与按钮可用状态。
   - message：当前输入的文本。
   - chatEndRef：聊天区域 DOM 引用，用于新消息时自动滚动到底部。
   - showSession：是否显示会话列表抽屉。
   - allSessions：已存在的会话列表（含 sid、摘要等）。
   - nowsid：当前会话的 sid。
   - chatHistory：当前会话的消息列表。
   - action：后端返回的画像动作（添加/修改/删除/搜索），需要用户确认后执行。
   - loading：全局加载态，控制 Spin 与输入禁用。

3) 关键函数
   - addSession：创建新会话（本地占位），并向后端请求首条系统消息（对齐或反馈）。
   - useEffect(初始化)：拉取会话列表；若有历史会话则加载最新会话历史，否则获取默认系统提示。
   - getHisChat：切换到指定历史会话，拉取其历史消息。
   - useEffect(滚动)：chatHistory 变化时滚动到底部，保持最新消息可见。
   - sendMessage：发送用户消息到后端，处理机器人回复；若后端返回 action 列表，则触发 ChangeProfile 弹窗由用户确认。

4) 渲染结构
   - ChatHeader：顶部栏（标题、返回、更多）。
   - 内容区：消息列表 + 输入框（Antd Search）。
   - Drawer(SessionList)：展示/切换会话，支持新建会话。
   - ChangeProfile：当 action 非空时弹出，用户确认偏好/规则修改后同步到后端与本地。
------------------------------------------------------------------ */


import React, {useState, useRef, useEffect, useContext} from "react";
import "./Chatbot.css";
import userAvatar from "../../images/user-avatar.png";
import botAvatar from "../../images/bot-avatar.png";
import { Drawer, Input, Spin} from 'antd';
import { Content } from "antd/es/layout/layout";
import ChatHeader from "./ChatHeader";
import SessionList from "./SessionList";
import { useLocation } from "react-router-dom";
import ChangeProfile from "../ChangeProfile";
import { backendUrl, taskOptions } from "../../utils/Const";
import UserContext from "../../contexts/UserContext";
import Markdown from 'react-markdown'
const { Search } = Input;
const Messages = ({allmessage}) => {
    return (
        <>
            {allmessage.map((msg, index, input) => (
                <div class={` message ${msg.sender}`} key={index}>
                    <img class="avatar" src={msg.avatar} alt="avatar"/>
                    <div class="text"> 
                        <Markdown style={{margin:0, padding:0}}>{msg.message}</Markdown>
                    </div>
                </div>
            ))}
        </>
    );
}

const Chatbot = (
    {title}
) =>{
    const userPid = useContext(UserContext);
    const [enabeld, setEnabled] = useState(true);
    const [message, setMessage] = useState("");
    const chatEndRef = useRef(null);
    const [showSession, setShowSession] = useState(false);
    const [allSessions, setAllSessions] = useState([]);
    const location = useLocation();
    const [nowsid, setNowSid] = useState(0);
    const [chatHistory, setChatHistory] = useState([]);

    //处理更改画像的问题
    const [action, setAction] = useState([]);

    //处理加载过慢问题
    const [loading, setLoading] = useState(false);

    // 需求引导模式：存储引导问题，非空时首条用户消息走 /guided_chat/summarize
    const [guidanceQuestion, setGuidanceQuestion] = useState("");

    // Helper function to get current session's platform
    const getCurrentSessionPlatform = () => {
        if (nowsid === -1) return 0; // Default to Toutiao for new sessions
        const currentSession = allSessions.find(s => s.sid === nowsid);
        return currentSession ? currentSession.platform : 0;
    };

    const addSession = () => {
        console.log("add session");
        setShowSession(false);
        setEnabled(false);
        setLoading(true);
        setNowSid(-1);
        setGuidanceQuestion("");
        setAllSessions(allsessions=>[...allsessions, {sid:-1, task:title, platform:0, summary:"NEW ONE"}]);
        //这里需要从服务端获取一条默认的系统消息
        if (title === 0){
            fetch(`${backendUrl}/guided_chat/start?pid=${userPid}&platform=0`)
            .then(response => response.json())
            .then(data=>{
                const res_data = data['data'];
                const q = res_data['guidance_question'];
                setGuidanceQuestion(q);
                const newMessage = {sender: "bot", message: q, avatar: botAvatar};
                setChatHistory([newMessage]);
                setEnabled(true);
                setLoading(false);
            })
        } else if(title === 2){
            fetch(`${backendUrl}/get_feedback`,{
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({pid:userPid,  platform:0}),
            }).then(response => response.json())
            .then(data=>{
                console.log(data['code']);
                const res_data = data['data']
                const newMessage = {sender: "bot", message: res_data['response'], avatar: botAvatar};
                setChatHistory([newMessage]);
                setEnabled(true);
                setLoading(false);
            });
        }
    }

    // 强制刷新历史偏好：清除缓存，重新运行三步LLM，并重置当前对话
    const refreshPreference = () => {
        setEnabled(false);
        setLoading(true);
        setNowSid(-1);
        setGuidanceQuestion("");
        setChatHistory([]);
        fetch(`${backendUrl}/guided_chat/refresh?pid=${userPid}&platform=0`)
        .then(response => response.json())
        .then(data => {
            const res_data = data['data'];
            const q = res_data['guidance_question'];
            setGuidanceQuestion(q);
            setChatHistory([{sender: "bot", message: q, avatar: botAvatar}]);
            setEnabled(true);
            setLoading(false);
        })
        .catch((error) => { console.error('刷新偏好失败:', error); setEnabled(true); setLoading(false); });
    }
    //打开对话的显示
    useEffect(() => {
        setEnabled(false);
        setLoading(true);
        setGuidanceQuestion("");

        if (title === 0) {
            // 需求引导模式：每次打开直接清空，输出引导语，不加载历史
            setNowSid(-1);
            setChatHistory([]);
            fetch(`${backendUrl}/guided_chat/start?pid=${userPid}&platform=0`)
            .then(response => response.json())
            .then(data => {
                const res_data = data['data'];
                const q = res_data['guidance_question'];
                setGuidanceQuestion(q);
                setChatHistory([{sender: "bot", message: q, avatar: botAvatar}]);
                setEnabled(true);
                setLoading(false);
            })
            .catch((error) => { console.error('Error:', error); });
            return;
        }

        fetch(`${backendUrl}/chatbot/get_sessions`,{
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json', 
            },
            body: JSON.stringify({pid:userPid, task:title}), 
        })
        .then(response => response.json())
        .then(data=>{
            console.log(data['code']);
            const res_data = data['data']
            setAllSessions(res_data['sessions']);
            let initSessions = res_data['sessions'];
            if (initSessions.length > 0){
                setNowSid(initSessions[initSessions.length-1]['sid']);
                fetch(`${backendUrl}/chatbot/get_history/${initSessions[initSessions.length-1]['sid']}`,{
                    method: 'GET'
                }).then(response => response.json())
                .then(data=>{
                    console.log(data['code']);
                    const res_data = data['data']
                    setChatHistory(res_data['messages'].map(element => {
                       return {
                            sender: element['sender'],
                            message: element['content'],
                            avatar: element['sender']==="user"?userAvatar:botAvatar
                       } 
                    }));
                    setEnabled(true);
                    setLoading(false);
                })
                .catch((error)=>{
                    console.error('Error:',error);
                });
            }
            else{
                if (title === 2){
                    fetch(`${backendUrl}/get_feedback`,{
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json', 
                        },
                        body: JSON.stringify({pid:userPid,  platform:0}),
                    }).then(response => response.json())
                    .then(data=>{
                        console.log(data['code']);
                        const res_data = data['data']
                        const newMessage = {sender: "bot", message: res_data['response'], avatar: botAvatar};
                        setChatHistory([newMessage]);
                        setEnabled(true);
                        setLoading(false);
                    });
                }
            }
        })
        .catch((error)=>{
            console.error('Error:',error);
            
        }); 
    }, [location, title])

    //查看以前的session
    function getHisChat(sid){
        setShowSession(false);
        if (sid === -1){ //相当于点击了新建的.
            return ;
        }
        fetch(`${backendUrl}/chatbot/get_history/${sid}`)
        .then(response => response.json())
        .then(data=>{
            console.log(data['code']);
            const res_data = data['data']
            setChatHistory(res_data['messages'].map(element => {
                return {
                     sender: element['sender'],
                     message: element['content'],
                     avatar: element['sender']==="user"?userAvatar:botAvatar
                } 
             }));
        })
        .catch((error)=>{
            console.error('Error:',error);
            
        });
        setNowSid(sid);
    }

    useEffect(() => {
        // 每当chatHistory变化时，执行滚动到底部的操作
        const chatBody = chatEndRef.current;
        if (chatBody) {
            chatBody.scrollTop = chatBody.scrollHeight; // 滚动到底部
        }
        
    }, [chatHistory]); // 滚动到底部


    //发送消息后的处理逻辑
    const sendMessage = () => {
        if (message === "") { //检查消息时候合法
            return;
        }

        //新建用户消息
        const userMessage = {sender: "user", message: message, avatar: userAvatar};
        setChatHistory(chatHistory => [...chatHistory, userMessage]);
        setEnabled(false);
        setMessage("");

        // 引导模式：首条回复走 /guided_chat/summarize
        if (guidanceQuestion) {
            fetch(`${backendUrl}/guided_chat/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pid: userPid,
                    platform: 0,
                    guidance_question: guidanceQuestion,
                    user_response: userMessage.message,
                }),
            })
            .then(response => response.json())
            .then(data => {
                const res_data = data['data'];
                if (res_data.sid) setNowSid(res_data.sid);
                if (res_data.actions && res_data.actions.length !== 0) {
                    setGuidanceQuestion(""); // 有操作才清空引导状态
                    setAction(res_data.actions);
                } else {
                    // 普通回复：展示内容，保持引导状态继续等待偏好表达
                    const reply = res_data.content || res_data.message || "未检测到明确需求，请重新描述您想看或不想看的内容。";
                    const newMessage = {sender: "bot", message: reply, avatar: botAvatar};
                    setChatHistory(chatHistory => [...chatHistory, newMessage]);
                }
                setEnabled(true);
            })
            .catch((error) => {
                console.error('Error:', error);
                setEnabled(true);
            });
            return;
        }

        fetch(`${backendUrl}/chatbot`,{
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json', 
            },
            body: JSON.stringify({sid:nowsid, sender:"user", content:userMessage.message, pid:userPid, task:title, platform:0}), 
        })
        .then(response => response.json())
        .then(data=>{
            console.log(data['code']);
            const res_data = data['data']
            
            if (nowsid !== res_data['sid']){ //说明是新保存的对话session
                setAllSessions(allsessions=>{
                    return allsessions.map(element => 
                        element['sid'] === nowsid ? {sid: res_data['sid'], pid:res_data['pid'], task:res_data['task'], platform:res_data['platform'], summary:res_data['summary']} : element
                      );
                    });
                setNowSid(res_data['sid']);
            }

            if(res_data.action.length!==0){
                //需要弹出对话框, 然后让用户判断是否更新画像
                setAction(res_data.action);
            }
            else{
                const newMessage = {sender: "bot", message: res_data['content'], avatar: botAvatar};
                setChatHistory(chatHistory => [...chatHistory, newMessage]);
            }
            setEnabled(true); //输入框可以继续输入
        })
        .catch((error)=>{
            console.error('Error:',error);
        });
    }

    return (
        <>
            <Content style={{
                height:"430px",
                width:"100%",
            }}
            >
                <ChatHeader title={taskOptions[title]} clickMore={()=>{setShowSession(true)}} onRefresh={refreshPreference} showRefresh={title === 0}/>
                <Spin spinning={loading}>
                <Content class="chat-container">
                    <div class="chat-body" id="chat-body" ref={chatEndRef}>
                        <Messages allmessage={chatHistory}/>
                    </div>
                    <div class="chat-footer">
                        <Search
                            placeholder="Input here..."
                            allowClear
                            onChange={
                                (e) => {
                                    setMessage(e.target.value);
                            }}
                            value={message}
                            enterButton="Send"
                            size="large"
                            onSearch={sendMessage}
                            enabeld={enabeld}
                            loading={!enabeld}
                            />
                    </div>
                </Content>
                </Spin>
            </Content>
            <Drawer 
                title="Session List" 
                open={showSession}
                style={{padding:0, margin:0, paddingBlock:0, paddingInline:0, backgroundColor:"#f0f2f5"}} 
                onClose={()=>setShowSession(false)}>
                    <SessionList title={"Session List"} 
                        addSession={addSession}
                        allsessions={allSessions}
                        clickSession={getHisChat}
                    />
            </Drawer>
            <ChangeProfile
                actionData={action}
                setAction={setAction}
                setActionMessage={setChatHistory}
                sid={nowsid}
                platform={getCurrentSessionPlatform()}
                setEnabled = {setEnabled}
                setLoading = {setLoading}
            />
        </>
    );
}

export default Chatbot;
