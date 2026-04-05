# PersonaBuddy: Quick Flow Diagrams

## 1. Message Sending & Action Generation Flow

```
┌─────────────────────────────────────────────────────────┐
│ User: "我不想看娱乐八卦"                                 │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │ Chatbot.jsx        │
    │ sendMessage()      │
    └────────────┬───────┘
                 │
                 ▼
    ┌─────────────────────────────────────────┐
    │ HTTP POST /chatbot                      │
    │ Body: {sid, content, pid, task, ...}    │
    └────────────┬────────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────┐
    │ Backend: dialogue()                     │
    │ ├─ Create/fetch Session                 │
    │ ├─ Save Message(sender=user)            │
    │ ├─ Get conversation history             │
    │ └─ Load user's active rules             │
    └────────────┬────────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────┐
    │ get_fuzzy(history, rules)               │
    │ (Core LLM Analysis)                     │
    └────────────┬────────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    ▼                         ▼
┌──────────────┐         ┌──────────────┐
│ get_has_     │         │ (LLM Call 1) │
│ action()     │         │ Detect if    │
│              │         │ user wants   │
│ (LLM Call 1) │         │ to see or    │
└──────┬───────┘         │ NOT see      │
       │                 └──────┬───────┘
       │ has_dislikes=true      │
       ▼                        │
    ┌────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│ get_analyse_rules()              │
│ (LLM Call 2)                     │
│ Compare new need with            │
│ existing rules                   │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ get_change_rules()               │
│ (LLM Call 3)                     │
│ Decide: ADD or UPDATE?           │
│ Output: {"choice":"新增",          │
│          "rule":"我不想看..."}    │
└────────────┬─────────────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ GenContentlog.create()  │
    │ Log the generated rule  │
    │ is_ac = False           │
    └────────────┬────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────┐
    │ Response to Frontend                │
    │ {                                   │
    │   "content": "",                    │
    │   "sid": 123,                       │
    │   "action": [{                      │
    │     "type": 1,                      │
    │     "profile": {                    │
    │       "iid": 3,                     │
    │       "rule": "我不想看娱乐八卦"   │
    │     },                              │
    │     "log_id": 456                   │
    │   }]                                │
    │ }                                   │
    └────────────┬────────────────────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Frontend receives      │
    │ action.length > 0      │
    │ → Show ChangeProfile   │
    │    modal               │
    └────────────────────────┘
```

---

## 2. User Confirmation & Rule Saving Flow

