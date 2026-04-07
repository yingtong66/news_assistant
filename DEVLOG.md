# DEVLOG

## 2026-04-08 废弃 RAH 偏好对齐 + reorder 批量写入浏览记录

### 废弃 get_alignment
- 注释掉 `views.py` 的 `get_alignment` 函数和 `alignment` 模块 import
- 注释掉 `urls.py` 的 `/get_alignment` 路由
- 该功能已由 `guided_chat/start` + `unit_interpret` 替代，`alignment.py` 文件保留备参考

### 浏览记录改由 /reorder 批量写入
- 之前 `/browse` 请求被注释掉后，Record 表不再有浏览记录，导致点击记录也失效
- 在 `views.py` 的 `reorder` 函数中，重排前批量 `Record.objects.create()` 写入这批卡片的浏览记录
- 前端 `zhihu.js` 的 `processElement` 不再发送任何后端请求，只负责提取标题

## 2026-04-07 头条页面非图文元素清理

- `zhihu.js` 新增 `cleanToutiaoNonArticles()` 函数，删除头条页面中所有非图文元素：
  - `.right-container` (右侧栏：热搜榜、安全课堂、热门视频)
  - `.home-banner-wrapper` (要闻 banner)
  - `.main-nav-wrapper` (导航栏)
  - `.feed-five-wrapper` (五条推荐区块)
  - `.fix-header` (固定顶栏)
  - `.header-right` / `.search-container` (搜索区域)
  - `.feed-card-video-wrapper` (小视频卡片)
  - `.feed-card-wtt-wrapper` (微头条/动态卡片)
  - `.feed-card-wrapper:not(.feed-card-article-wrapper)` (兜底：所有非图文卡片)
- 在页面初始加载和每批重排完成后调用
- MutationObserver 中新增动态拦截：新插入的非图文卡片(`.feed-card-wrapper:not(.feed-card-article-wrapper)`)立即删除，防止动态加载的视频/微头条逃脱清理

## 2026-04-07 前端适配过滤条目移除

- 后端 `pipeline.py` 改为过滤条目不返回后，`order.length < liveNodes.length`，前端 `zhihu.js` 的 `order.length !== liveNodes.length` 严格校验导致重排完全不执行
- 修复：去掉长度严格相等校验，改为 `order.length === 0` 时才放弃
- order 中没出现的 id 对应的卡片 `display:none` 隐藏，不再展示在页面上
- 保留的卡片按 order 顺序重新插入

## 2026-04-07 去掉规则卡片的平台选择下拉框

- 当前只需要头条平台，移除规则卡片上的平台 Select 下拉框
- `Dashboard.jsx`: 删除平台 Select、移除 `platformOptions` import 和 `handlePlatformChange`
- `Profile.jsx`: 同上
- 新建规则 platform 默认为 0（头条），不受影响

## 2026-04-07 历史偏好区增加折叠/展开功能

- `Dashboard.jsx` 的 `HistoryPreference` 组件新增 `collapsed` state，点击标题可折叠/展开
- 折叠时隐藏偏好标签和刷新按钮，只保留标题行，节省纵向空间
- 标题右侧显示 `DownOutlined`/`UpOutlined` 箭头图标指示当前状态
- 新增 import `DownOutlined, UpOutlined` from `@ant-design/icons`

## 2026-04-07 过滤条目不再展示

- `online_TwoStage/pipeline.py`: 被 removed_list 过滤掉的条目不再追加到 final_order 末尾，直接从返回结果中移除
- 之前: `final_order = rerank_order + removed_order`，过滤的排到组内最后
- 现在: `final_order = rerank_order`，过滤的彻底不展示
- 日志仍记录被过滤条目，方便排查

## 2026-04-07 UI 调整：去掉顶部黑色标题 + 开关按钮迁移 + 头条非图文元素清理

### manifest.json 清理
- 删除 `_comments` 字段，消除 Chrome "Unrecognized manifest key '_comments'" 警告

### 去掉顶部黑色 "Hi, xxx! Let's Go~" 模块
- `StartButtion.jsx`：开启状态下返回 null，不再渲染黑色标题栏；关闭状态下只显示"点击开启推荐助手"文字 + Off 开关按钮
- `Dashboard.jsx`：蓝色标题行改为 flex 布局，右侧放置 On/Off 开关按钮（从 StartButton 迁入）
- `App.js`：把 `isOpen` 和 `openBuddy` 作为 props 传给 Dashboard

