import React, { useContext, useEffect, useRef, useState } from 'react';
import { Button, Flex, Input, List, Modal, Select, Spin, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined, DownOutlined, UpOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined } from '@ant-design/icons';
import TextArea from 'antd/es/input/TextArea';
import { Form } from 'antd';
import Markdown from 'react-markdown';
import { backendUrl } from '../utils/Const';
import { getItem } from '../utils/Chrome/getItem';
import { setItem } from '../utils/Chrome/setItem';
import { Switch } from 'antd';
import { Link } from 'react-router-dom';
import UserContext from '../contexts/UserContext';
import ChangeProfile from '../components/ChangeProfile';
import userAvatar from '../images/user-avatar.png';
import botAvatar from '../images/icon_robot-2.png';
import iconFlag from '../images/icon_flag.png';
import iconRobot1 from '../images/icon_robot-1.png';
import iconRobot2 from '../images/icon_robot-2.png';
import iconRule from '../images/icon_rule.png';
import './Dashboard.css';

const { Search } = Input;

// 历史偏好展示区（可折叠）
const HistoryPreference = ({ personalities, loading, onRefresh, onCollapseChange }) => {
    const [collapsed, setCollapsed] = useState(false);
    const handleToggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        if (onCollapseChange) onCollapseChange(next);
    };
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
        <div className="dash-card">
            <div className="card-header">
                <div className="card-title" onClick={handleToggle} style={{ cursor: 'pointer' }}>
                    <img src={iconFlag} alt="flag" className="card-icon" />
                    <span>历史偏好</span>
                    {collapsed ? <UpOutlined style={{ fontSize: 10, marginLeft: 6 }} /> : <DownOutlined style={{ fontSize: 10, marginLeft: 6 }} />}
                </div>
                {!collapsed && (
                    <Tooltip title="重新分析历史偏好">
                        <Button
                            type="text"
                            size="small"
                            icon={<ReloadOutlined />}
                            loading={loading}
                            onClick={onRefresh}
                            className="refresh-btn"
                        />
                    </Tooltip>
                )}
            </div>
            {!collapsed && (
                <Spin spinning={loading} size="small">
                    {hasAny ? (
                        <div className="pref-content">
                            <div className="pref-section">
                                <div className="pref-label pref-label-pos">
                                    <span className="pref-dot dot-pos"></span>
                                    正向偏好
                                </div>
                                <Flex wrap="wrap" gap={8}>
                                    {posTags.map((tag, i) => (
                                        <Tag key={i} className="pref-tag tag-pos">{tag}</Tag>
                                    ))}
                                </Flex>
                            </div>
                            <div className="pref-section">
                                <div className="pref-label pref-label-neg">
                                    <span className="pref-dot dot-neg"></span>
                                    负向偏好
                                </div>
                                <Flex wrap="wrap" gap={8}>
                                    {negTags.map((tag, i) => (
                                        <Tag key={i} className="pref-tag tag-neg">{tag}</Tag>
                                    ))}
                                </Flex>
                            </div>
                        </div>
                    ) : (
                        <Typography.Text type="secondary" style={{ fontSize: 13, padding: '12px 0', display: 'block' }}>
                            暂时还没有足够的浏览记录，继续使用后我会逐渐了解你的偏好~
                        </Typography.Text>
                    )}
                </Spin>
            )}
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

    return (
        <Form>
            <div className="rule-card">
                <div className="rule-content">
                    <TextArea
                        placeholder="输入规则..."
                        onChange={handleChange}
                        name="rule"
                        disabled={!edit}
                        value={formData.rule}
                        autoSize={{ minRows: 2, maxRows: 4 }}
                        className="rule-textarea"
                        bordered={false}
                    />
                </div>
                <div className="rule-controls">
                    {edit
                        ? <Button key="save" type="primary" size="small" onClick={() => saveFunc(formData)} className="btn-edit">保存</Button>
                        : <Button key="edit" size="small" onClick={toggleEdit} icon={<EditOutlined />} className="btn-edit">编辑</Button>
                    }
                    <Button key="del" size="small" danger onClick={() => setIsModalOpen()} icon={<DeleteOutlined />} className="btn-delete">删除</Button>
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
                        value={formData.isactive}
                        options={[{ value: true, label: '激活' }, { value: false, label: '停用' }]}
                        disabled={!edit}
                        onChange={handleActiveChange}
                        size="small"
                        className="rule-select"
                    />
                </div>
            </div>
        </Form>
    );
};