```
┌──────────────────────────────────────────┐
│ ChangeProfile Modal Shows User           │
│ Suggested Rule:                          │
│ "我不想看娱乐八卦和花边新闻"             │
│                                          │
│ [User can edit rule text]                │
│ [User can accept/reject]                 │
│                                          │
│ Buttons: [取消] [确定]                   │
└────────────┬─────────────────────────────┘
             │
    ┌────────┴─────────┐
    │                  │
    │ User clicks 取消  │ (Cancel)
    │                  │
    ▼                  ▼
┌─────────────┐    ┌──────────────────┐
│ Call        │    │ ChangeProfile.   │
│ handleCancel│    │ saveFunc()        │
│             │    │                  │
└────┬────────┘    └────────┬─────────┘
     │                      │
     │                      ▼
     │             ┌──────────────────────────┐
     │             │ For each accepted action:│
     │             │ if type == 1:            │
     │             │   addFunc(rule)          │
     │             │ elif type == 2:          │
     │             │   updateFunc(id, rule)   │
     │             │ elif type == 3:          │
     │             │   deleteFunc(id)         │
     │             └────────┬─────────────────┘
     │                      │
     │                      ▼
     │             ┌──────────────────────────────┐
     │             │ POST /save_rules             │
     │             │ Body: {isbot:true, isdel:...,│
     │             │        rule:{...}, iid:3}    │
     │             │                              │
     │             │ Backend:                     │
     │             │ - Rule.create() or           │
     │             │   Rule.update()              │
     │             │ - Chilog.create()            │
     │             │   (action_type='add')        │
     │             └────────┬─────────────────────┘
     │                      │
     │                      ▼
     │             ┌──────────────────────────────┐
     │             │ Sync to Chrome Storage       │
     │             │ (Browser local storage)      │
     │             │                              │
     │             │ profiles array updated       │
     │             └────────┬─────────────────────┘
     │                      │
     │                      ▼
     │             ┌──────────────────────────────┐
     │             │ POST /make_new_message       │
     │             │ Body: {ac_actions:[...],     │
     │             │        wa_actions:[...]}     │
     │             │                              │
     │             │ Backend:                     │
     │             │ - Create Message(sender=bot) │
     │             │ - Update GenContentlog       │
     │             │   is_ac = True               │
     │             └────────┬─────────────────────┘
     │                      │
     │                      ▼
     │             ┌──────────────────────────────┐
     │             │ Return confirmation message: │
     │             │ "我帮你完成了如下操作:        │
     │             │  * 新增规则: 我不想看..."    │
     │             └────────┬─────────────────────┘
     │                      │
     ▼                      ▼
┌──────────────┐    ┌──────────────────┐
│ POST /make_  │    │ Frontend:        │
│ new_message  │    │ - Close modal    │
│ wa_actions=  │    │ - Show bot msg   │
│ [action]     │    │ - Clear action   │
│              │    │ - setAction([])  │
└────┬─────────┘    └──────────────────┘
     │                      │
     ▼                      ▼
┌──────────────┐    ┌──────────────────┐
│ Backend:     │    │ Chat display:    │
│ Mark action  │    │ User: "我不想看..."
│ as rejected  │    │ Bot: "我看你不需要│
│ is_ac = False│    │这个规则，没有保存"│
│              │    │                  │
└──────────────┘    └──────────────────┘
```

---

## 3. LLM Analysis Flow (get_fuzzy)

```
Input: chat_history, rules

              ▼
    ┌──────────────────┐
    │ get_has_action() │
    │ (Prompt 1)       │
    └────────┬─────────┘
             │
        ┌────┴─────────────────┐
        │                      │
        ▼                      ▼
   has_likes=T         has_dislikes=T
        │                      │
        │                      ▼
        │          ┌────────────────────────┐
        │          │ get_analyse_rules()    │
        │          │ (Prompt 2)             │
        │          │ Compare with existing  │
        │          └────────┬───────────────┘
        │                   │
        │                   ▼
        │          ┌────────────────────────┐
        │          │ get_change_rules()     │
        │          │ (Prompt 3)             │
        │          │ Decision tree:         │
        │          │                        │
        │          │ if strong relation:    │
        │          │   -> UPDATE (type 2)   │
        │          │ elif weak relation:    │
        │          │   -> ADD (type 1)      │
        │          │ else:                  │
        │          │   -> error             │
        │          └────────┬───────────────┘
        │                   │
        │                   ▼
        │          ┌────────────────────────┐
        │          │ Generate action:       │
        │          │ {type: 1 or 2,        │
        │          │  profile: {...},       │
        │          │  keywords: []}         │
        │          │                        │
        │          │ Return: ("", [action]) │
        │          └────────────────────────┘
        │
        ▼
   ┌──────────────────────────┐
   │ get_contradiction_rules()│
   │ (Prompt 4)               │
   │ Decision tree:           │
   │                          │
   │ if strong + conflicting: │
   │   -> DELETE (type 3)     │
   │ elif strong + related:   │
   │   -> UPDATE (type 2)     │
   │ else:                    │
   │   -> no action           │
   └────────┬─────────────────┘
            │
            ▼
   ┌──────────────────────────┐
   │ Generate action:         │
   │ {type: 2 or 3,          │
   │  profile: {...}}         │
   │                          │
   │ Return: ("", [action])   │
   └──────────────────────────┘
            │
            ├─ No preference detected
            │   │
            │   ▼
            │ ┌──────────────────┐
            │ │ get_common_      │
            │ │ response()       │
            │ │ (Prompt 5)       │
            │ │                  │
            │ │ Ask user more Q  │
            │ │ to extract info  │
            │ │                  │
            │ │ Return: (msg, [])│
            │ └──────────────────┘
            │
            └─ Return to backend
                for display
```

