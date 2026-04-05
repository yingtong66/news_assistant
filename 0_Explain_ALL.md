# @lyt update
后端（Django，目录 agent/ + PersonaBuddy/）

提供业务接口：/browse（过滤/评估推荐卡片）、/click（记录点击）、/chatbot 系列（聊天对话）、/save_rules（保存规则）、/save_search（记录搜索）、/record_user（上传本地规则）。
views.py 里处理会话、规则、画像；模型定义在 models.py。prompt/ 里是提示词和匹配逻辑，用于生成 bot 回复和行动建议。
前端 React（目录 my-profile-buddy-frontend/src/）

UI：App.js 定义路由与开关；pages/ 下各页面通过 Chatbot 组件与后端对话（/chatbot、/get_alignment、/get_feedback 等）。
规则管理：Profile.jsx 读取/写入浏览器存储 profiles，并调用 /save_rules 同步后端；开关时通过 /record_user 上传规则。
聊天：Chatbot.jsx 发送用户消息到 /chatbot，接收 bot 回复；若后端返回需执行的规则变更/搜索动作，弹出 ChangeProfile 供用户确认并再回写 /save_rules、/save_search。
浏览器扩展脚本（目录 public/）

manifest.json 声明 content_script 和 background service worker。
zhihu.js：注入知乎/B站页面，采集推荐卡片（标题/摘要/URL）并向后端 /browse 发送，后端若判定需过滤则前端移除卡片；捕获点击事件上报 /click。
zhihu.js：作为 service worker 转发内容脚本的浏览/点击请求到后端；也可静默打开 URL 并关闭标签页（触发搜索等）。
数据流示例

用户在扩展首页点击开关：前端切换路由并把本地 profiles POST 到后端 /record_user。
用户浏览知乎推荐：内容脚本抓取卡片→POST /browse→后端返回是否过滤→前端移除或标记。点击时 POST /click。
用户在对话页提问：Chatbot 将输入 POST /chatbot→后端生成回复及可能的动作→前端展示回复；若有动作（新增/修改/删除规则或搜索），弹窗确认→前端调用 /save_rules、/save_search 并再请求 /make_new_message 更新对话。
整体联动：后端负责规则/画像/对话逻辑与过滤判定；React 端提供 UI、管理本地规则并与后端接口交互；内容脚本在目标站点实时采集行为数据，借助后台脚本将数据送往后端并据此调整页面展示。




# 项目结构说明

## 根目录
- README.md: 项目简要说明。
- requirements.txt: 后端依赖列表。
- manage.py: Django 管理入口（迁移、运行服务器等）。
- db.sqlite3: 本地开发用 SQLite 数据库。
- django_debug.log: Django 调试日志。
- eval_new.py / test.py / check_filter_item.py: 本地评估或测试脚本。
- restart.sh: 重启脚本。
- .venv/: Python 虚拟环境（可忽略）。
- agent/: Django 应用代码，包含业务模型、视图和提示词逻辑。
- PersonaBuddy/: Django 项目配置（settings、路由、WSGI/ASGI）。
- my-profile-buddy-frontend/: React 前端工程。

## 后端（agent/）
- admin.py / apps.py / urls.py: Django 应用注册与路由配置。
- models.py: 业务模型定义（记录、规则、人格等）。
- views.py: 主要的接口逻辑。
- utils.py / rah.py / profile_lib.py / const.py: 工具函数、筛选/分析逻辑。
- stopwords.txt: 停用词表。
- migrations/: 数据库迁移文件。
- prompt/: 提示词与样例数据
  - alignment.py / filter.py / fuzzy.py / feedback.py / prompt_utils.py: 提示词构建与匹配逻辑。
  - api.json: 接口描述。
  - data/: 示例数据（test_example.json）。
  - personal/: 个性化示例（person.json）。

## 项目配置（PersonaBuddy/）
- settings.py: 项目配置（数据库、应用、静态文件等）。
- urls.py: 全局 URL 路由。
- asgi.py / wsgi.py: 部署入口。ASGI 支持异步与多协议，WSGI 只支持同步 HTTP。部署时选哪个入口取决于你用的服务器和是否需要 WebSocket/异步能力。

## 前端（my-profile-buddy-frontend/）
- package.json / package-lock.json: 前端依赖与脚本。
- public/: 静态资源与 HTML 模板
  - index.html: 应用入口 HTML。
  - manifest.json / robots.txt。
  - background/、contents/、icons/: 静态图标与背景资源。
- src/: React 源码
  - App.js / App.css / index.js / index.css / reportWebVitals.js / setupTests.js: 入口与全局配置。

  - components/
    - Chatbot/: 聊天组件（Chatbot.jsx、SessionList.jsx、ChatHeader.jsx 及样式）。
  - pages/
    - Home.jsx、FuzzyRequest.jsx、Feedback.jsx、ProfileAlignment.jsx、EmptyPage.jsx。
    - Profile/: 个人档案页面（Profile.jsx、Profile.css）。
  - utils/
    - Const.js: 前端常量配置。
    - Chrome/: 浏览器存储工具（getItem.js、setItem.js）。
  - images/: 前端使用的图片资源。
- build/: 已构建的静态文件（生产打包输出）。
- node_modules/: 前端依赖库缓存。
