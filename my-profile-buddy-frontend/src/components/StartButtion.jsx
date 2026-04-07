// 最顶部的开关，Hi, {userPid}! Let's Go~

import React, { useContext } from "react";
import { Switch, Typography } from 'antd';
import { Header } from 'antd/es/layout/layout';
import { Link } from 'react-router-dom';
import UserContext from "../contexts/UserContext";


const StartButton = (
  {isOpen,
  startFunction}
)=>{
    const userPid = useContext(UserContext);
    // 开启状态下不渲染（由 Dashboard 标题栏显示开关）
    if (isOpen) return null;
    // 关闭状态下只显示开关按钮
    return (
        <div style={{
          padding: '16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
            <Typography.Text style={{ marginRight: 12 }}>点击开启推荐助手</Typography.Text>
            <Switch
              checked={isOpen}
              onChange={startFunction}
              checkedChildren={<Link to="/home">On</Link>}
              unCheckedChildren={<Link to="/">Off</Link>}
            />
        </div>
    );
}

export default StartButton;