---

## 4. Content Filtering (Two-Stage) Flow

```
┌─────────────────────────────────┐
│ User browses news:              │
│ POST /browse                    │
│ Payload: {title, content, ...}  │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Load Rules:                     │
│ - Negative: "我不想看xxx"       │
│ - Positive: "我想看xxx"         │
└────────────┬────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌──────────────┐  ┌──────────────┐
│ Stage 1:     │  │ if positive  │
│ Filtering    │  │ rules exist: │
│              │  │ proceed to   │
│ LLM filters  │  │ Stage 2      │
│ by negative  │  │              │
│ rules        │  │              │
│              │  │              │
│ Prompt:      │  │              │
│ FILTERING_   │  │              │
│ PROMPT       │  │              │
│              │  │              │
│ Input:       │  │              │
│ {items,      │  │              │
│  neg_rules}  │  │              │
│              │  │              │
│ Output:      │  │              │
│ {filtered_,  │  │              │
│  removed_}   │  │              │
└──────┬───────┘  └──────┬───────┘
       │                 │
       ▼                 ▼
┌────────────────────────────────┐
│ Stage 2: Reranking             │
│                                │
│ LLM reranks by positive rules  │
│                                │
│ Prompt: RERANKING_PROMPT       │
│                                │
│ Input: {filtered_items,        │
│         positive_rules}        │
│                                │
│ Output: {rerank_list}          │
│                                │
│ Final order:                   │
│ rerank_list + removed_list     │
└────────────┬───────────────────┘
             │
             ▼
┌────────────────────────────┐
│ Record filtering result:   │
│ Record(filter_result=T/F,  │
│        filter_reason='...)'│
│                            │
│ Return to extension        │
└────────────────────────────┘
```

---

## 5. Database State Changes

```
Initial State:
┌─────────────────────────────────┐
│ Rule Table (pid='P001')         │
│ ├─ iid=1: 我不想看政治         │
│ └─ iid=2: 我想看技术新闻       │
└─────────────────────────────────┘

After User Conversation:
┌─────────────────────────────────┐
│ Message Table                   │
│ ├─ Session 123, user: 我不想... │
│ └─ Session 123, bot: ""         │
│                                 │
│ GenContentlog                   │
│ ├─ id=456, action='add'         │
│ ├─ new_rule=我不想看娱乐八卦   │
│ └─ is_ac=False                  │
└─────────────────────────────────┘

After User Accepts:
┌─────────────────────────────────┐
│ Rule Table (updated)            │
│ ├─ iid=1: 我不想看政治         │
│ ├─ iid=2: 我想看技术新闻       │
│ └─ iid=3: 我不想看娱乐八卦 ✓   │
│                                 │
│ GenContentlog (updated)         │
│ ├─ id=456, is_ac=True           │
│ ├─ change_rule=我不想看...      │
│ └─ from_which_message=789       │
│                                 │
│ Chilog (new entry)              │
│ ├─ iid=3, action='add'          │
│ ├─ isbot=True                   │
│ └─ rule=我不想看娱乐八卦       │
│                                 │
│ Message (new)                   │
│ ├─ sender='bot'                 │
│ ├─ content='我帮你完成...'       │
│ └─ has_action=True              │
└─────────────────────────────────┘
```

---

## 6. Data Flow: Frontend ↔ Backend ↔ Database

