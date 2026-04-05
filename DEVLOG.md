# DEVLOG


1. 偏好总结函数，调数据库
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
