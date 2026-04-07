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
    return (
        <Header style={{
          backgroundColor: "rgb(248, 250, 253)",
          padding:0,
          width:"100%",
          textAlign: "center",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexDirection: "row",
        }}>
              {/* <Typography.Text
                level={6}
                style={{
                  margin: 0,
                  padding: 0,
                  flex: 1,
                  marginLeft: 20,
                }}
                >
                ProfileBuddy
              </Typography.Text> */}

              <Typography.Title
                level={4}
                style={{
                  margin: 0,
                  padding: 0,
                  flex: 5,
                  marginLeft: 20,
                }}
                >
                Hi, {userPid}! Let's Go~{" "}
              </Typography.Title>
              
              <Switch
                checked = {isOpen}
                onChange={startFunction}
                checkedChildren={<Link to="/home">On</Link>}
                unCheckedChildre={<Link to="/">off</Link>}
                style={{
                  padding: 0,
                  flex: 1,
                  marginRight:50,
                }}
                />
        </Header>
    );
}

export default StartButton;