### 头条页面非图文元素自动清理
- `zhihu.js` 新增 `cleanToutiaoNonArticles()` 函数，重排后自动删除：
  - `.ttp-feed-module` 容器内非 `feed-card-article-wrapper` 的子元素
  - 顶部要闻 banner (`.home-banner-wrapper`)
  - 安全课堂 (`.security-course-wrapper`)
  - 右侧热搜榜 (`.home-hotboard`)
  - 顶部导航栏 (`.main-nav-wrapper`)
  - 五条推荐区块 (`.feed-five-wrapper`)
- 在两个时机调用：页面初始加载时、每批重排完成后

## 2026-04-07 用户 UID 注册/登录功能

### 背景
原来 `userPid` 硬编码为 `"Hsyy04"`，多用户测试时需要每次手动改代码。目标：首次使用弹出注册页让用户输入用户名，之后自动登录。

### 实现方案
- 新建 `src/contexts/UserContext.js`：React Context，全局传递 `userPid`
- 新建 `src/pages/RegisterPage.jsx`：首次使用的注册界面（输入框 + 确认按钮，无密码）
- `App.js` 顶层用 `await getItem('userPid', null)` 读取 storage；无值则渲染注册页，注册完成后存入 `chrome.storage.sync` 并跳转 `/home`
- 5 个组件（`StartButton`、`Dashboard`、`ChangeProfile`、`Profile`、`Chatbot`）改为 `useContext(UserContext)` 读取 pid，不再从 `Const.js` import
- `public/contents/zhihu.js` 改为 `chrome.storage.sync.get("userPid", ...)` 异步读取

### 数据持久化说明
- pid 存在 `chrome.storage.sync`，浏览器关闭后保留，重启自动登录
- 卸载重装插件后 storage 清空，重新输入同一 uid 即可找回后端所有数据（数据在 SQLite，不受前端影响）
- Django 管理面板"用户"是 Django auth 系统，与业务 pid 无关；pid 数据在 AGENT 下的规则/记录等表中查找

### 删除旧 uid 方法
在 background service worker 控制台执行：
```js
chrome.storage.sync.remove('userPid', () => console.log('done'))
```

### 调试过程中遇到的 bug 及修复

**1. personalities 不是字符串导致崩溃**
- 新用户后端返回 `personalities: null`（Python None → JSON null），JS 的 `|| ''` 对 `null` 有效，但 `[]`/`{}` 是 truthy 会绕过
- `Dashboard.jsx` 的 `.split('\n')` 对非字符串抛 `TypeError: t.split is not a function`，React 渲染阶段崩溃变白屏
- 修复：`typeof p === 'string' ? p : ''`，两处（初始加载 + 刷新按钮）均修复

**2. 注册完成后显示空白页**
- 注册后 `isOpen` 默认 `false`，路由停在 `/`（EmptyPage），用户误以为闪退
- 修复：`onRegister` 回调里同时设 `isOpen=true` 并 `navigate("/home")`

**3. 注册页宽度异常**
- 注册页提前 return，绕过了 `App.js` 里 `width:750px` 的容器
- 修复：RegisterPage 自身 div 加 `width: 750`

### LLM 调用 timeout 优化
- `agent/prompt/prompt_utils.py` 的 `dashscope.Generation.call()` 原来没有 timeout
- DNS 解析失败时系统级超时约 20-30 秒才报错，导致总耗时 57 秒
- 修复：所有 `Generation.call()` 加 `timeout=10`，失败快速重试

## 2026-04-07 数据库迁移

- 执行 `python manage.py makemigrations` + `migrate`，应用 `0023_alter_chilog_platform_...` 迁移（platform 字段变更）

## 2026-04-07 后端响应计时日志

- `agent/views.py` 在 `dialogue()` 和 `guided_chat_summarize()` 入口加 `t_start = time.time()`
- 函数返回前输出 `[Dialogue] 总耗时 Xs | pid=... | 输入: ...` 日志，方便测量用户输入到回复的端到端耗时

## 2026-04-07 README 目录结构补充

- README.md 新增"项目目录结构"章节，记录各文件夹作用（agent/、news_assistant/、online_TwoStage/、offline_TwoStage/、my-profile-buddy-frontend/、scripts/）

## 2026-04-06 历史偏好模块：unit_interpret 接入引导流程

