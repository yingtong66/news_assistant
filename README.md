# news_assistant

浏览器插件 + Web 应用，基于用户规则和历史偏好对推荐内容进行 LLM 过滤与重排（知乎/B站/头条）。当前重点测试头条平台。

## 系统架构

```
浏览器扩展 (content_script)
    ↓ 上报曝光 /browse、点击 /click
    ↓ 请求重排 /reorder
Django 后端
    ├── online_TwoStage/pipeline.py   两阶段重排（LLM 过滤 + 重排）
    ├── online_TwoStage/unit_interpret/  历史偏好解析（长短期 + 正负向）
    ├── online_TwoStage/unit_controll/   引导对话（冷/温启动）
    └── agent/prompt/fuzzy.py         规则生成（意图识别 → 规则 actions）
React 前端 (localhost:3000)
    └── Dashboard：历史偏好 + 引导对话 + 规则列表
```

## 运行

### 后端 (Django, localhost:8000)

```bash
cd /Users/xinzijie/科研/小猪毕设/news_code_lyt

# 激活虚拟环境（注意 macOS 可能有 alias python=python3.13 覆盖 venv，用绝对路径更保险）
source .venv/bin/activate

# 首次或模型变更后执行
.venv/bin/python manage.py migrate

# 启动
.venv/bin/python manage.py runserver  # localhost:8000
```

LLM API 配置在 `agent/prompt/api.json`，需填入通义千问 API key。

### 前端 build（浏览器扩展）

```bash
cd /Users/xinzijie/科研/小猪毕设/news_code_lyt/my-profile-buddy-frontend

npm install   # 首次执行
npm run build # 生成 build/ 目录
```

### 加载浏览器扩展

1. Chrome -> `chrome://extensions/` -> 开启开发者模式
2. "加载已解压的扩展程序" -> 选择 `my-profile-buddy-frontend/build/` 目录
3. 已有扩展时点刷新按钮即可更新
4. 打开头条/知乎/B站页面验证效果

> 后端必须先启动，扩展才能正常工作。

## API 配置

`agent/prompt/api.json`:

```json
{
    "bailian": {
        "api": "sk-xxx",
        "model": "qwen-turbo",
        "dialog": "qwen-max"
    },
    "rah": {
        "update_interval_min": 15
    }
}
```

## 核心流程

### 1. 内容过滤与重排（/reorder）

用户在头条刷新时，扩展采集候选卡片列表发给 `/reorder`：

```
候选卡片列表
    ↓
阶段1（过滤）：LLM 按用户"我不想看xx"规则移除不符合内容
    ↓
阶段2（重排）：LLM 按用户"我想看xx"规则将匹配内容排前
    ↓
返回排序后的 id 列表
```

实现：`online_TwoStage/pipeline.py`

### 2. 历史偏好解析（unit_interpret）

每次打开插件时，基于历史交互记录生成结构化偏好总结：

```
正样本（click=True）+ 负样本（click=False，最近20条）
    ↓
长期偏好解析（全量正样本）
    ↓
短期偏好解析（最近5条正样本）
    ↓
画像总结 → {positive_group: [...], negative_group: [...]}
    ↓
写入 Personalities 缓存（有新浏览记录才重新运行）
```

实现：`online_TwoStage/unit_interpret/`

### 3. 引导对话（/guided_chat）

打开插件时基于历史偏好生成个性化引导语，引导用户配置规则：

```
GET /guided_chat/start
    → 读取/刷新 Personalities 偏好缓存
    → 生成"根据您历史浏览，您对xx感兴趣，请问..."
    ↓ 用户回复
POST /guided_chat/summarize
    → get_fuzzy() 识别意图，生成规则建议 actions
    → 弹窗供用户确认
```

强制刷新：`GET /guided_chat/refresh`（清除缓存，重新运行三步 LLM）

## 接口列表

| 接口 | 方法 | 说明 |
|------|------|------|
| `/browse` | POST | 上报曝光卡片，记录 Record |
| `/click` | POST | 上报点击行为 |
| `/reorder` | POST | 两阶段重排，返回排序后 id 列表 |
| `/chatbot` | POST | 普通对话，生成规则建议 |
| `/guided_chat/start` | GET | 打开插件时获取引导语（含偏好刷新） |
| `/guided_chat/refresh` | GET | 强制重新运行历史偏好解析 |
| `/guided_chat/summarize` | POST | 用户回答引导语后生成规则建议 |
| `/save_rules` | POST | 新增/更新/删除规则 |
| `/get_rules` | GET | 获取用户当前规则列表 |
| `/get_alignment` | POST | 获取用户偏好摘要（旧版，供 Dashboard 标签展示用） |
| `/make_new_message` | POST | 用户确认规则后续对话 |
| `/record_user` | POST | 上传本地规则到后端 |

