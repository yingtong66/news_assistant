# offlineTwoStage: 模块化多智能体推荐系统

## 概览

offlineTwoStage 将推荐流程拆分为两个独立模块，分别对应推荐系统的两个核心能力：
- **Unit_Interpret**（可解释性）：从用户历史行为中提炼偏好画像
- **Unit_Controll**（可控性）：通过对话引导用户表达显式需求

两个模块均可独立启用/禁用（`ENABLE_INTERPRET` / `ENABLE_CONTROLL`），形成 4 种消融组合，后接过滤和重排完成最终推荐。

---

## 可解释性：Unit_Interpret

### 目标

从用户历史点击行为中**自动归纳**出结构化的偏好画像，输出用户**想看**和**不想看**的内容分组，作为推荐决策的解释性依据。

### 实现逻辑（`src/unit_interpret.py`）

分三步顺序调用 LLM：

```
用户历史新闻列表
    │
    ├─ Step 1: 长期偏好解析（long_term_parser.yaml）
    │          输入: 全部历史新闻（title + abstract）
    │          输出: 自然语言描述的长期偏好
    │
    ├─ Step 2: 短期偏好解析（short_term_parser.yaml）
    │          输入: 最近 5 条历史新闻
    │          输出: 自然语言描述的短期偏好（近期兴趣漂移）
    │
    └─ Step 3: 历史画像总结（history_summary.yaml）
               输入: 长期偏好 + 短期偏好
               输出: JSON { positive_group: [...], negative_group: [...] }
```

### 输出格式

```json
{
  "positive_group": ["用户感兴趣的主题或风格描述", ...],
  "negative_group": ["用户不感兴趣的主题或风格描述", ...]
}
```

### 下游使用

- 若同时启用 Unit_Controll：`positive_group` / `negative_group` 拼成 `preference_summary` 文本，传入 `requirement_identifier.yaml` 作为上下文
- 若仅启用 Interpret（`I1C0`）：直接将正负分组传给过滤和重排

---

## 可控性：Unit_Controll

### 目标

通过**推荐方与用户的单轮对话**，将 target 新闻的模糊关键词转化为明确的需求描述，实现用户对推荐方向的显式控制。

### 实现逻辑（`src/unit_controll.py`）

分三步顺序调用 LLM：

```
target 关键词 + 偏好总结（可选）
    │
    ├─ Step 1: 需求识别引导
    │          有历史偏好上下文 → requirement_identifier.yaml
    │                             输入: preference_summary
    │          无历史（冷启动）  → requirement_identifier_cold.yaml
    │                             输入: 无
    │          输出: 推荐方向用户提问（guidance_question）
    │
    ├─ Step 2: 用户模拟器回复
    │          positive 极性 → user_simulator.yaml
    │          negative 极性 → user_simulator_negative.yaml
    │          输入: keywords（目标关键词）+ guidance_question
    │          输出: 模拟用户回复（基于 keywords，禁止发散）
    │
    └─ Step 3: 需求画像总结（requirement_summary.yaml）
               输入: 对话历史（问+答） + preference_summary
               输出: JSON { positive_group: [...], negative_group: [...] }
```

### 极性控制（TARGET_POLARITY）

`target_polarity` 决定 keywords 的含义方向：
- `positive`：关键词描述用户**想看**的内容，用户模拟器表达正向偏好
- `negative`：关键词描述用户**不想看**的内容，用户模拟器表达排斥偏好

通过切换用户模拟器 prompt 实现，`requirement_summary` 会将其归入对应的 `negative_group`。

### 关键词来源（KEYWORDS_NAME）

通过 `--keywords_file` 指定，对应 `{KEYWORDS_NAME}_keywords.jsonl`：

| KEYWORDS_NAME | 内容 | 特点 |
|---|---|---|
| `style` | 风格描述关键词（3个/样本） | 描述写作风格、情感倾向 |
| `L1topic` | 一级话题关键词（1个/样本） | 宽泛话题类别 |
| `style_L1topic` | 风格 + 话题合并（4个/样本） | 综合描述，易引发语义混合 |

---

## 四种消融模式

| ENABLE_INTERPRET | ENABLE_CONTROLL | 模式 | 偏好来源 |
|:---:|:---:|:---:|---|
| 1 | 1 | I1C1 | Interpret 输出作上下文 → Controll 引导对话 → 需求总结 |
| 1 | 0 | I1C0 | Interpret 正负分组直接送过滤/重排 |
| 0 | 1 | I0C1 | 冷启动引导 → Controll 对话 → 需求总结 |
| 0 | 0 | I0C0 | 无用户画像，保持 baseline 原始排名 |

---

## 过滤与重排

两个模块的输出最终汇聚为 `positive_group` 和 `negative_group`，驱动后续两步：

### 过滤（filtering.yaml）
- 仅在 `negative_group` 非空时触发
- 保守移除与负向需求明确矛盾的候选
- 保底逻辑：过滤后保留数量 < 70% 时回退全量

### 重排（reranking.yaml）
- 输入：过滤后候选列表 + `positive_group`
- 按正向需求相关性排序，输出 `{rerank_list, explanation}`
- 兜底：去重 + 过滤非法 ID + 补齐缺失项 + `drop_group` 追加末尾

---

## 运行配置（run.sh）

```bash
ENABLE_INTERPRET=0          # 是否启用 Unit_Interpret
ENABLE_CONTROLL=1           # 是否启用 Unit_Controll
TARGET_POLARITY=positive    # keywords 极性: positive / negative
KEYWORDS_NAME=style         # keywords 文件名前缀
BATCH_SIZE=100              # 并发批次大小
BASELINE_FILE=...           # 提供 baseline 初始排名（nrms 等）
```

输出目录命名规则：`{TIMESTAMP}_{BASELINE_NAME}_KN{KEYWORDS_NAME}_I{EI}C{EC}_bs{BS}`

---

## 目录结构

```
offlineTwoStage/
├── main.py                   # 入口：数据加载、并发调度、结果统计
├── run.sh                    # 实验配置与启动脚本
├── src/
│   ├── pipeline.py           # TwoStagePipeline：四阶段主流程
│   ├── unit_interpret.py     # Unit_Interpret：历史偏好解析
│   ├── unit_controll.py      # Unit_Controll：需求对话引导
│   ├── data.py               # 数据加载（MIND TSV）
│   ├── metrics.py            # AUC / MRR / NDCG 计算
│   ├── utils.py              # format_item_list 等工具函数
│   └── agent/
│       ├── base.py           # Agent 基类，prompt 模板填充
│       ├── local_llm.py      # 本地 Qwen 模型推理
│       └── openai_llm.py     # OpenAI API 调用
└── prompt/
    ├── long_term_parser.yaml
    ├── short_term_parser.yaml
    ├── history_summary.yaml
    ├── requirement_identifier.yaml
    ├── requirement_identifier_cold.yaml
    ├── user_simulator.yaml
    ├── user_simulator_negative.yaml
    ├── requirement_summary.yaml
    ├── filtering.yaml
    └── reranking.yaml
```
