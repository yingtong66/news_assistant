import React from "react";
import { List, Card, Flex, Button } from 'antd';
import { Content } from "antd/es/layout/layout";

const SessionItem =(
    {session, click, index}
)=>{
    return (
        <Card 
            title={`历史对话 No.${index}`}
            bordered={true} 
            style={{ width: "95%", paddingLeft: 10, margin:10, alignItems:"center"}}
            onClick={click}
            hoverable
        >
            <p>{session.summary}</p>
        </Card>
    );
}

const SessionList = (
    {title, allsessions, addSession, clickSession}
) =>{
    // 用title查找需要的数据

    return (
        <>
            <Content style={{
                height:"100%",
                width:"100%",
                paddingInline: "0px",
                paddingBlock: "0px",
                padding: 0,
                overflowY: "auto", /* 当内容超出时，显示滚动条 */
                flex: 1, /* 让 Content 占据剩余空间 */
                backgroundColor: "#f0f2f5",
            }}>
                <List
                    grid={{gutter: 16, xs: 1,sm: 1, md: 1,lg: 1, xl: 1, xxl: 1}}
                    footer={ <Flex vertical gap="small" style={{width: '100%',}}><Button type="dashed" size='large' onClick={addSession}>新的对话</Button></Flex>}
                    bordered={false}
                    style={{
                        width: "95%",
                        textAlign:"center",
                        alignItems: "center",
                    }}
                    dataSource={allsessions}
                    renderItem={(item, index) => <SessionItem key={item.sid} session={item} click={()=>{clickSession(item.sid)}} index={index+1}/>}
                />
            </Content>
        </>
    ); 
}

export default SessionList;