```
Frontend (Chrome)
    │
    ├─ Local Storage (profiles)  ◄──┐
    │  [iid, rule, platform, ...]   │
    │                                │
    ▼                                │
    HTTP Requests                    │
    ├─ POST /chatbot                │
    │  └─→ get dialogue response    │
    │      └─→ if actions:          │
    │          ├─ Show modal       │
    │          └─ Wait for confirm │
    │                              │
    ├─ POST /save_rules            │
    │  └─→ Update local storage ───┘
    │      └─→ Sync to DB
    │
    ├─ POST /make_new_message
    │  └─→ Send feedback
    │      └─→ Update logs
    │
    └─ GET /chatbot/get_history
       └─→ Load past messages

Backend (Django)
    │
    ├─ Session (active chats)
    │
    ├─ Message (all messages)
    │
    ├─ Rule (user rules)
    │
    ├─ GenContentlog (AI-generated rules)
    │
    ├─ Chilog (all changes)
    │
    └─ Searchlog (search history)

Database (SQLite)
    │
    └─ Persistent storage
       All tables indexed by pid
       Complete audit trail
```

---

## 7. Action Type Decision Tree

```
                       ┌─ Analysis Complete
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
    User says:                   User says:
    "我不想看ABC"                "我想看XYZ"
    has_dislikes=T               has_likes=T
        │                             │
        ▼                             ▼
    Compare with                 Compare with
    existing rules               existing rules
        │                             │
    ┌───┴────────────┐           ┌────┴──────────────┐
    │                │           │                   │
    ▼                ▼           ▼                   ▼
Weak Relation   Strong Relation Strong + Conflicting  Related
"不相关"          "相关"         "冲突"               "相关"
    │                │           │                   │
    ▼                ▼           ▼                   ▼
[Type 1]         [Type 2]      [Type 3]           [Type 2]
ADD              UPDATE        DELETE             UPDATE
新增              更新           删除                更新

Example:                  Example:                Example:
Need: 动画新闻          Need: 八卦             Need: 科技类
Rule 1: 政治           Rule 1: 娱乐八卦       Rule 1: 我不想看娱乐
Rule 2: 体育      →    Rule 1 matches  →    Rule 1 conflicts →
Action: ADD              Action: UPDATE       Action: DELETE
```

---

## 8. Status Codes & Response Patterns

```
Response Pattern 1: Regular Chat (no actions)
{
  "code": "success",
  "data": {
    "content": "你想了解什么呢？",
    "action": [],
    "sid": 123
  }
}
→ Display message, continue chat

Response Pattern 2: With Actions (requires confirmation)
{
  "code": "success",
  "data": {
    "content": "",
    "action": [{
      "type": 1,
      "profile": {...},
      "log_id": 456
    }],
    "sid": 123
  }
}
→ Show modal, wait for user confirmation

Response Pattern 3: Error
{
  "code": "failure",
  "data": null
}
→ Display error message, retry
```

---

## Quick Reference: Message Types

```
Message.sender Choices:
├─ "user"        → User's input message
├─ "assistant"   → LLM-generated response (unused currently)
└─ "bot"         → Bot's response to user

Message.has_action:
├─ True  → Message marks acceptance of actions
│          (used to truncate context in future queries)
└─ False → Regular message

Session.task Types:
├─ 0 → Alignment (偏好对齐)
│      Show user's detected preferences based on history
└─ 2 → Feedback (反馈)
       Show recently filtered content & ask for feedback

Platform Types:
├─ 0 → 知乎 (Zhihu)
├─ 1 → B站 (Bilibili)
└─ 2 → 头条 (Toutiao)
```

---

## Common Workflows

### Workflow A: Adding a New Rule
```
User: "我不想看明星八卦"
  → Backend detects dislike
  → LLM decides: new rule
  → Type 1 action generated
  → Modal shows suggestion
  → User confirms
  → Rule added to database
```

### Workflow B: Updating a Rule
```
User: "其实我也不想看体育新闻"
  → Backend detects dislike
  → LLM finds related rule "我不想看娱乐"
  → LLM decides: update (combine both)
  → Type 2 action generated
  → User sees old + new rule
  → User confirms
  → Rule updated in database
```

### Workflow C: Deleting a Rule
```
User: "其实我想看科技类的八卦"
  → Backend detects like
  → LLM finds related rule "我不想看八卦"
  → LLM decides: delete (contradiction)
  → Type 3 action generated
  → Modal asks confirmation
  → User confirms
  → Rule deleted from database
```