## 项目目录结构

### 后端核心

#### `agent/`
Django app，后端主体。

| 文件 | 说明 |
|------|------|
| `views.py` | 所有 REST API 接口逻辑 |
| `models.py` | 数据库模型（Record、Rule、Session、Message、Personalities 等） |
| `urls.py` | 路由注册 |
| `rah.py` | RAH 模块：networkx + PageRank 建模点击偏好，APScheduler 定时调度 |
| `const.py` | 后端常量（PLATFORM_CHOICES 等） |

`agent/prompt/` — LLM 调用相关：

| 文件 | 说明 |
|------|------|
| `fuzzy.py` | 核心规则生成：意图识别 → 规则 actions（新增/更新/删除） |
| `filter.py` | 单条内容过滤判定 |
| `alignment.py` | 旧版偏好摘要 prompt |
| `prompt_utils.py` | LLM API 封装（`get_bailian_response`） |
| `api.json` | API key / model 配置 |

#### `news_assistant/`
Django 项目配置层（`settings.py`、`urls.py`）。

### 推荐/重排模块

#### `online_TwoStage/`
在线两阶段重排，对应 `/reorder` 接口。

| 路径 | 说明 |
|------|------|
| `pipeline.py` | 主流程：LLM 过滤 + 重排，`run_two_stage_reorder()` |
| `prompts.py` | 过滤/重排 prompt 常量 |
| `unit_interpret/interpret.py` | 历史偏好解析：`run_unit_interpret(pid, platform)` |
| `unit_interpret/prompts.py` | 长期/短期偏好解析 + 画像总结 prompt |
| `unit_controll/dialog.py` | 引导问题生成：`get_guidance_question(preference_summary)` |
| `unit_controll/prompts.py` | 冷启动模板 / 温启动 prompt |

#### `offline_TwoStage/`
离线实验/评估用的两阶段流程，不参与线上服务。
- `main.py` / `src/` — 离线批量运行脚本
- `two_stage_pic.png` — 系统架构图（参考设计来源）

### 脚本 / 工具文件

| 文件 | 用途 |
|------|------|
| `manage.py` | Django 管理命令入口 |
| `requirements.txt` | Python 依赖 |
| `restart.sh` | 快速重启后端脚本 |
| `toutiao.html` | 头条页面本地快照，用于调试 content_script |
| `db.sqlite3` | 本地 SQLite 开发数据库 |

---

## 前端文件结构 (my-profile-buddy-frontend/src/)

### 入口
- `index.js` — React 挂载点
- `App.js` — 路由定义 + 插件开关逻辑

### pages/（页面）

| 文件 | 路由 | 说明 |
|------|------|------|
| `Dashboard.jsx` | `/home` | **主入口**：历史偏好（正/负分区）+ 引导对话 + 规则列表 |
| `ProfileAlignment.jsx` | `/alignment` | 画像对齐对话（Chatbot title=1） |
| `Feedback.jsx` | `/feedback` | 反馈对话（Chatbot title=2） |
| `Profile/Profile.jsx` | `/profile` | 独立规则管理页 |
| `EmptyPage.jsx` | `/` | 插件关闭时占位页 |

### components/（组件）

| 文件 | 说明 |
|------|------|
| `Chatbot/Chatbot.jsx` | 多 session 聊天组件，供 `/alignment`、`/feedback` 复用 |
| `Chatbot/ChatHeader.jsx` | 聊天页顶部栏 |
| `Chatbot/SessionList.jsx` | 历史会话列表抽屉 |
| `ChangeProfile.jsx` | 规则确认弹窗：LLM 建议 → 用户确认 → 写入规则库 |
| `StartButtion.jsx` | 插件顶部 On/Off 开关 |

### utils/

| 文件 | 说明 |
|------|------|
| `Const.js` | 全局常量：`backendUrl`、`userPid`、`platformOptions`、`taskOptions` |
| `Chrome/getItem.js` | 从 `chrome.storage.sync` 读数据（非插件环境降级到 localStorage） |
| `Chrome/setItem.js` | 向 `chrome.storage.sync` 写数据（同上） |

## References

- [DEVLOG.md](./DEVLOG.md) - 开发日志
- [CLAUDE.md](./CLAUDE.md) - 项目架构与关键文件索引（供 Claude 使用）