### 新增 online_TwoStage/unit_interpret/ 模块

参考 `offline_TwoStage/src/unit_interpret.py`，在 online 侧实现用户历史画像解释模块。

**数据来源（与 offline 的差异）：**
- 正样本：`Record.objects.filter(click=True)` — 点击过的记录（时间正序）
- 负样本：`Record.objects.filter(click=False)` 最近 `max_neg=20` 条（曝光未点击）

**三步流程（与 offline 一致）：**
1. 全量正样本 → `LONG_TERM_PARSER_PROMPT` → 长期偏好
2. 最近 5 条正样本 → `SHORT_TERM_PARSER_PROMPT` → 短期偏好
3. 长期 + 短期 + 负样本 → `HISTORY_SUMMARY_PROMPT` → JSON `{positive_group, negative_group}`

**LLM 调用**：复用 `agent/prompt/prompt_utils.get_bailian_response()`（dashscope/qwen），Prompt 使用纯字符串 `.format()` 风格（与 online 现有风格一致）。

**新增文件：**
- `online_TwoStage/unit_interpret/__init__.py`
- `online_TwoStage/unit_interpret/prompts.py`：三条 prompt 常量
- `online_TwoStage/unit_interpret/interpret.py`：`run_unit_interpret(pid, platform, max_neg=20)`

### 接入 guided_chat_start（agent/views.py）

**修改 `guided_chat_start()`**：

旧逻辑：直接读 `Personalities.personality` 字段传给引导语生成函数。

新逻辑：
1. 查 `Personalities.update_time` 与最新 `Record.browse_time` 对比
2. 有新数据 → 调 `run_unit_interpret()` → 格式化正/负偏好写回 `Personalities.personality`
3. 无新数据 → 直接用缓存，避免重复调 3 次 LLM
4. 传给 `get_guidance_question()` 生成个性化引导语

**新增接口 `GET /guided_chat/refresh`**：强制清除 `Personalities` 缓存，重新运行三步 LLM，返回新引导语。注册路由 `guided_chat/refresh`。

### 前端：Dashboard 历史偏好区刷新按钮

**Dashboard.jsx 改动：**
- `HistoryPreference` 组件新增 `onRefresh` prop，标题行右侧加 `ReloadOutlined` 图标按钮（hover tooltip：重新分析历史偏好）
- 新增 `refreshPreference()` 函数：调 `/guided_chat/refresh` → 更新偏好标签 + 重置聊天引导语
- 偏好标签解析改为只取 `- ` 开头的行，避免标题行变成 tag

### 前端：历史偏好区 UI 重新设计

**HistoryPreference 组件重构：**
- 正向/负向偏好分区上下展示（`flex-direction: column`）
- 正向偏好：蓝色小标题 + 蓝色 Tag
- 负向偏好：红色小标题 + 红色 Tag
- 无内容时各区显示"暂无"；完全无数据时显示默认提示文案



### 修复5：对话显示规则与已有规则不一致
- 问题：`guided_chat_summarize` 的无 actions 分支重新调 `get_common_response(chat_history)`，未传规则上下文，LLM 回复"过滤规则：暂无"，与实际规则不符
- 修复：直接使用 `get_fuzzy` 返回的 `response`（其 else 分支内部已将规则拼入上下文再调 LLM），去掉多余的 `get_common_response` import


### 修复1：guided_chat_summarize 缺少 Session，make_new_message 报错
- 问题：`/guided_chat/summarize` 没有创建 Session，`nowsid` 始终为 `-1`，用户确认规则后 `/make_new_message` 找不到会话报错
- 修复：`guided_chat_summarize` 创建 Session 并保存引导轮两条消息（bot 问 + 用户回），返回 `sid`；`GenContentlog` 关联 `from_which_session`；前端收到 `sid` 后更新 `nowsid`（Dashboard + Chatbot 均修改）

### 修复2：规则栏与对话显示的规则不一致
- 问题：右侧规则栏从 `chrome.storage` 读，对话从后端 DB 读，两处数据源不同步导致显示不一致
- 修复：新增后端接口 `GET /get_rules?pid=&platform=`，返回后端 DB 中该用户的所有规则；Dashboard `loadRules` 改为从后端读，读完后同步写回 `chrome.storage`；注册路由 `get_rules`

