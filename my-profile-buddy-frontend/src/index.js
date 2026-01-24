import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter as Router } from 'react-router-dom';


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Router>
    <App />
  </Router>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

/* ------------------------------------------------------------------
中文注释（文件作用与流程）

1) 文件作用
   - React 应用的入口文件：创建根节点，渲染 App 组件。
   - 包裹在 React.StrictMode 中，帮助开发阶段发现潜在问题。

2) 关键步骤
   - 获取挂载点：document.getElementById('root')。
   - 创建 root：ReactDOM.createRoot(root)。
   - root.render(<React.StrictMode><App /></React.StrictMode>) 渲染应用。
   - reportWebVitals()：可选的性能上报钩子，默认空实现。

3) 依赖关系
   - App.js：应用主组件。
   - reportWebVitals：性能统计函数（可按需接入日志/监控）。
------------------------------------------------------------------ */