// 主 Dashboard 页面
const Dashboard = ({ isOpen, openBuddy }) => {
    const userPid = useContext(UserContext);
    // ---- 历史偏好 ----
    const [personalities, setPersonalities] = useState('');
    const [prefLoading, setPrefLoading] = useState(true);

    useEffect(() => {
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
                const q = res['guidance_question'];
                setGuidanceQuestion(q);
                setChatHistory([{ sender: 'bot', message: q, avatar: botAvatar }]);
                setEnabled(true);
                setChatLoading(false);
            })
            .catch(() => { setPrefLoading(false); setEnabled(true); setChatLoading(false); });
    };

    const handlePreferenceCollapseChange = (isCollapsed) => {
        setEnabled(false);
        setChatLoading(true);
        setChatHistory([]);
        setGuidanceQuestion('');
        setNowSid(-1);
        const url = isCollapsed
            ? `${backendUrl}/guided_chat/start?pid=${userPid}&platform=0&no_preference=1`
            : `${backendUrl}/guided_chat/start?pid=${userPid}&platform=0`;
        fetch(url)
            .then(r => r.json())
            .then(data => {
                const q = data['data']['guidance_question'];
                setGuidanceQuestion(q);
                setChatHistory([{ sender: 'bot', message: q, avatar: botAvatar }]);
                setEnabled(true);
                setChatLoading(false);
            })
            .catch(() => { setEnabled(true); setChatLoading(false); });
    };

    const chatEndRef = useRef(null);
    const title = 0;

    useEffect(() => {
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
        setRules(r => [...r, { iid: maxIid + 1, platform: 0, rule: '我想看……/我不想看……', isactive: true }]);
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
        <div className="dashboard-wrapper">
            {/* 顶部标题栏 */}
            <div className="dashboard-header">
                <div className="header-left">
                    <img src={iconRobot1} alt="robot" className="header-robot-icon" />
                    <div className="header-text">
                        <span className="header-title">Hi, {userPid}! 欢迎使用个性化资讯推荐助手</span>
                        <span className="header-subtitle">智能推荐你关心的资讯，发现更多精彩内容</span>
                    </div>
                </div>
                <Switch
                    checked={isOpen}
                    onChange={openBuddy}
                    className="header-switch"
                />
            </div>

            {/* 主体区域 */}
            <div className="dashboard-body">
                {/* 左列 */}
                <div className="dashboard-left">
                    {/* 历史偏好 */}
                    <HistoryPreference personalities={personalities} loading={prefLoading} onRefresh={refreshPreference} onCollapseChange={handlePreferenceCollapseChange} />

                    {/* 推荐助手聊天区 */}
                    <div className="dash-card chat-card">
                        <div className="card-header">
                            <div className="card-title">
                                <img src={iconRobot1} alt="robot" className="card-icon" />
                                <span>推荐助手</span>
                            </div>
                        </div>
                        <div className="chat-messages" ref={chatEndRef}>
                            <Spin spinning={chatLoading}>
                                <Messages allmessage={chatHistory} />
                            </Spin>
                        </div>
                        <div className="chat-footer">
                            <div className="input-wrapper">
                                <SendOutlined className="input-icon" />
                                <Input
                                    placeholder="输入消息..."
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    onPressEnter={sendMessage}
                                    disabled={!enabled}
                                    bordered={false}
                                    className="chat-input"
                                />
                            </div>
                            <Button
                                type="primary"
                                onClick={sendMessage}
                                disabled={!enabled}
                                loading={!enabled}
                                className="send-btn"
                            >
                                发送
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 右列：规则列表 */}
                <div className="dashboard-right">
                    <div className="dash-card rules-card">
                        <div className="card-header">
                            <div className="card-title">
                                <img src={iconRule} alt="rule" className="card-icon" />
                                <span>已有规则</span>
                            </div>
                        </div>
                        <div className="rules-list">
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
                            <Button
                                type="dashed"
                                size="large"
                                onClick={addRule}
                                className="add-rule-btn"
                                icon={<PlusOutlined />}
                            >
                                新增规则
                            </Button>
                        </div>
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
