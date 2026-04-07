import React, { useContext, useEffect, useRef, useState } from 'react';
import { Button, Flex, Input, List, Modal, Select, Spin, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import TextArea from 'antd/es/input/TextArea';
import { Form } from 'antd';
import Markdown from 'react-markdown';
import { backendUrl, platformOptions } from '../utils/Const';
import { getItem } from '../utils/Chrome/getItem';
import { setItem } from '../utils/Chrome/setItem';
import UserContext from '../contexts/UserContext';
import ChangeProfile from '../components/ChangeProfile';
import userAvatar from '../images/user-avatar.png';
import botAvatar from '../images/bot-avatar.png';
import '../components/Chatbot/Chatbot.css';
import '../pages/Profile/Profile.css';

const { Search } = Input;

// 历史偏好展示区
const HistoryPreference = ({ personalities, loading, onRefresh }) => {
    // 解析多行格式：只取 "- " 开头的行，区分正向/负向区块
    const posTags = [];
    const negTags = [];
    if (personalities) {
        let section = 'pos';
        personalities.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed.includes('不感兴趣') || trimmed.includes('负向')) section = 'neg';
            else if (trimmed.includes('偏好') || trimmed.includes('正向')) section = 'pos';
            if (trimmed.startsWith('- ')) {
                const text = trimmed.slice(2).trim();
                if (text) (section === 'neg' ? negTags : posTags).push(text);
            }
        });
    }
    const hasAny = posTags.length > 0 || negTags.length > 0;
    return (
        <div style={{
            borderBottom: '1px solid #e8e8e8',
            padding: '10px 12px',
            background: '#fafafa',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 'bold', fontSize: 13, color: '#555', flex: 1 }}>历史偏好</span>
                <Tooltip title="重新分析历史偏好">
                    <Button
                        type="text"
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={loading}
                        onClick={onRefresh}
                        style={{ color: '#1677ff' }}
                    />
                </Tooltip>
            </div>
            <Spin spinning={loading} size="small">
                {hasAny ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* 正向偏好 */}
                        <div>
                            <div style={{ fontSize: 11, color: '#1677ff', fontWeight: 'bold', marginBottom: 4 }}>正向偏好</div>
                            {posTags.length > 0 ? (
                                <Flex wrap="wrap" gap={4}>
                                    {posTags.map((tag, i) => (
                                        <Tag key={i} color="blue" style={{ fontSize: 12 }}>{tag}</Tag>
                                    ))}
                                </Flex>
                            ) : (
                                <Typography.Text type="secondary" style={{ fontSize: 11 }}>暂无</Typography.Text>
                            )}
                        </div>
                        {/* 负向偏好 */}
                        <div>
                            <div style={{ fontSize: 11, color: '#ff4d4f', fontWeight: 'bold', marginBottom: 4 }}>负向偏好</div>
                            {negTags.length > 0 ? (
                                <Flex wrap="wrap" gap={4}>
                                    {negTags.map((tag, i) => (
                                        <Tag key={i} color="red" style={{ fontSize: 12 }}>{tag}</Tag>
                                    ))}
                                </Flex>
                            ) : (
                                <Typography.Text type="secondary" style={{ fontSize: 11 }}>暂无</Typography.Text>
                            )}
                        </div>
                    </div>
                ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        暂时还没有足够的浏览记录，继续使用后我会逐渐了解你的偏好～
                    </Typography.Text>
                )}
            </Spin>
        </div>
    );
};

// 聊天消息列表
const Messages = ({ allmessage }) => (
    <>
        {allmessage.map((msg, index) => (
            <div className={`message ${msg.sender}`} key={index}>
                <img className="avatar" src={msg.avatar} alt="avatar" />
                <div className="text">
                    <Markdown style={{ margin: 0, padding: 0 }}>{msg.message}</Markdown>
                </div>
            </div>
        ))}
    </>
);

