import React, { useState } from "react";
import { Button, Input, Typography } from "antd";
import { setItem } from "../utils/Chrome/setItem";

// 首次使用时让用户输入用户名并保存到 chrome.storage
const RegisterPage = ({ onRegister }) => {
    const [value, setValue] = useState("");
    const [loading, setLoading] = useState(false);

    const handleConfirm = async () => {
        const trimmed = value.trim();
        if (!trimmed) { alert("请输入用户名"); return; }
        setLoading(true);
        await setItem("userPid", trimmed);
        onRegister(trimmed);
    };

    return (
        <div style={{
            width: 750, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: 300, gap: 16, padding: 32,
        }}>
            <Typography.Title level={4} style={{ marginBottom: 0 }}>欢迎使用个性化新闻助手</Typography.Title>
            <Typography.Text type="secondary">请设置你的用户名（之后不需要再输入）</Typography.Text>
            <Input
                style={{ width: 260 }}
                placeholder="输入用户名，如 alice123"
                value={value}
                onChange={e => setValue(e.target.value)}
                onPressEnter={handleConfirm}
                maxLength={32}
            />
            <Button type="primary" loading={loading} onClick={handleConfirm}>
                确认
            </Button>
        </div>
    );
};

export default RegisterPage;