### 修复3：规则确认后右侧规则栏不刷新
- 问题：`ChangeProfile` 确认规则后更新了 `chrome.storage`，但 Dashboard 的规则状态只在挂载时读一次，不会自动刷新
- 修复：`ChangeProfile` 新增可选 `onRulesChange` 回调，`saveFunc` 完成后触发；Dashboard 传入 `onRulesChange={loadRules}`

### 修复4：第一次问"有哪些规则"报错，第二次才正常
- 问题：引导模式下首条消息都走 `/guided_chat/summarize`，"我现在有哪些规则"不含偏好表达，`get_fuzzy` 返回空 actions，前端直接显示"未检测到明确偏好需求"
- 修复：后端 actions 为空时调 `get_common_response` 正常回复，返回 `content` 字段；前端收到无 actions 的回复时正常展示内容，**不清空 `guidanceQuestion`**（保持引导状态），只有确认有 actions 时才清空引导状态；`views.py` 新增 `get_common_response` import

### 引导语优化
- 修改 `GUIDANCE_WARM_PROMPT`：原来只生成引导问句，改为先说明"根据您的历史浏览，发现您对xxx感兴趣"，再提引导问题，两部分合一，总长度不超过80字

## 2026-04-06 前端废弃文件清理

- 删除 `pages/Home.jsx`（旧菜单导航，已被 Dashboard 替代）
- 删除 `pages/FuzzyRequest.jsx`（title=0 聊天入口，功能已迁入 Dashboard）
- 删除 `components/ChromeHeader.jsx`（无任何页面引用）
- `App.js` 移除对应 import 和 `/fuzzy` 路由，注释同步更新
- `Profile.jsx` 移除 `ChromeHeader` import，改用 `Typography.Title`

## 2026-04-06 Dashboard 对话逻辑改造

- 每次打开 Dashboard 不再加载历史 session，直接清空聊天区调 `/guided_chat/start` 输出引导问句
- 新增 `guidanceQuestion` 状态：非空时用户回复走 `/guided_chat/summarize`，有 actions 时才清空，后续恢复普通 `/chatbot`
- 同步修改 `Chatbot.jsx`（`title=0` 逻辑保持一致）



### 新增 guided dialog 模块

参考 offline_TwoStage 的用户需求可控性模块，在 `online_TwoStage/unit_controll/` 下实现需求引导对话，复用 `agent/prompt/fuzzy.py` 的规则生成逻辑。

**新增文件：**
- `online_TwoStage/unit_controll/__init__.py`
- `online_TwoStage/unit_controll/prompts.py`：冷启动模板句 `GUIDANCE_COLD_TEMPLATE` + 个性化引导 `GUIDANCE_WARM_PROMPT`
- `online_TwoStage/unit_controll/dialog.py`：`get_guidance_question(preference_summary)` — 有偏好时 LLM 生成引导问句，无偏好时返回固定模板句

**新增后端接口（`agent/views.py` + `agent/urls.py`）：**
- `GET /guided_chat/start?pid=&platform=`：读取 `Personalities.personality` 作为偏好摘要，返回 `{guidance_question, has_preference}`
- `POST /guided_chat/summarize`：接收 `{pid, platform, guidance_question, user_response}`，构造单轮对话历史，直接调 `get_fuzzy()` 生成规则建议，创建 `GenContentlog`（`is_ac=False`），返回 `{actions}`，格式与 `/chatbot` 完全一致

**流程：**
1. 进入 `/fuzzy` 页面 → 调 `/guided_chat/start` 展示引导问句
2. 用户输入澄清需求 → 调 `/guided_chat/summarize` → 返回 actions
3. 弹出已有确认弹窗 → 用户确认 → 走现有 `save_rules` / `make_new_message` 流程

### 前端对接 (Chatbot.jsx)

- 新增 `guidanceQuestion` 状态，非空时标志处于引导模式
- 初始化和 `addSession`（`title=0`）：把 `/get_alignment` 替换为 `/guided_chat/start`
- `sendMessage` 新增引导模式分支：`guidanceQuestion` 非空时走 `/guided_chat/summarize`，成功后清空引导状态；若 actions 为空则提示用户重新描述；之后恢复普通 `/chatbot` 模式

### 删除多余文档

删除根目录下由历史 Claude 会话生成的 4 个冗余 txt 文档：`API_SUMMARY.txt`、`API_VISUAL_OVERVIEW.txt`、`QUICK_REFERENCE.txt`、`API_CHEATSHEET.txt`，符合"每个项目只保留 README.md 和 DEVLOG.md"原则。

