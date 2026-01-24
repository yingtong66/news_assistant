import React from "react";
import { Layout, Typography } from 'antd';
import {LeftCircleOutlined, MoreOutlined} from '@ant-design/icons';


const headerStyle = {
    color: '#fff',
    backgroundColor: '#4096ff',
    width: "100%",
    lineHeight: '50px',
    display: 'flex',
    paddingInline: 0,
    padding:0, 
    textAlign: "center",
    justifyContent: "space-between",
    alignItems: "center",
    flexDirection: "row",
}; //set header style

const { Header } = Layout;

const ChatHeader = (
    {title, clickMore}
) => {
    

    return(
        <Header style={headerStyle}>
            <LeftCircleOutlined
                style={{
                    color: '#fff', 
                    fontSize: '30px',
                    marginLeft:20,
                    border: 'none',
                    flex: 1,
                }}
                onClick={() => window.history.back()}
            />
            <Typography.Title
                level={4}
                style={{
                    margin: 0,
                    padding: 0,
                    flex: 5,
                    color: '#fff',
                }}
            >
                {title}
            </Typography.Title>
            <MoreOutlined 
                style={{
                    color: '#fff',
                    fontSize: '30px',
                    marginRight: 0,
                    flex: 1,
                }}
                onClick={clickMore}
            />

        </Header>
    )
}
export default ChatHeader;