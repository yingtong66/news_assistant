# PersonaBuddy

浏览器插件 + Web应用，用于个性化推荐内容过滤（知乎/B站/头条）。当前重点测试头条平台效果，其他平台可暂不关注。

## 架构

三层结构:
- **Django 后端** (`agent/` + `PersonaBuddy/`): REST API，处理过滤判定、聊天对话、规则/画像管理。SQLite 开发数据库。
- **React 前端** (`my-profile-buddy-frontend/`): 用户界面，包含聊天组件、规则管理页面、路由。使用 antd UI 库。前端 proxy 到 `localhost:8000`。
- **浏览器扩展脚本** (`my-profile-buddy-frontend/public/`): content_script 注入知乎/B站/头条页面，采集推荐卡片并过滤；background service worker 转发请求。manifest.json 已配置 toutiao.com 匹配。
- **online_TwoStage** (`online_TwoStage/`): 两阶段重排模块。`/reorder` 接口调用此模块，基于用户 Rule 规则调 LLM 过滤 + 重排候选卡片。

## 关键接口

- `/browse` - 过滤/评估推荐卡片
- `/click` - 记录点击
- `/reorder` - LLM 两阶段重排（过滤 + 排序）
- `/chatbot` - 聊天对话
- `/save_rules` - 保存规则
- `/save_search` - 记录搜索
- `/record_user` - 上传本地规则

## 技术栈

- 后端: Django 5+, Python 3.11, dashscope (通义千问API), jieba, dgl
- 前端: React 18, antd 5, react-router-dom 6, react-markdown, Node 20+
- LLM: 通义千问 (qwen-turbo/qwen-max)，配置在 `agent/prompt/api.json`

## 本地运行

Python 虚拟环境位于 `.venv/`（从 PersonaBuddy-master 迁移，Python 3.11.15）。

```bash
# 后端
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver  # localhost:8000

# 前端
cd my-profile-buddy-frontend
npm install
npm start  # localhost:3000, proxy -> 8000
```

## 关键文件

- `agent/views.py` - 后端主要接口逻辑
- `agent/models.py` - 数据模型
- `agent/prompt/` - 提示词与匹配逻辑
- `agent/prompt/api.json` - LLM API 配置
- `my-profile-buddy-frontend/src/App.js` - 前端路由入口
- `my-profile-buddy-frontend/src/components/Chatbot/` - 聊天组件
- `my-profile-buddy-frontend/src/pages/Profile/` - 规则管理页
- `my-profile-buddy-frontend/public/manifest.json` - 浏览器扩展配置（含头条支持）
- `my-profile-buddy-frontend/public/contents/zhihu.js` - 内容注入脚本
- `online_TwoStage/pipeline.py` - 两阶段重排主流程（过滤+重排）
- `online_TwoStage/prompts.py` - 过滤/重排 prompt 常量
- `PersonaBuddy/settings.py` - Django 配置
- `toutiao.html` - 头条页面参考/测试文件
