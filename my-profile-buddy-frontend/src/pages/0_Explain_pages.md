# pages 目录说明

- Home.jsx：主页导航，展示菜单链接到规则管理、画像管理助手各子页面（模糊需求、反馈等）。
- FuzzyRequest.jsx：“规则配置助手”，调用 Chatbot 组件（title=0），处理“模糊需求/要看什么不要看什么”对话。
- ProfileAlignment.jsx：“对齐”，调用 Chatbot 组件（title=1），用于画像对齐（目前组件命名为 FuzzyRequest 但 title=1）。
- Feedback.jsx：“查看工具操作”，调用 Chatbot 组件（title=2），用于收集用户反馈或改进意见。
- EmptyPage.jsx：占位空页面（备用）。
- Profile/Profile.jsx："已定义的规则"（我的对抗规则），个人规则管理页面，读取/存储浏览器本地 profiles，支持新增、编辑、删除规则并同步后端；含弹窗确认与平台/激活状态选择。
    - Profile/Profile.css：上述规则管理页的样式定义。
