import React, { useEffect, useState } from 'react';
import {Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import FuzzyRequest from './pages/FuzzyRequest';
import ProfileAlignment from './pages/ProfileAlignment';
import Feedback from './pages/Feedback';
import Profile from './pages/Profile/Profile';
import EmptyPage from './pages/EmptyPage';
import StartButton from './components/StartButtion';
import { Content } from 'antd/es/layout/layout';
import {getItem} from './utils/Chrome/getItem.js';
import { backendUrl, userPid } from './utils/Const.js';

const hisOpen = await getItem('isOpen');
console.log(hisOpen);
console.log("his length is "+window.history.length);

function App() {
  const [isOpen, setIsOpen] = useState(hisOpen);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    // 如果需要根据 isOpen 的变化来进行导航
    if (isOpen && (location.pathname ==="/index.html")
    ) {
      navigate("/home");
    }
    // 依赖项数组中包含 isOpen，确保只有在 isOpen 改变时才执行
  }, [isOpen, location, navigate]);

  const openBuddy = async ()=>{
    const newIsOpen = !isOpen;
    navigate(newIsOpen ? "/home" : "/");
    chrome.storage.sync.set({isOpen: !isOpen}, ()=>{console.log("isOpen set to "+!isOpen)});
    setIsOpen(newIsOpen);
    const data = await getItem("profiles",[]);
    fetch(`${backendUrl}/record_user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({pid: userPid, profiles:data})
    });
  }

  return (
    <>
      {/* <Typography.Text keyboard> 已经打开: {count}s </Typography.Text> */}
      <Content style={{width:"400px", paddingInline:10}}>
      {
        location.pathname !=="/home" && location.pathname !=="/" && window.history.length>1 ? <></>: <StartButton isOpen={isOpen} startFunction={openBuddy}/>
      }
          <Routes>
            <Route path="/fuzzy" element={<FuzzyRequest></FuzzyRequest>}></Route>
            <Route path="/alignment" element={<ProfileAlignment></ProfileAlignment>}></Route>
            <Route path="/feedback" element={<Feedback></Feedback>}></Route>
            <Route path="/profile" element={<Profile></Profile>}></Route>
            <Route path="/home" element={<Home></Home>}></Route>
            <Route path="/" element={<EmptyPage></EmptyPage>}></Route>
          </Routes>
      </Content>
    </>
  );
}

export default App;

/* ------------------------------------------------------------------
中文注释（文件作用与路由结构）

1) 文件作用
   - 应用根组件：控制开关入口（StartButton），并定义各页面路由。

2) 路由结构
   - “/” 入口空白页（EmptyPage），用于关闭状态的占位。
   - “/home” 主页导航（Home）。
   - “/profile” 规则管理页（Profile）。
   - “/fuzzy” 模糊需求/偏好对话入口（Chatbot title=0）。
   - “/alignment” 画像对齐入口（Chatbot title=1）。
   - “/feedback” 反馈对话入口（Chatbot title=2）。

3) 状态与导航
   - isOpen：开关状态；控制是否跳转到 /home，并同步到 chrome.storage.sync。
   - openBuddy：切换开关，跳转路由并上传本地 profiles 到后端 `/record_user`。
   - useEffect：当 isOpen 变化且当前路径为 /index.html 时，自动导航到 /home。

4) 布局
   - 外层使用 Ant Design 的 Content 包裹，限制宽度。
   - StartButton 仅在主页/入口且历史栈较浅时展示，避免在子页面重复显示。
------------------------------------------------------------------ */
