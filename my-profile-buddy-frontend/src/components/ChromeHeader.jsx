//规则配置助手、已定义的规则等页面的页头


import React from "react";
import { Layout, Typography } from 'antd';
import {LeftCircleOutlined} from '@ant-design/icons';


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

const ChromeHeader = (
    {title}
) => {
    return(
        <Header style={headerStyle}>
            <LeftCircleOutlined
                style={{
                    color: '#fff', 
                    fontSize: '30px',
                    marginLeft:20,
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
                    marginRight: 50,
                    color: '#fff',
                }}
            >
                {title}
            </Typography.Title>
        </Header>
    )
}
export default ChromeHeader;