## 2026-04-06 前端全面重构：三栏 Dashboard 布局

### 新增 Dashboard.jsx
- 新建 `my-profile-buddy-frontend/src/pages/Dashboard.jsx`，替代原 Home.jsx 的菜单导航。
- 布局：顶部标题栏 + 左列（历史偏好+聊天框）+ 右列（规则列表），宽 750px，高 600px，`overflow:hidden`。
- 历史偏好区：挂载时调 `/get_alignment`，有数据展示蓝色 Tag 标签，无数据显示默认提示"暂时还没有足够的浏览记录，继续使用后我会逐渐了解你的偏好～"。
- 聊天区：复用原 Chatbot.jsx 核心逻辑，去掉 SessionList（单 session），保留 ChangeProfile 弹窗。
- 规则列表：复用 ProfileCard 增删改逻辑，右列独立滚动。

### 修改 App.js
- `/home` 路由从 `Home` 改为 `Dashboard`。
- 容器宽度从 400px 扩大到 750px。

### 修复 chrome.storage 非插件环境报错
- `getItem.js` / `setItem.js` 加 fallback：非插件环境降级到 `localStorage`，解决 `localhost:3000` 调试时 `chrome.storage` 不存在的报错。
- `App.js` 的 `chrome.storage.sync.set` 加 `chrome.storage &&` 保护。

### 布局滚动条修复
- 外层容器加 `overflow:hidden`，高度从 `100vh` 改为写死 `600px`（Chrome popup 上限），消除最外层多余滚动条。
- `index.css` 的 body 加 `overflow:hidden`，禁止页面级滚动。
- 聊天消息区和规则列表区各自内部独立滚动。

### 清理多余文档
- 删除 Explore agent 自动生成的 20 个多余 md 文件（违反全局规则：每个项目只能有 README.md 和 DEVLOG.md）。



2. 对话函数，根据对话历史生成下一条
3. 重排序和过滤函数，api根据对话

## 2026-04-05 项目重命名 + prompt 修正 + make_new_message 调试

### 项目重命名: PersonaBuddy -> news_assistant
- 目录 `PersonaBuddy/` 重命名为 `news_assistant/`。
- 所有文件中的 `PersonaBuddy` 引用替换为 `news_assistant`（manage.py, settings.py, wsgi.py, asgi.py, urls.py, rah.py, check_filter_item.py, eval_new.py, manifest.json, CLAUDE.md, README.md, 0_Explain_ALL.md, DEVLOG.md）。

### 过滤/重排 prompt 修正 (`online_TwoStage/prompts.py`)
- 过滤 prompt: "只要沾边就移除，宁可多过滤" 改为 "主题必须直接属于规则类别才移除，不确定时保留"。增加示例说明（如"体育规则不该移除碰巧提到运动员的政治新闻"）。修复军事新闻被"不想看体育"误杀的问题。
- 重排 prompt: "按相关性排序，不相关排末尾" 改为 "只有明确匹配偏好的才提前，其余保持原序；无匹配时完全保持原序"。修复候选中无科技新闻时 LLM 把军事/政治排前面的问题。

### pipeline.py 日志增强
- rerank_list 前输出正向规则，removed_list 前输出负向规则，方便对照验证。

### HAS_ACTION_PROMPT 修复 (`agent/prompt/fuzzy.py`)
- 从"根据对话内容"改为"请你仅根据用户最后一条消息来判断"。修复 LLM 重复分析历史轮次已处理的偏好（如之前加过的"我想看科技新闻"）。

### REPONSE prompt 重写 (`agent/prompt/prompt_utils.py`)
- 从窄定位"探索用户不愿意看什么内容"改为通用助手角色：处理规则查询、闲聊、功能引导。修复用户问"我现在有哪些规则"时仍回复"您还希望过滤哪些类型的内容呢？"的问题。

### make_new_message 调试
- 点击弹窗确认后消息不显示。排查发现 `/make_new_message` 返回 FAILURE（26字节），session 查询失败。添加 `[make_new_message]` 错误日志输出 sid/pid/platform，待进一步确认原因。

## 2026-04-05 对话函数支持正向规则生成 + 日志简化 + 规则查询

