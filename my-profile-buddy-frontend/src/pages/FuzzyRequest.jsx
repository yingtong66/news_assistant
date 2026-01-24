import React from "react";
import Chatbot from "../components/Chatbot/Chatbot";
import { Content } from "antd/es/layout/layout";
const FuzzyRequest = () => {
  return (

    <Content style={{
      width: "100%",
      height: "400px",
      paddingInline: 0,
    }}>
      <Chatbot title={0}/>
    </Content>
  );
}

export default FuzzyRequest;