// 规则卡片
const ProfileCard = ({ item, delFunc, saveFunc, toggleEdit, edit, isModalOpen, setIsModalOpen }) => {
    const [formData, setFormData] = useState(item);
    useEffect(() => { setFormData(item); }, [item]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    const handleActiveChange = (val) => setFormData(prev => ({ ...prev, isactive: val }));
    const handlePlatformChange = (val) => setFormData(prev => ({ ...prev, platform: val }));

    return (
        <Form>
            <div className="list-item" style={{ padding: '8px', marginBottom: '6px' }}>
                <div className="item-title">
                    <TextArea
                        placeholder="输入规则..."
                        onChange={handleChange}
                        name="rule"
                        disabled={!edit}
                        value={formData.rule}
                        autoSize={{ minRows: 2, maxRows: 4 }}
                        style={{ fontSize: 12 }}
                    />
                </div>
                <div className="item-controls" style={{ flexWrap: 'wrap', gap: 4 }}>
                    {edit
                        ? <Button key="save" type="primary" size="small" onClick={() => saveFunc(formData)}>保存</Button>
                        : <Button key="edit" type="primary" size="small" onClick={toggleEdit}>编辑</Button>
                    }
                    <Button key="del" type="primary" danger size="small" onClick={() => setIsModalOpen()}>删除</Button>
                    <Modal
                        title="此操作不可逆!"
                        open={isModalOpen}
                        onOk={delFunc}
                        onCancel={() => setIsModalOpen()}
                        footer={[
                            <Button key="back" onClick={() => setIsModalOpen()}>取消</Button>,
                            <Button key="submit" type="primary" onClick={delFunc}>确定</Button>,
                        ]}>
                        确定删除<Typography.Text keyboard>{formData.rule}</Typography.Text>
                    </Modal>
                    <Select
                        value={formData.platform}
                        options={platformOptions}
                        disabled={!edit}
                        onChange={handlePlatformChange}
                        size="small"
                        style={{ width: 70 }}
                    />
                    <Select
                        value={formData.isactive}
                        options={[{ value: true, label: '激活' }, { value: false, label: '停用' }]}
                        disabled={!edit}
                        onChange={handleActiveChange}
                        size="small"
                        style={{ width: 65 }}
                    />
                </div>
            </div>
        </Form>
    );
};

// 主 Dashboard 页面
const Dashboard = () => {
    const userPid = useContext(UserContext);
    // ---- 历史偏好 ----
    const [personalities, setPersonalities] = useState('');
    const [prefLoading, setPrefLoading] = useState(true);

    useEffect(() => {
        // 加载用户历史偏好
        fetch(`${backendUrl}/get_alignment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pid: userPid, platform: 0 }),
        })
            .then(r => r.json())
            .then(data => {
                const p = data['data']['personalities'];
                setPersonalities(typeof p === 'string' ? p : '');
                setPrefLoading(false);
            })
            .catch(() => setPrefLoading(false));
    }, []);

    // ---- 聊天 ----
    const [enabled, setEnabled] = useState(false);
    const [message, setMessage] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [nowsid, setNowSid] = useState(-1);
    const [chatLoading, setChatLoading] = useState(true);
    const [action, setAction] = useState([]);
    const [guidanceQuestion, setGuidanceQuestion] = useState('');

    // 强制刷新历史偏好：清除缓存，重新运行三步LLM，并刷新聊天引导语
    const refreshPreference = () => {
        setPrefLoading(true);
        setEnabled(false);
        setChatLoading(true);
        setNowSid(-1);
        setChatHistory([]);
        setGuidanceQuestion('');
        fetch(`${backendUrl}/guided_chat/refresh?pid=${userPid}&platform=0`)
            .then(r => r.json())
            .then(data => {
                const res = data['data'];
                // 刷新偏好标签（从后端重新拉取）
                fetch(`${backendUrl}/get_alignment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pid: userPid, platform: 0 }),
                })
                    .then(r2 => r2.json())
                    .then(data2 => {
                        const p2 = data2['data']['personalities'];
                        setPersonalities(typeof p2 === 'string' ? p2 : '');
                        setPrefLoading(false);
                    })
                    .catch(() => setPrefLoading(false));
                // 刷新聊天引导语
                const q = res['guidance_question'];
                setGuidanceQuestion(q);
                setChatHistory([{ sender: 'bot', message: q, avatar: botAvatar }]);
                setEnabled(true);
                setChatLoading(false);
            })
            .catch(() => { setPrefLoading(false); setEnabled(true); setChatLoading(false); });
    };
    const chatEndRef = useRef(null);
    const title = 0; // 规则配置助手

    useEffect(() => {
        // 每次打开清空历史，主动输出引导语
        setEnabled(false);
        setChatLoading(true);
        setNowSid(-1);
        setChatHistory([]);
        setGuidanceQuestion('');
        fetch(`${backendUrl}/guided_chat/start?pid=${userPid}&platform=0`)
            .then(r => r.json())
            .then(data => {
                const q = data['data']['guidance_question'];
                setGuidanceQuestion(q);
                setChatHistory([{ sender: 'bot', message: q, avatar: botAvatar }]);
                setEnabled(true);
                setChatLoading(false);
            })
            .catch(() => setChatLoading(false));
    }, []);

    useEffect(() => {
        // 新消息时滚动到底部
        if (chatEndRef.current) {
            chatEndRef.current.scrollTop = chatEndRef.current.scrollHeight;
        }
    }, [chatHistory]);

    const sendMessage = () => {
        if (!message) return;
        const userMsg = { sender: 'user', message, avatar: userAvatar };
        setChatHistory(h => [...h, userMsg]);
        setEnabled(false);
        setMessage('');

        // 引导模式：首条回复走 /guided_chat/summarize
        if (guidanceQuestion) {
            fetch(`${backendUrl}/guided_chat/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pid: userPid, platform: 0, guidance_question: guidanceQuestion, user_response: message }),
            })
                .then(r => r.json())
                .then(data => {
                    const res = data['data'];
                    if (res.sid) setNowSid(res.sid);
                    if (res.actions && res.actions.length !== 0) {
                        setGuidanceQuestion('');
                        setAction(res.actions);
                    } else {
                        // 普通回复：展示内容，保持引导状态继续等待偏好表达
                        const reply = res.content || res.message || '未检测到明确需求，请重新描述您想看或不想看的内容。';
                        setChatHistory(h => [...h, { sender: 'bot', message: reply, avatar: botAvatar }]);
                    }
                    setEnabled(true);
                })
                .catch(() => setEnabled(true));
            return;
        }

        fetch(`${backendUrl}/chatbot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sid: nowsid, sender: 'user', content: userMsg.message, pid: userPid, task: title, platform: 0 }),
        })
            .then(r => r.json())
            .then(data => {
                const res = data['data'];
                if (nowsid !== res['sid']) setNowSid(res['sid']);
                if (res.action && res.action.length !== 0) {
                    setAction(res.action);
                } else {
                    setChatHistory(h => [...h, { sender: 'bot', message: res['content'], avatar: botAvatar }]);
                }
                setEnabled(true);
            })
            .catch(() => setEnabled(true));
    };

    // ---- 规则管理 ----
    const [rules, setRules] = useState([]);
    const [editable, setEditable] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState([]);

    const loadRules = async () => {
        // 以后端 DB 为准，同步覆盖本地 chrome.storage
        fetch(`${backendUrl}/get_rules?pid=${userPid}&platform=0`)
            .then(r => r.json())
            .then(data => {
                const serverRules = data['data']['rules'];
                setRules(serverRules);
                setEditable(new Array(serverRules.length).fill(false));
                setIsModalOpen(new Array(serverRules.length).fill(false));
                setItem('profiles', serverRules);
            });
    };

    useEffect(() => { loadRules(); }, []);

    const updateRule = async (id, item, index) => {
        if (item.rule.indexOf('我不想看') !== 0 && item.rule.indexOf('我想看') !== 0) {
            alert('规则必须以"我不想看"或"我想看"开头');
            return;
        }
        const newData = rules.map(r => r.iid === id ? item : r);
        fetch(`${backendUrl}/save_rules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pid: userPid, isbot: false, isdel: false, rule: item, iid: id }),
        });
        await setItem('profiles', newData);
        setRules(newData);
        toggleEditRule(index);
    };

    const deleteRule = async (id, index) => {
        const newData = rules.filter(r => r.iid !== id);
        fetch(`${backendUrl}/save_rules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isbot: false, isdel: true, rule: {}, iid: id, pid: userPid }),
        });
        await setItem('profiles', newData);
        setRules(newData);
        setIsModalOpen(m => m.filter((_, i) => i !== index));
        setEditable(e => e.filter((_, i) => i !== index));
    };

    const addRule = () => {
        if (editable.some(e => e)) { alert('请先保存当前编辑中的规则'); return; }
        const maxIid = rules.length === 0 ? 0 : rules.reduce((m, r) => r.iid > m ? r.iid : m, 0);
        setRules(r => [...r, { iid: maxIid + 1, platform: 0, rule: '我不想看……', isactive: true }]);
        setEditable(e => [...e, true]);
        setIsModalOpen(m => [...m, false]);
    };

    const toggleEditRule = (index) => {
        setEditable(e => e.map((v, i) => i === index ? !v : v));
    };

    const changeModalOpen = (index) => {
        setIsModalOpen(m => m.map((v, i) => i === index ? !v : v));
    };

    return (
        <div style={{ display: 'flex', width: '750px', height: '600px', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
            {/* 顶部标题 */}
            <div style={{
                padding: '10px 16px',
                borderBottom: '2px solid #1677ff',
                fontWeight: 'bold',
                fontSize: 16,
                background: '#fff',
                color: '#1677ff',
                flexShrink: 0,
            }}>
                Hi, {userPid}! 欢迎使用个性化新闻推荐助手
            </div>

            {/* 主体区域 */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* 左列：历史偏好 + 聊天 */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderRight: '1px solid #e8e8e8', overflow: 'hidden' }}>
                    {/* 历史偏好 */}
                    <HistoryPreference personalities={personalities} loading={prefLoading} onRefresh={refreshPreference} />

                    {/* 聊天框 */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ fontSize: 12, fontWeight: 'bold', color: '#555', padding: '6px 12px', background: '#f0f4ff', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
                            规则配置助手
                        </div>
                        <div
                            ref={chatEndRef}
                            style={{ flex: 1, overflowY: 'auto', padding: '8px', background: '#fff' }}
                        >
                            <Spin spinning={chatLoading}>
                                <Messages allmessage={chatHistory} />
                            </Spin>
                        </div>
                        <div style={{ padding: '6px 8px', borderTop: '1px solid #e8e8e8', flexShrink: 0 }}>
                            <Search
                                placeholder="输入消息..."
                                allowClear
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                enterButton="发送"
                                size="middle"
                                onSearch={sendMessage}
                                disabled={!enabled}
                                loading={!enabled}
                            />
                        </div>
                    </div>
                </div>

                {/* 右列：规则列表 */}
                <div style={{ width: 320, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, fontWeight: 'bold', color: '#555', padding: '6px 12px', background: '#f0f4ff', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
                        已有规则
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                        <List
                            dataSource={rules}
                            renderItem={(item, index) => (
                                <ProfileCard
                                    key={index}
                                    item={item}
                                    delFunc={() => deleteRule(item.iid, index)}
                                    saveFunc={data => updateRule(item.iid, data, index)}
                                    toggleEdit={() => toggleEditRule(index)}
                                    edit={editable[index]}
                                    isModalOpen={isModalOpen[index]}
                                    setIsModalOpen={() => changeModalOpen(index)}
                                />
                            )}
                        />
                        <Button type="dashed" size="middle" onClick={addRule} style={{ width: '100%', marginTop: 4 }}>
                            + 新增规则
                        </Button>
                    </div>
                </div>
            </div>

            {/* 规则确认弹窗 */}
            <ChangeProfile
                actionData={action}
                setAction={setAction}
                setActionMessage={setChatHistory}
                sid={nowsid}
                platform={0}
                setEnabled={setEnabled}
                setLoading={setChatLoading}
                onRulesChange={loadRules}
            />
        </div>
    );
};

export default Dashboard;