### 正向规则生成 (`agent/prompt/fuzzy.py`)
- 新增 `CHANGE_POSITIVE_RULES_PROMPT` + `get_change_positive_rules()`: 与负向规则的 `CHANGE_RULES_PROMPT` 对称，生成"我想看xx"格式的正向规则。
- 重写 `has_likes` 分支为两步:
  - Step A (矛盾处理): 只传 negative 子集给 `get_contradiction_rules`，独立 histories_neg。
  - Step B (正向规则): 有已有正向规则时走 `get_change_positive_rules`；没有时直接从 needs 转换新增。
  - 合并两步 actions 返回。
- `has_dislikes` 分支不变。

### 规则查询支持
- `get_fuzzy` 的 `else` 分支(无明确偏好意图)：将 `rules_str` 拼入 `get_common_response` 的上下文，LLM 能看到用户当前规则并格式化回复。用户问"我现在有哪些规则"可正确回答。

### 日志简化
- `fuzzy.py`: 去掉所有 `"******check xxx prompt********"` 和完整 histories dump，改为 `[Fuzzy]` 前缀的简洁 logger.info。
- `prompt_utils.py`: `get_common_response` 去掉 print，改为 `[CommonResponse]` 前缀日志。
- `views.py`: `dialogue` 函数在 `get_fuzzy` 返回后加 `[Dialogue]` 结果摘要日志(操作类型+内容)。

## 2026-04-05 重写过滤/重排 prompt + 平台编号调整 + 日志精简

### 参考 offline prompt 重写 online prompts.py
- 过滤 prompt：去掉"保守过滤"、"明确违反"、"70%保底"等约束，改为"只要与规则沾边或相关就移除，宁可多过滤不要漏掉"。增加 filtered_list 和 removed_list 不能重复的要求。
- 重排 prompt：明确"不是过滤器，不能删除"，不确定时保持原序，不相关条目排末尾。
- 参考了 `offline_TwoStage/prompt/filtering.yaml` 和 `reranking.yaml` 的结构和措辞。

### 平台编号调整：头条=0（默认）, 知乎=1, B站=2
- 后端 `agent/const.py` 的 `PLATFORM_CHOICES` 顺序改为 头条/知乎/B站。
- 前端 `Const.js` 的 `platformOptions` 同步调整。
- `zhihu.js` 中 setupClickListener (3处)、processElement 判断 (3处)、feedConfigs (3处) 共 9 处平台编号更新。
- 头条作为当前测试重点，设为默认值 0。

### pipeline.py 日志精简
- 注释掉过滤和重排两处 LLM 原始响应的完整打印（冗余，最终结果已有清晰输出）。
- 去掉过滤阶段逐条 "移除: id=x title=xxx" 的日志。
- 最终输出分 rerank_list 和 removed_list 两部分，带序号和标题，清晰展示结果。

### 修复 LLM 返回重复条目问题
- LLM 可能把同一条目同时放进 filtered_list 和 removed_list（如保留20+移除4=24条）。
- 在 `run_filtering` 中用 `removed_ids_set` 从 `filtered_list` 剔除重复。
- 在 `run_two_stage_reorder` 的兜底逻辑中，构建 `rerank_order` 时也排除 `removed_ids`，保证两部分互斥且并集为全部条目。

## 2026-04-05 生成 requirements.txt

- 用 `pip freeze` 导出当前 `.venv/` 虚拟环境的完整依赖到 `requirements.txt`，替换之前不完整的版本。

## 2026-04-05 统一走 /reorder 路径 + 正向规则支持 + 日志优化

### 禁用 /browse 逐条过滤，统一走 /reorder 批量两阶段重排
- `zhihu.js` 的 `processElement` 中 `/browse` 请求、`element.remove()` 删除逻辑、知乎"处理完了"标签全部注释掉（保留原代码）。
- 现在所有过滤+重排统一由 `/reorder` 接口的两阶段流程处理。

### 改善 pipeline.py 日志输出
- 去掉 LLM 响应 `[:500]` 截断，之前只能看到部分结果。
- 日志改为分阶段输出：`[TwoStage-过滤]` 显示规则内容和逐条移除详情，`[TwoStage-重排]` 显示偏好和输出条数，首尾有 `=== 开始/完成 ===` 标记。

### 去掉 70% 保底回退机制
- 注释掉 `pipeline.py` 中"过滤后数量 < 70% 则回退全量"的逻辑。实际场景中（如规则"不看政治"）头条 20 条里 14 条被过滤是正常的，回退会导致过滤完全失效。

