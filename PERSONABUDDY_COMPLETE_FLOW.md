# PersonaBuddy: Complete Flow Analysis
## User Chat → Rule Generation → Rule Saving

**Document Date**: 2026-04-05  
**Project**: PersonaBuddy - Persona-Based Content Filtering & Personalization System  
**Repository**: `/Users/xinzijie/科研/小猪毕设/news_code_lyt`

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Frontend Components](#frontend-components)
3. [Backend Processing](#backend-processing)
4. [Rule Generation Pipeline](#rule-generation-pipeline)
5. [Data Models](#data-models)
6. [Two-Stage Module (Online & Offline)](#two-stage-modules)
7. [Complete End-to-End Flow](#complete-end-to-end-flow)
8. [Database Schema](#database-schema)

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│              my-profile-buddy-frontend/                     │
│        (React + Ant Design Components)                      │
├─────────────────────────────────────────────────────────────┤
│  - Chatbot.jsx (Chat interface)                             │
│  - ChangeProfile.jsx (Rule confirmation modal)              │
│  - Profile.jsx (Rule management)                            │
└────────────┬────────────────────────────────────────────────┘
             │ HTTP REST API
┌────────────▼────────────────────────────────────────────────┐
│                      Backend (Django)                       │
│                    agent/views.py                           │
├─────────────────────────────────────────────────────────────┤
│  POST /chatbot - Main dialogue endpoint                     │
│  POST /save_rules - Persist rules to DB                     │
│  POST /make_new_message - Process user feedback             │
│  POST /get_sessions - Fetch chat sessions                   │
│  GET /chatbot/get_history/{sid} - Chat history             │
└────────────┬────────────────────────────────────────────────┘
             │ LLM API Calls
┌────────────▼────────────────────────────────────────────────┐
│        Alibaba Bailian QWen (LLM Service)                   │
│         agent/prompt/fuzzy.py                               │
│       (Rule generation via prompts)                         │
└─────────────────────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────────┐
│                    Database (SQLite)                        │
│              Django ORM Models                              │
├─────────────────────────────────────────────────────────────┤
│  - Session (chat sessions)                                  │
│  - Message (individual messages)                            │
│  - Rule (user preference rules)                             │
│  - GenContentlog (AI-generated rules log)                   │
│  - Chilog (complete rule change history)                    │
│  - Searchlog (search suggestions log)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Frontend Components

### 1. Chatbot.jsx
**Location**: `my-profile-buddy-frontend/src/components/Chatbot/Chatbot.jsx`

**Purpose**: Main chat interface where users interact with the bot.

**Key State Variables**:
- `nowsid`: Current session ID
- `chatHistory`: Array of messages in current session
- `message`: Current user input text
- `action`: Actions returned from backend (rules to confirm/modify)
- `loading`: Global loading state

**Key Functions**:

#### `sendMessage()`
Sends user message to backend and handles response.

```javascript
const sendMessage = () => {
    const userMessage = {sender: "user", message: message, avatar: userAvatar};
    setChatHistory(chatHistory => [...chatHistory, userMessage]);
    setEnabled(false);
    
    fetch(`${backendUrl}/chatbot`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            sid: nowsid,                    // Session ID (-1 for new)
            sender: "user",
            content: userMessage.message,
            pid: userPid,                   // User ID
            task: title,                    // Task type (0=alignment, 2=feedback)
            platform: 0                     // Platform (0=知乎, 1=B站, 2=头条)
        })
    })
    .then(response => response.json())
    .then(data => {
        const res_data = data['data'];
        
        // Update session if this is a new session
        if (nowsid !== res_data['sid']) {
            setAllSessions(allsessions => {
                return allsessions.map(element => 
                    element['sid'] === nowsid ? 
                    {sid: res_data['sid'], ...} : element
                );
            });
            setNowSid(res_data['sid']);
        }
        
        // Check if backend returned actions (rule suggestions)
        if (res_data.action.length !== 0) {
            // Backend generated rules - show confirmation modal
            setAction(res_data.action);
        } else {
            // Regular bot response
            const newMessage = {sender: "bot", message: res_data['content'], avatar: botAvatar};
            setChatHistory(chatHistory => [...chatHistory, newMessage]);
        }
        setEnabled(true);
    });
    
    setMessage("");
}
```

**Flow**:
1. User types message and clicks "Send"
2. Message is added to local `chatHistory`
3. POST request sent to `/chatbot` endpoint
4. Backend processes and returns response
5. If `action` list is not empty → trigger `ChangeProfile` modal
6. Otherwise → add bot response to chat

---

### 2. ChangeProfile.jsx
**Location**: `my-profile-buddy-frontend/src/components/ChangeProfile.jsx`

**Purpose**: Modal dialog for user to confirm/edit/reject AI-suggested rules.

**Key State Variables**:
- `nowData`: Current rules from browser storage
- `isConfirm`: Array of boolean flags (one per action)
- `isediting`: Is user currently editing a rule

**Action Types**:
- Type 1: Add new rule
- Type 2: Update existing rule
- Type 3: Delete rule
- Type 4: Search keyword (triggers web search)

**Key Functions**:

#### `saveFunc()`
Executes confirmed actions and sends them to backend.

```javascript
function saveFunc() {
    const ac_actions = actionData.filter((item, index) => isConfirm[index]);
    const wa_actions = actionData.filter((item, index) => !isConfirm[index]);
    
    setEnabled(false);
    setLoading(true);
    
    // Process each action (add/update/delete/search)
    actionData.forEach((item, index) => {
        if (isConfirm[index]) {
            if (item.type === 1) {      // Add
                addFunc(item.profile);
            } else if (item.type === 2) { // Update
                updateFunc(item.profile.iid, item.profile);
            } else if (item.type === 3) { // Delete
                deleteFunc(item.profile.iid);
            } else if (item.type === 4) { // Search
                // Open search URL in new tab
                const url = generateSearchUrl(item.keywords[0], item.profile.platform);
                chrome.runtime.sendMessage({ url: url });
            }
        }
    });
    
    // Notify backend of accepted vs rejected actions
    fetch(`${backendUrl}/make_new_message`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            pid: userPid,
            sid: sid,
            platform: 0,
            ac_actions: ac_actions,    // Accepted actions
            wa_actions: wa_actions      // Rejected actions
        })
    })
    .then(res => res.json())
    .then(data => {
        const res_data = data['data'];
        const newMessage = {sender: "bot", message: res_data['content'], avatar: botAvatar};
        setActionMessage(chatHistory => [...chatHistory, newMessage]);
        setEnabled(true);
        setLoading(false);
    });
    
    setAction([]);
}
```

#### `addFunc(item)`, `updateFunc(id, item)`, `deleteFunc(id)`
These sync rules to:
1. Backend database via `/save_rules` endpoint
2. Browser local storage (Chrome storage API)

**Data Flow**:
1. Modal displays suggested actions to user
2. User can accept/reject each action
3. User can edit rule text before confirming
4. Click "确定" (Confirm) → execute accepted actions
5. Send results to `/make_new_message` endpoint
6. Backend generates confirmation message
7. Close modal and display confirmation

---

### 3. Profile.jsx
**Location**: `my-profile-buddy-frontend/src/pages/Profile/Profile.jsx`

**Purpose**: User-facing rule management interface (separate from chatbot).

**Features**:
- Display all saved rules
- Edit rule text
- Delete rules
- Add new rules
- Rules synced to backend via `/save_rules`

---

## Backend Processing

### Backend Entry Point: `/chatbot` Endpoint

**Location**: `agent/views.py::dialogue(request)`

**Request Body**:
```python
{
    "sid": int,                 # Session ID (-1 for new)
    "sender": "user",
    "content": str,             # User message
    "pid": str,                 # User ID
    "task": int,                # 0=alignment, 2=feedback
    "platform": int             # 0=知乎, 1=B站, 2=头条
}
```

**Processing Steps**:

```python
def dialogue(request):
    data = json.loads(request.body)
    sid = data['sid']
    pid = data['pid']
    content = data['content']
    task = data['task']
    platform = PLATFORM_CHOICES[data['platform']][0]
    
    # Step 1: Handle session
    try:
        session = Session.objects.get(id=sid)
    except:
        # Create new session
        session = Session(pid=pid, task=task, platform=platform, summary="...")
        session.save()
        sid = session.id
        
        # For alignment task: load user's personality preferences
        if task == 0:
            personalities = Personalities.objects.filter(pid=pid, platform=platform).first()
            if personalities:
                sys_message = Message(session=session, 
                                     content=personalities.first_response, 
                                     sender='bot')
                sys_message.save()
    
    # Step 2: Save user message
    message = Message(session=session, content=content, sender='user')
    message.save()
    
    # Step 3: Get conversation history
    messges_str = get_his_message_str(sid)  # Format: "用户:...\n客服:...\n..."
    
    # Step 4: Load current rules
    rules = Rule.objects.filter(pid=pid, platform=platform)
    active_rule = rules.filter(isactive=True)
    rules_json = json.loads(serializers.serialize('json', active_rule))
    
    # Step 5: Get next rule ID
    next_iid = max([rule.iid for rule in rules], default=-1) + 1
    
    # Step 6: Call rule generation (CORE LOGIC)
    response, actions = get_fuzzy(
        chat_history=messges_str,
        rules=rules_json,
        platform=platform_id,
        pid=pid,
        max_iid=next_iid
    )
    
    # Step 7: Log generated actions
    for action in actions:
        if action['type'] == 4:  # Search
            search = Searchlog.objects.create(
                pid=pid, 
                platform=platform, 
                gen_keyword=action['keywords'][0], 
                is_accepted=False
            )
            action['log_id'] = search.id
        elif action['type'] == 1:  # Add
            gen_content = GenContentlog.objects.create(
                pid=pid, action_type='add', platform=platform,
                new_rule=action['profile']['rule'], old_rule='',
                is_ac=False, from_which_session=session
            )
            action['log_id'] = gen_content.id
        # ... similar for update (type 2) and delete (type 3)
    
    # Step 8: Save bot message (only if no actions)
    if len(actions) == 0:
        bot_message = Message(session=session, content=response, sender='bot')
        bot_message.save()
    
    # Step 9: Return response
    return build_response(SUCCESS, {
        "content": response,      # Bot response text
        "sid": session.id,        # Session ID
        "action": actions,        # List of rule suggestions
        "task": session.task,
        "platform": PLATFORMS.index(session.platform),
        "pid": session.pid,
        "summary": session.summary
    })
```

---

## Rule Generation Pipeline

### The Core: `get_fuzzy()` Function

**Location**: `agent/prompt/fuzzy.py::get_fuzzy()`

**Purpose**: Analyze conversation history and generate rule suggestions

**Algorithm Overview**:

```
Input: Chat history + Existing rules
    ↓
Step 1: Detect user preferences (get_has_action)
    ├─ Has "不想看" (dislike) preference?
    ├─ Has "想看" (like) preference?
    └─ Output: needs, choice
    ↓
Step 2: Compare with existing rules (get_analyse_rules)
    ├─ Analyze each existing rule
    └─ Identify related rules
    ↓
Step 3: Decide rule operation
    ├─ If "不想看" → get_change_rules (add/update)
    ├─ If "想看" → get_contradiction_rules (delete/update)
    └─ Otherwise → get_common_response (no action)
    ↓
Output: (response_text, action_list)
```

---

### Step 1: Detect User Preferences

**Function**: `get_has_action(messages)`

**Prompt**: `HAS_ACTION_PROMPT`

```
一位用户希望调整平台推荐给他的个性化列表，于是他与客服进行了如下对话：
{messages}

根据对话内容，你能否分析出该用户想看或不想看什么类型的内容？

请你以json格式回复，它包含3个字段：
- analysis：你对该问题的分析
- choice：你的答案（能分析出用户想看的内容/能分析出用户不想看的内容/不能分析出）
- needs：分析出的用户需求（以"用户想看"或"用户不想看"开头）
```

**Output**:
```python
has_likes: bool      # User expressed positive preference
has_dislikes: bool   # User expressed negative preference
histories: list      # Conversation history for LLM
response: str        # LLM raw response
needs: str          # Extracted user need (e.g., "用户不想看娱乐八卦")
```

---

### Step 2: Analyze Existing Rules

**Function**: `get_analyse_rules(rules_str, count, histories, needs)`

**Prompt**: `ANALYSE_RULES_PROMPT`

```
目前，用户已经定义了如下{count}条规则：
{rules}

上述你刚总结出用户需求"{needs}"是否与这{count}条存在关联？请逐条分析一下。

请你以json格式回复：
{
    "answer": [
        {"rule_id": "<规则编号>", "analysis": "<关联分析>"},
        ...
    ]
}
```

**Output**: Analysis of how new need relates to existing rules

---

### Step 3a: Handle "不想看" (Dislike) Needs

**Function**: `get_change_rules(histories, needs)`

**Prompt**: `CHANGE_RULES_PROMPT`

```
根据你的分析，请你告诉我应该如何操作已有的规则，以将你新总结的用户需求"{needs}"加入到规则列表中。你可以进行"新增"和"更新"两种操作：

1、当新需求与任意已有规则关联性都很小时，选择"新增"一条规则。
2、当新需求与某一条已有规则关联性很大时，选择"更新"该已有规则。

请以json格式回复：
{
    "analysis": "<分析>",
    "choice": "<新增/更新>",
    "rule_id": "<规则编号/空字符串>",
    "rule": "<新增或更新的规则（以'我不想看'开头）>"
}
```

**Logic**:
- If `choice == "新增"` → Create action with `type=1` (add)
- If `choice == "更新"` → Create action with `type=2` (update)

**Generated Action**:
```python
{
    "type": 1,  # 1=add, 2=update
    "profile": {
        "iid": rule_id,
        "platform": platform,
        "rule": new_rule,
        "pid": pid,
        "isactive": True
    },
    "keywords": []
}
```

---

### Step 3b: Handle "想看" (Like) Needs

**Function**: `get_contradiction_rules(histories, needs)`

**Prompt**: `DEL_RULES_PROMPT`

```
根据你的分析，请你告诉我应该如何操作已有的规则。你可以进行"删除""更新"和"无"三种操作：

1、当新需求与某一条已有规则关联性很大且完全矛盾，选择"删除"该规则。
2、当新需求与某一条已有规则关联性很大且不完全矛盾，选择"更新"该规则。
3、当新需求与任意已有规则关联性都很小，选择"无"。

请以json格式回复：
{
    "analysis": "<分析>",
    "choice": "<删除/更新/无>",
    "rule_id": "<规则编号/空字符串>",
    "rule": "<更新的规则/空字符串>"
}
```

**Logic**:
- If `choice == "删除"` → Create action with `type=3` (delete)
- If `choice == "更新"` → Create action with `type=2` (update)
- If `choice == "无"` → No action

---

### Step 3c: No Clear Preferences

**Function**: `get_common_response(messages)`

**Prompt**: `REPONSE`

```
你的目标是探索用户在社交媒体中的个性化需求，也就是他们更不愿意看到什么内容，请根据上下文给出恰当的回复。请记住，你的回复应该尽可能简短，通过询问用户更多信息来鼓励user表达需求。

**聊天上下文**:
{messages}

客服：
```

**Output**: Continuation message to encourage user to express preferences

---

## Data Models

**Location**: `agent/models.py`

### Session Model
```python
class Session(models.Model):
    pid = CharField(max_length=10)              # User ID
    task = CharField(max_length=100)            # Task type
    platform = CharField(choices=PLATFORM_CHOICES)  # Platform
    summary = CharField(max_length=100)         # Session summary
```

### Message Model
```python
class Message(models.Model):
    session = ForeignKey(Session, on_delete=CASCADE)
    content = CharField(max_length=255)         # Message text
    sender = CharField(choices=[user, assistant, bot])
    has_action = BooleanField()                 # Does this message mark action acceptance?
    timestamp = DateTimeField(auto_now_add=True)
```

### Rule Model
```python
class Rule(models.Model):
    iid = IntegerField()                        # Rule ID
    pid = CharField(max_length=10)              # User ID
    rule = CharField(max_length=100)            # Rule text (e.g., "我不想看八卦")
    isactive = BooleanField()                   # Is rule active?
    platform = CharField(choices=PLATFORM_CHOICES)
```

### GenContentlog Model (Generated Rules Log)
```python
class GenContentlog(models.Model):
    pid = CharField(max_length=10)
    action_type = CharField(choices=[add, update, delete])
    platform = CharField(choices=PLATFORM_CHOICES)
    new_rule = CharField(max_length=100)        # New rule
    old_rule = CharField(max_length=100)        # Previous rule
    is_ac = BooleanField()                      # Was it accepted?
    change_rule = CharField(max_length=100)     # User's edited rule
    timestamp = DateTimeField(auto_now_add=True)
    from_which_session = ForeignKey(Session)
    from_which_message = ForeignKey(Message)
```

### Chilog Model (Complete Change History)
```python
class Chilog(models.Model):
    pid = CharField(max_length=10)
    iid = IntegerField()                        # Rule ID
    action_type = CharField(choices=[add, update, delete])
    isbot = BooleanField()                      # Changed by bot?
    rule = CharField(max_length=100)            # Changed rule
    isactive = BooleanField()                   # New active status
    platform = CharField(choices=PLATFORM_CHOICES)
    timestamp = DateTimeField(auto_now_add=True)
```

### Searchlog Model (Search Suggestions)
```python
class Searchlog(models.Model):
    pid = CharField(max_length=10)
    platform = CharField(choices=PLATFORM_CHOICES)
    gen_keyword = CharField(max_length=100)     # LLM-generated keyword
    edited_keyword = CharField(max_length=100)  # User-edited keyword
    is_accepted = BooleanField()                # Was search accepted?
    timestamp = DateTimeField(auto_now_add=True)
```

---

## Two-Stage Modules

### Online TwoStage (`online_TwoStage/`)

**Purpose**: Real-time content filtering and reranking based on user rules

**Pipeline**: `online_TwoStage/pipeline.py::run_two_stage_reorder()`

```
Input: pid, platform, items (candidate news)
    ↓
Step 1: Load rules
    ├─ Negative rules (我不想看xxx)
    └─ Positive rules (我想看xxx)
    ↓
Step 2: Filtering (if negative rules exist)
    ├─ Call LLM with FILTERING_PROMPT
    ├─ Move items violating negative rules
    └─ Output: filtered_items, removed_items
    ↓
Step 3: Reranking (if positive rules exist)
    ├─ Call LLM with RERANKING_PROMPT
    ├─ Sort filtered_items by relevance to positive rules
    └─ Output: reranked_ids
    ↓
Output: Final order [reranked_ids + removed_ids]
```

**Key Prompts**:

**FILTERING_PROMPT**:
```
你是新闻推荐系统中的过滤智能体。
你的唯一任务是：移除与用户负向规则直接相关的候选内容。

规则：
{negative_group}

候选内容列表：
{items}

输出格式：
{
  "filtered_list": [...],
  "removed_list": [...]
}
```

**RERANKING_PROMPT**:
```
你是新闻推荐系统中的重排智能体。
你的唯一任务是：根据用户的正向偏好，对候选内容重新排序。

用户正向偏好：
{positive_group}

候选内容列表：
{items}

输出格式：
{
  "rerank_list": [...]
}
```

---

### Offline TwoStage (`offline_TwoStage/`)

**Purpose**: Offline analysis system with two independent modules

**Two Modules**:

1. **Unit_Interpret** (Explainability)
   - Extracts user preferences from browsing/click history
   - Outputs: `positive_group` and `negative_group`
   - Process:
     - Step 1: Long-term preference parsing
     - Step 2: Short-term preference parsing
     - Step 3: History summary generation

2. **Unit_Controll** (Controllability)
   - Engages user in dialogue to extract explicit requirements
   - Process:
     - Step 1: Requirement identification guidance
     - Step 2: User simulator response
     - Step 3: Requirement profile summary

**Four Ablation Modes**:
- I1C1: Both Interpret and Controll enabled
- I1C0: Only Interpret enabled
- I0C1: Only Controll enabled
- I0C0: Neither (baseline)

---

## Complete End-to-End Flow

### Scenario: User Expresses Dislike

**Timeline**:

```
1. User in Chatbot interface types: "我不想看娱乐八卦"

2. Frontend (Chatbot.jsx::sendMessage)
   └─ POST /chatbot
      Payload: {sid: 123, content: "我不想看娱乐八卦", pid: "P001", ...}

3. Backend (agent/views.py::dialogue)
   ├─ Create/fetch Session
   ├─ Save Message(sender='user', content='...')
   ├─ Get conversation history
   ├─ Load existing rules for user
   └─ Call get_fuzzy(chat_history, rules)

4. LLM Analysis (agent/prompt/fuzzy.py::get_fuzzy)
   ├─ get_has_action()
   │  └─ LLM detects: has_dislikes=True, needs="用户不想看娱乐八卦"
   ├─ get_analyse_rules()
   │  └─ LLM analyzes relation to existing rules
   ├─ get_change_rules()
   │  └─ LLM decides: "新增" (add new rule)
   │     choice = "新增"
   │     rule = "我不想看娱乐八卦和花边新闻"
   └─ Return: response="", actions=[{type:1, profile:{...}}]

5. Backend logs generated action
   ├─ GenContentlog.create(
   │     action_type='add',
   │     new_rule='我不想看娱乐八卦...',
   │     is_ac=False,
   │     from_which_session=session
   │  )
   └─ action['log_id'] = gencontentlog.id

6. Backend response (NO bot message saved yet)
   └─ Return JSON:
      {
        "content": "",
        "sid": 123,
        "action": [{
          "type": 1,
          "profile": {
            "iid": 3,
            "rule": "我不想看娱乐八卦和花边新闻",
            "platform": 0,
            "pid": "P001",
            "isactive": True
          },
          "log_id": 456
        }]
      }

7. Frontend receives response
   ├─ action.length > 0, so setAction(response.action)
   └─ Modal triggers (ChangeProfile component appears)

8. User sees modal
   ├─ Title: "我将帮您进行编辑, 请确认:"
   ├─ Shows: "添加 规则: 我不想看娱乐八卦和花边新闻"
   ├─ User can: edit rule, accept/reject
   └─ User clicks "确定" (Confirm)

9. Frontend executes action (ChangeProfile::saveFunc)
   ├─ Call addFunc(action['profile'])
   │  ├─ POST /save_rules
   │  │  Payload: {isbot:true, isdel:false, rule:{...}, iid:3, pid:"P001"}
   │  └─ Sync to Chrome local storage
   ├─ Build ac_actions = [accepted actions]
   ├─ Build wa_actions = [rejected actions]
   └─ POST /make_new_message
      Payload: {pid:"P001", sid:123, ac_actions:[...], wa_actions:[...]}

10. Backend processes feedback (make_new_message)
    ├─ Create Message(sender='assistant', content='我帮你完成了...')
    ├─ Update GenContentlog
    │  └─ is_ac=True, change_rule='我不想看娱乐八卦和花边新闻'
    ├─ For accepted add action:
    │  └─ No immediate rule creation (frontend handles it)
    └─ Return confirmation message

11. Backend saves rules (save_rules endpoint)
    ├─ Check if rule_id exists
    ├─ If not exists:
    │  ├─ Rule.create(iid=3, rule='...', pid='P001', ...)
    │  └─ Chilog.create(action_type='add', isbot=True, ...)
    └─ Return success

12. Frontend displays confirmation
    ├─ Add bot confirmation message to chatHistory
    ├─ Close modal
    ├─ setAction([])
    └─ User sees: "我帮你完成了如下操作: * 新增规则: 我不想看娱乐八卦..."

13. Data persisted
    ├─ Database:
    │  ├─ Rule(iid=3, rule='...', pid='P001', isactive=True)
    │  ├─ Chilog(iid=3, action_type='add', isbot=True, rule='...')
    │  ├─ GenContentlog(action_type='add', is_ac=True, ...)
    │  └─ Message(sender='user/assistant/bot', session_id=123, ...)
    └─ Chrome Storage:
       └─ profiles: [{iid:1, rule:'...'}, {iid:2, rule:'...'}, {iid:3, rule:'...new'}]
```

---

### Scenario: Rule Modification and Content Filtering

**After rule is saved**:

```
1. When browsing content on ZhihuNews.com:
   └─ Browser extension triggers

2. Content item viewed:
   ├─ Title: "明星八卦最新爆料"
   └─ POST /browse
      Payload: {pid:'P001', title:'...', content:'...', is_filter:true}

3. Backend filters content (browse endpoint):
   ├─ Load all active rules for user: [Rule(iid:3, rule='我不想看娱乐八卦...')]
   ├─ Call filter_item(rules, title)
   │  └─ LLM checks: Does "明星八卦最新爆料" match "我不想看娱乐八卦..."?
   │     → YES
   ├─ Create Record(filter_result=True, filter_reason='...', context=rule)
   └─ Return: 1 (filter/hide)

4. Content hidden in browser extension UI
```

---

## Database Schema

**Key Relationships**:

```
Session
  ├─ id (PK)
  ├─ pid (User)
  ├─ task
  ├─ platform
  └─ summary

Message (many)
  ├─ id (PK)
  ├─ session_id (FK → Session)
  ├─ content
  ├─ sender
  ├─ has_action
  └─ timestamp

GenContentlog (many)
  ├─ id (PK)
  ├─ pid
  ├─ action_type
  ├─ new_rule
  ├─ old_rule
  ├─ is_ac (acceptance flag)
  ├─ from_which_session (FK → Session)
  ├─ from_which_message (FK → Message)
  └─ timestamp

Rule (many per user)
  ├─ id (PK)
  ├─ iid (Rule ID within user)
  ├─ pid (User)
  ├─ rule
  ├─ isactive
  ├─ platform
  └─ (no timestamp)

Chilog (many per rule change)
  ├─ id (PK)
  ├─ iid (Rule ID)
  ├─ pid (User)
  ├─ action_type
  ├─ isbot
  ├─ rule
  └─ timestamp

Searchlog (many)
  ├─ id (PK)
  ├─ pid
  ├─ gen_keyword
  ├─ edited_keyword
  ├─ is_accepted
  └─ timestamp

Record (many - browsing/click history)
  ├─ pid
  ├─ title
  ├─ filter_result
  ├─ filter_reason
  ├─ context (matched rule)
  ├─ click
  └─ browse_time
```

---

## Key URLs/Endpoints

### Frontend API Calls

```
GET/POST  /get_alignment              - Get user personality preferences
GET/POST  /get_feedback               - Get filtering feedback
POST      /chatbot                    - Main dialogue endpoint
POST      /chatbot/get_sessions       - Get session list
GET       /chatbot/get_history/{sid}  - Get message history
POST      /save_rules                 - Save/update/delete rule
POST      /make_new_message           - Process user feedback
POST      /browse                     - Record content browse
POST      /click                      - Record content click
POST      /reorder                    - Two-stage reorder
POST      /save_search                - Save search keyword
```

### Data Flow Sequence

```
User types message
    → sendMessage()
    → POST /chatbot
    → get_fuzzy() [LLM analysis]
    → Generate actions []
    → Response with action list
    → ChangeProfile modal pops
    → User confirms/edits
    → saveFunc()
    → POST /save_rules [sync to DB]
    → POST /make_new_message [send feedback]
    → Bot confirms
    → Rules updated in database
```

---

## Important Notes

### Rule Format
- **Dislike rules**: Must start with "我不想看" (I don't want to see)
- **Like rules**: Must start with "我想看" (I want to see)
- Rules are user-defined preference filters

### Action Types
- **Type 1**: Add new rule
- **Type 2**: Update existing rule
- **Type 3**: Delete rule
- **Type 4**: Search keyword

### Task Types
- **Task 0**: Alignment (show user preferences based on browsing history)
- **Task 2**: Feedback (show recently filtered content)

### Platform Codes
- **0**: 知乎 (Zhihu)
- **1**: B站 (Bilibili)
- **2**: 头条 (Toutiao)

### LLM Service
- Provider: Alibaba Bailian QWen
- API: dashscope.Generation.call()
- Config: `agent/prompt/api.json`

### Data Persistence
- **Backend**: Django ORM → SQLite database
- **Frontend**: Chrome Extension Storage API (via utils/Chrome/setItem.js, getItem.js)

---

## Development Tips

### Adding New Features

1. **New Rule Type**: Modify `get_change_rules()` or create new prompt function
2. **New Action Type**: Add to `action['type']` enum, handle in frontend and backend
3. **New Endpoint**: Add view in `agent/views.py`, add URL to `agent/urls.py`
4. **New Prompt**: Add to `agent/prompt/` directory, call via `get_bailian_response()`

### Debugging

1. **Frontend**: Check browser console and Redux DevTools
2. **Backend**: Check `django_debug.log` in root directory
3. **LLM**: Add logging to fuzzy.py, check prompt output
4. **Database**: Use Django admin at `/admin/` or shell: `python manage.py shell`

### Testing Flow

```bash
# 1. Start backend
python manage.py runserver

# 2. Start frontend (in separate terminal)
cd my-profile-buddy-frontend
npm start

# 3. Test endpoints with curl
curl -X POST http://localhost:8000/chatbot \
  -H "Content-Type: application/json" \
  -d '{"sid":-1, "content":"我不想看八卦", "pid":"P001", "task":0, "platform":0}'
```

---

## References

- **Frontend**: React, Ant Design, Markdown rendering
- **Backend**: Django 3.x, Django REST Framework
- **Database**: SQLite (development), supports migration to PostgreSQL
- **LLM**: Alibaba Bailian QWen via dashscope SDK
- **Storage**: Chrome Storage API, LocalStorage

---

## Document History

- **2026-04-05**: Initial comprehensive flow analysis
- **Author**: System Documentation
- **Status**: Complete and ready for development