### 前端 id 从 1 开始
- `zhihu.js` 的 `reorderNewNodes` 中 items 构造和 idToNode 映射从 `index` 改为 `index + 1`，后端收到的 id 从 "1" 到 "20"。

### 修复前端平台选项：微博 -> 头条
- `Const.js` 中 `platformOptions` 的 `value: 2` 对应 label 从"微博"改为"头条"，与后端 `PLATFORM_CHOICES[2] = ('头条', '头条')` 对齐。之前保存规则时 platform 传 0（知乎），导致 /reorder 查不到头条规则。

### 支持正向规则"我想看xx"
- `Profile.jsx` 和 `ChangeProfile.jsx` 的规则校验从只允许"我不想看"开头，放宽为"我不想看"或"我想看"开头。
- `pipeline.py` 的 `run_two_stage_reorder` 按前缀区分规则：`"我不想看..."` 进 `negative_group`（过滤阶段），`"我想看..."` 进 `positive_group`（重排阶段，让匹配内容排前面）。

## 2026-04-04 修复滚动加载过多问题

- 头条页面实际加载 40+ 条卡片，远超 20 条重排额度。
- 原因：三处独立滚动触发叠加——setupClickListener 无条件滚一次、checkAndLoadMore 守卫 25 条、scheduleSequentialReorder 重试循环独立滚 1-5 次。
- 修复: (1) 删掉 setupClickListener 中的无条件 `simulateSilentScrollToBottom()`；(2) checkAndLoadMore 守卫从 25 改为 20，去掉 gap 判断；(3) 重试循环总量守卫从 25 改为 20。
- 当前重点测试头条平台效果。

## 2026-04-03 实现基于 Rule 的 LLM 过滤 + 重排（online_TwoStage 第3部分）

- 新建 `online_TwoStage/` 包（`__init__.py`, `prompts.py`, `pipeline.py`），实现两阶段重排流程。
- 阶段1（过滤）: 查 `Rule` 表获取用户 active 规则作为 negative_group，调 LLM 判断哪些候选违反规则。保底机制：过滤后数量 < 70% 则回退全量。
- 阶段2（重排）: 调 LLM 按用户偏好对候选重新排序。positive_group 暂为空（等第1/2部分实现），无偏好时保持原序。
- 兜底逻辑: LLM 返回的 id 去重 + 补齐遗漏 + 被过滤的追加末尾，保证返回列表长度与输入一致。
- 修改 `agent/views.py` 的 `reorder` 函数，从首字母排序改为调用 `run_two_stage_reorder(pid, platform, items)`。
- 复用 `get_bailian_response` 调通义千问，`parse_json_from_response` 从 LLM 回复中提取 JSON（兼容 code block 和裸 JSON）。
- id 类型统一为 str，防止 LLM 返回整数导致兜底匹配失败。
- 前端无需改动，`requestReorder` 已传 pid/platform。
- 测试发现头条平台没有过滤日志——原因是 Rule 表只有知乎的规则，手动给头条加了测试规则后正常触发。
- `/browse` 接口的 WARNING（"由于没有配置规则"）来自旧 `filter.py` 逻辑，与 TwoStage 无关。

## 2026-04-03 头条自动加载修复 + 滚动限制
d
- 头条初始卡片只有 19 条，不足 20 条导致 reorder 永远不触发。
- 原因1: `simulateSilentScrollToBottom` 恢复延迟为 0ms，头条用 IntersectionObserver 检测不到瞬间滚动。改为 300ms。
- 原因2: `scheduleSequentialReorder` 不足 20 条直接 break。改为重试 5 次（每次滚动+等 800ms），用尽后有 2 条以上也排序。
- 发现无限滚动问题：`checkAndLoadMore` 的 gap 阈值 60 太大，不断触发加载到 120+ 条。加了总量上限 25 条，达到后停止加载。

## 2026-04-03 processElement 调用接入 + reorder 改为首字母排序

- 发现 `processElement` 已定义但未被调用，导致 `/browse` 请求从未发出，数据库无浏览记录，`/click` 也因查不到 Record 而 500。
- 在 `setupFeedObserver` 的初始卡片遍历和 MutationObserver 新卡片回调中加入 `processElement(node, platform)` 调用。
- `/click` 加了空值判断，查不到 Record 时返回失败而非崩溃。
- reorder 从 `random.shuffle` 改为按标题首字母排序：`extract_first_letter_for_sort` 提取首字母（中文用 pypinyin 转拼音），`reorder_by_first_letter` 返回排序后的 id 列表。新增依赖 pypinyin。

## 2026-04-03 前端扩展调通

- 修复 zhihu.js 第 21 行裸露中文 `用户的id` 语法错误（改为注释），此前导致 content_script 整个加载失败。
- 修复后 `npm run build` 并重新加载扩展，"原序" badge 和过滤功能均正常。
- reorder 逻辑需要凑满 20 个卡片才触发（`batch.length < 20` 时 break），初始卡片不足时不会重排，滚动加载更多后正常工作。
- 规则新增/过滤/重排 全链路已跑通。

## 2026-04-03 Django Admin 后台确认可用

- 创建了 superuser，访问 `http://127.0.0.1:8000/admin/` 进入 Django Admin 后台。
- Admin 中可见项目所有数据模型：RAH生成的点击偏好、个性化偏好、会话、消息、规则、规则生成/编辑日志、记录，以及 APScheduler 定时任务。
- Admin 是数据库的可视化管理工具，用于开发调试时查看/编辑数据，不是面向用户的界面。

## 2026-04-03 后端启动成功

- 解决 python alias 问题后，`python manage.py migrate` 和 `runserver` 均正常。
- migrate 执行了 `agent.0021_alter_record_filter_reason`。
- Django 5.2.12 开发服务器运行在 `http://127.0.0.1:8000/`。
- 前端尚未启动（需另开终端 `npm install && npm start`）。

## 2026-04-03 环境搭建与启动梳理

### 环境准备

从 `news_assistant-master/.venv` 复用 Python 3.11.15 创建了本项目的 `.venv/`。
requirements.txt 不完整，实际还需额外安装 colorlog、django-extensions、networkx、numpy。

当前 .venv 已安装的关键包：
- Django 5.2.12
- dashscope 1.19.2 (通义千问 SDK)
- jieba 0.42.1
- networkx 3.6.1
- numpy 2.4.4
- django-cors-headers 4.4.0
- django-apscheduler 0.6.2
- colorlog 6.10.1
- django-extensions 4.1

前端: Node v20.20.1, npm 10.8.2 (通过 nvm 管理)。node_modules 尚未安装，首次需 `npm install`。

### 启动步骤

#### 1. 后端 (Django, localhost:8000)

```bash
cd /Users/xinzijie/科研/小猪毕设/news_code_lyt
unalias python 2>/dev/null  # 必须！shell 有 alias python=python3.13，会覆盖 venv
source .venv/bin/activate
python manage.py migrate    # 首次或模型变更后执行
python manage.py runserver  # 启动在 localhost:8000
```

> **坑**: macOS zsh 配置了 `alias python=python3.13`，优先级高于 venv PATH，导致 activate 后 python 仍指向系统 3.13。必须先 `unalias python`。或直接用 `.venv/bin/python manage.py runserver`。

数据库用 SQLite (`db.sqlite3`)，无需额外配置。
LLM API 配置在 `agent/prompt/api.json`，使用通义千问 qwen-turbo/qwen-max。

#### 2. 前端 (React, localhost:3000)

```bash
cd /Users/xinzijie/科研/小猪毕设/news_code_lyt/my-profile-buddy-frontend
npm install   # 首次执行，装 antd/react 等依赖
npm start     # 启动开发服务器，localhost:3000
```

前端通过 `package.json` 中 `"proxy": "http://localhost:8000"` 将 API 请求代理到后端。

#### 3. 浏览器扩展

前端 build 产物或 `my-profile-buddy-frontend/public/` 目录可作为 Chrome 扩展加载：
- Chrome -> 扩展程序 -> 开发者模式 -> 加载已解压的扩展程序
- 选择 `my-profile-buddy-frontend/build/` 目录（需先 `npm run build`）
- manifest.json 已配置匹配 zhihu.com、bilibili.com、toutiao.com

### 注意事项

- requirements.txt 里有 `mysqlclient` 和 `dgl`，本地开发不需要（用 SQLite，dgl 图神经网络库装起来麻烦）。跳过不影响运行。
- 后端必须先启动，前端才能正常代理 API 请求。
- `agent/prompt/api.json` 中的 API key 是通义千问百炼平台的 key。
