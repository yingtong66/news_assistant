# Chatbot Conversation Flow & Rule Generation Pipeline

## Overview
This document describes the complete pipeline of how the frontend chatbot component interacts with the backend to generate and save user preference rules. The system is designed to intelligently extract user preferences from conversations and suggest rule modifications (add/update/delete) based on those preferences.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                                │
│                  my-profile-buddy-frontend/                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Chatbot.jsx (Main Chat Interface)                              │
│     ├─ Displays messages (user + bot)                              │
│     ├─ Handles user input and message sending                      │
│     ├─ Manages chat sessions                                       │
│     └─ Triggers ChangeProfile modal when actions needed             │
│                                                                     │
│  2. ChangeProfile.jsx (Rule Modification Modal)                     │
│     ├─ Displays proposed rules to user                             │
│     ├─ Allows editing of rules before acceptance                   │
│     ├─ Shows 4 action types: Add/Update/Delete/Search              │
│     └─ Syncs rules to backend and local storage                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ HTTP Requests
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Django)                                 │
│                     agent/views.py                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. dialogue() - Main Chat Endpoint (/chatbot)                      │
│     ├─ Receives user message + chat context                        │
│     ├─ Saves message to database                                   │
│     ├─ Calls get_fuzzy() for rule generation                       │
│     └─ Returns response + action list to frontend                  │
│                                                                     │
│  2. get_fuzzy() - Core Rule Generation Logic                        │
│     ├─ Analyzes conversation history                               │
│     ├─ Determines if user expressed preferences                    │
│     ├─ Suggests rule changes via LLM (get_bailian_response)        │
│     └─ Generates action list with rules/keywords                   │
│                                                                     │
│  3. save_rules() - Persist Rules to DB (/save_rules)               │
│     ├─ Creates/Updates/Deletes rules                               │
│     └─ Logs all changes to Chilog                                  │
│                                                                     │
│  4. make_new_message() - Process User Feedback (/make_new_message) │
│     ├─ Receives accepted vs rejected actions                       │
│     ├─ Generates confirmation message                              │
│     └─ Updates logs with user's acceptance status                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ LLM Calls
┌─────────────────────────────────────────────────────────────────────┐
│            LLM (Alibaba Bailian QWen)                               │
│            agent/prompt/fuzzy.py & prompt_utils.py                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. get_has_action() - Detect User Preferences                      │
│     ├─ Analyzes if user wants to see or NOT see content            │
│     ├─ Returns: has_likes, has_dislikes, extracted needs            │
│     └─ Prompt: HAS_ACTION_PROMPT                                   │
│                                                                     │
│  2. get_analyse_rules() - Map Needs to Existing Rules              │
│     ├─ Compares new user needs with existing rules                 │
│     └─ Identifies related rules                                    │
│                                                                     │
│  3. get_change_rules() - For "不想看" Needs (Dislike)               │
│     ├─ Decides: ADD new rule or UPDATE existing rule               │
│     └─ Returns generated/updated rule text                         │
│                                                                     │
│  4. get_contradiction_rules() - For "想看" Needs (Like)             │
│     ├─ Decides: DELETE conflicting rule or UPDATE it               │
│     └─ Resolves contradictions in rule set                         │
│                                                                     │
│  5. get_common_response() - Generic Chat Response                   │
│     ├─ When no clear preferences detected                          │
│     └─ Continues conversation to extract preferences               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ Data Storage
┌─────────────────────────────────────────────────────────────────────┐
│                   DATABASE (Django ORM)                             │
│                     agent/models.py                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Key Tables:                                                        │
│  ├─ Session: Chat conversation sessions                            │
│  ├─ Message: Individual messages in sessions                       │
│  ├─ Rule: User-defined preference rules                            │
│  ├─ GenContentlog: Log of AI-generated rules (with acceptance)    │
│  ├─ Chilog: Complete log of all rule changes                      │
│  └─ Searchlog: Log of search queries suggested to users            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Data Flow

### Phase 1: User Sends Message

**Frontend (Chatbot.jsx - sendMessage function)**
```javascript
const userMessage = {sender: "user", message: message, avatar: userAvatar};
setChatHistory(chatHistory => [...chatHistory, userMessage]);

fetch(`${backendUrl}/chatbot`, {
    method: 'POST',
    body: JSON.stringify({
        sid: nowsid,           // Session ID
        sender: "user",
        content: userMessage.message,
        pid: userPid,          // User ID
        task: title,           // Task type (0=alignment, 2=feedback)
        platform: 0            // Platform (0=知乎, 1=B站, 2=头条)
    })
})
```

**Data sent to backend:**
- `sid`: Current session ID (or -1 for new session)
- `content`: User's message text
- `pid`: User identifier
- `task`: Task type (determines bot behavior)
- `platform`: Content platform

---

### Phase 2: Backend Receives & Processes Message

**Backend (agent/views.py - dialogue function)**

1. **Session Management**
   - If `sid == -1` or session doesn't exist → Create new session
   - For task 0 (alignment): Load user's personality preferences
   - For task 2 (feedback): Load filtered content records

2. **Message Persistence**
   ```python
   message = Message(session=session, content=content, sender='user')
   message.save()
   ```

3. **Get Conversation History**
   ```python
   messges_str = get_his_message_str(sid)  # Format: "user:...\nassistant:...\n..."
   ```

4. **Load Current Rules**
   ```python
   rules = Rule.objects.filter(pid=pid, platform=platform)
   active_rule = rules.filter(isactive=True)
   rules_json = json.loads(serializers.serialize('json', active_rule))
   ```

5. **Generate Rules via LLM (Core Logic)**
   ```python
   response, actions = get_fuzzy(
       chat_history=messges_str,
       rules=rules_json,
       platform=platform_id,
       pid=pid,
       max_iid=next_iid
   )
   ```

---

### Phase 3: Rule Generation via LLM

**Backend (agent/prompt/fuzzy.py - get_fuzzy function)**

This is the core algorithm that generates rule suggestions:

#### Step 1: Analyze User Preferences
```python
has_likes, has_dislikes, histories, resp, needs = get_has_action(messages=chat_history)
```

**Prompt (HAS_ACTION_PROMPT):**
- Analyzes chat history to determine user's expressed preferences
- Returns one of three choices:
  - "能分析出用户想看的内容" (Can detect "wants to see")
  - "能分析出用户不想看的内容" (Can detect "doesn't want to see")
  - "不能分析出" (Cannot determine)
- Also extracts `needs` string describing the preference

#### Step 2: Compare with Existing Rules
```python
analyse, histories = get_analyse_rules(rules_str.strip(), count, histories, needs)
```

**Prompt (ANALYSE_RULES_PROMPT):**
- Lists all existing rules and the new need
- LLM analyzes relationship between new need and each existing rule
- Output: Analysis of which rules are related to the new need

#### Step 3a: If "不想看" (Dislike) Need Detected
```python
if has_dislikes:
    need_add, need_update, histories, update_id, new_rule = get_change_rules(histories, needs)
```

**Prompt (CHANGE_RULES_PROMPT):**
- Decides whether to:
  1. **"新增" (Add)**: Create a new rule if no existing rule covers this
  2. **"更新" (Update)**: Modify existing rule if it covers this need
- Output JSON:
  ```json
  {
      "analysis": "...",
      "choice": "新增" or "更新",
      "rule_id": "<id if updating>",
      "rule": "我不想看..." 
  }
  ```

**Action Generated:**
```python
actions.append({
    "type": 1,  # 1=Add, 2=Update
    "profile": {
        "iid": new_id,
        "platform": platform,
        "rule": "我不想看...",
        "pid": pid,
        "isactive": True
    },
    'keywords': []
})
```

#### Step 3b: If "想看" (Like) Need Detected
```python
elif has_likes:
    need_del, need_update, operate_id, new_rule = get_contradiction_rules(histories, needs)
```

**Prompt (DEL_RULES_PROMPT):**
- Decides whether to:
  1. **"删除" (Delete)**: Remove conflicting rule
  2. **"更新" (Update)**: Modify rule to be less restrictive
  3. **"无" (None)**: No change needed
- Output JSON similar to above

**Action Generated:**
```python
actions.append({
    "type": 3,  # 3=Delete, 2=Update
    "profile": {
        "iid": rule_id,
        "platform": platform,
        "rule": "...",
        "pid": pid,
        "isactive": False  # Delete
    },
    'keywords': []
})
```

#### Step 3c: If No Clear Preference
```python
else:
    response = get_common_response(chat_history)
    return response, []  # Continue conversation
```

**Prompt (REPONSE):**
- Generic friendly response encouraging user to express more
- No rules generated
- Response shown directly to user

---

### Phase 4: Log Rule Generation

**Backend (agent/views.py - dialogue function)**

For each generated action, log it to `GenContentlog`:

```python
for action in actions:
    if action['type'] == 1:  # Add
        gen_log = GenContentlog.objects.create(
            pid=pid, 
            action_type='add', 
            platform=platform,
            new_rule=action['profile']['rule'],
            old_rule='',
            is_ac=False,  # Not yet accepted
            from_which_session=session
        )
        action['log_id'] = gen_log.id
    
    elif action['type'] == 2:  # Update
        old_rule = Rule.objects.filter(pid=pid, iid=rule_id).first().rule
        gen_log = GenContentlog.objects.create(
            action_type='update',
            new_rule=action['profile']['rule'],
            old_rule=old_rule,
            is_ac=False,
            from_which_session=session
        )
    
    elif action['type'] == 3:  # Delete
        # Similar to update
        gen_log = GenContentlog.objects.create(
            action_type='delete',
            old_rule=old_rule,
            is_ac=False,
            from_which_session=session
        )
    
    elif action['type'] == 4:  # Search
        search = Searchlog.objects.create(
            pid=pid,
            platform=platform,
            gen_keyword=action['keywords'][0],
            is_accepted=False
        )
        action['log_id'] = search.id
```

---

### Phase 5: Backend Returns to Frontend

**Backend Response:**
```python
return build_response(SUCCESS, {
    "content": response,        # Bot message text (empty if actions present)
    "sid": session.id,          # Session ID (new if just created)
    "action": actions,          # Array of action objects
    "task": session.task,
    "platform": PLATFORMS.index(session.platform),
    "pid": session.pid,
    "summary": session.summary
})
```

---

### Phase 6: Frontend Displays Modal

**Frontend (Chatbot.jsx)**

If `actions.length !== 0`:
```javascript
if(res_data.action.length !== 0) {
    setAction(res_data.action);  // Trigger ChangeProfile modal
} else {
    const newMessage = {sender: "bot", message: res_data['content'], avatar: botAvatar};
    setChatHistory(chatHistory => [...chatHistory, newMessage]);
}
```

**Modal Component (ChangeProfile.jsx)**
- Displays each action in the modal
- Shows different components based on action type:
  - **Type 1 (Add)**: `<AddItem>` - Shows new rule, editable
  - **Type 2 (Update)**: `<UpdateItem>` - Shows old vs new rule, editable
  - **Type 3 (Delete)**: `<DeleteItem>` - Shows rule to be deleted
  - **Type 4 (Search)**: `<SearchItem>` - Shows keywords to search

---

### Phase 7: User Confirmation

**Frontend (ChangeProfile.jsx)**

User has 3 options:

1. **Cancel** → `handleCancel()`
   ```javascript
   fetch(`${backendUrl}/make_new_message`, {
       body: JSON.stringify({
           pid: userPid,
           sid: sid,
           ac_actions: [],        // Empty - no actions accepted
           wa_actions: actionData  // All actions rejected
       })
   })
   ```

2. **Edit & Confirm** → User can edit rules before confirming
   ```javascript
   setActionItemRU(new_rule, index)  // Validates: must start with "我不想看" or "我想看"
   ```

3. **Confirm** → `saveFunc()`
   - For each accepted action:
     - **Type 1**: `addFunc()` → POST to `/save_rules`
     - **Type 2**: `updateFunc()` → POST to `/save_rules`
     - **Type 3**: `deleteFunc()` → POST to `/save_rules`
     - **Type 4**: Search via browser, POST to `/save_search`
   
   - Then calls `/make_new_message` with ac_actions

---

### Phase 8: Save Rules

**Frontend (ChangeProfile.jsx - addFunc/updateFunc/deleteFunc)**

```javascript
async function addFunc(item) {
    const newData = [...nowData, item];
    fetch(`${backendUrl}/save_rules`, {
        method: 'POST',
        body: JSON.stringify({
            isbot: true,          // Bot initiated this rule
            isdel: false,
            rule: item,           // Full rule object
            iid: item.iid,        // Rule ID
            pid: userPid
        })
    })
    // Also saves to browser Chrome storage
    setItem('profiles', newData)
}

async function updateFunc(id, item) {
    const newData = nowData.map(card => card.iid === id ? item : card);
    fetch(`${backendUrl}/save_rules`, {
        body: JSON.stringify({
            isbot: true,
            isdel: false,
            rule: item,
            iid: id,
            pid: userPid
        })
    })
    setItem('profiles', newData)
}

async function deleteFunc(id) {
    const newData = nowData.filter(item => item.iid !== id);
    fetch(`${backendUrl}/save_rules`, {
        body: JSON.stringify({
            isbot: true,
            isdel: true,
            rule: {},            // Empty for deletion
            iid: id,
            pid: userPid
        })
    })
    setItem('profiles', newData)
}
```

**Backend (agent/views.py - save_rules function)**

```python
def save_rules(request):
    data = json.loads(request.body)
    isbot = data['isbot']
    isdel = data['isdel']
    rule = data['rule']
    rule_id = data['iid']
    pid = data['pid']
    
    target_rules = Rule.objects.filter(pid=pid, iid=rule_id)
    
    if not isdel:
        if len(target_rules) == 0:
            # New rule - CREATE
            new_rule = Rule.objects.create(
                iid=rule['iid'],
                pid=pid,
                rule=rule['rule'],
                isactive=rule['isactive'],
                platform=PLATFORM_CHOICES[rule['platform']][0]
            )
            # Log to Chilog
            Chilog.objects.create(
                pid=pid,
                platform=PLATFORM_CHOICES[rule['platform']][0],
                iid=rule['iid'],
                rule=rule['rule'],
                isactive=rule['isactive'],
                action_type='add',
                isbot=isbot
            )
        else:
            # Existing rule - UPDATE
            target_rules.update(
                rule=rule['rule'],
                isactive=rule['isactive'],
                platform=PLATFORM_CHOICES[rule['platform']][0]
            )
            Chilog.objects.create(
                action_type='update',
                isbot=isbot,
                ...
            )
    else:
        # DELETE
        target_rules.delete()
        Chilog.objects.create(
            action_type='delete',
            isbot=isbot,
            ...
        )
    
    return build_response(SUCCESS, None)
```

---

### Phase 9: Process User Feedback

**Frontend (ChangeProfile.jsx - saveFunc after save_rules)**

```javascript
fetch(`${backendUrl}/make_new_message`, {
    method: 'POST',
    body: JSON.stringify({
        pid: userPid,
        sid: sid,
        platform: 0,
        ac_actions: ac_actions,  // Actions user accepted
        wa_actions: wa_actions   // Actions user rejected
    })
})
```

**Backend (agent/views.py - make_new_message function)**

```python
def make_new_message(request):
    data = json.loads(request.body)
    pid = data['pid']
    sid = data['sid']
    ac_actions = data['ac_actions']  # Accepted actions
    wa_actions = data['wa_actions']  # Rejected actions
    
    # Build confirmation message
    message_content = ""
    
    if len(ac_actions) != 0:
        message_content += "我帮你完成了如下操作:\n\n"
        for action in ac_actions:
            if action['type'] == 1:
                message_content += f"* 新增规则: {action['profile']['rule']} \n"
            elif action['type'] == 2:
                message_content += f"* 更新规则: {action['profile']['rule']} \n"
            elif action['type'] == 3:
                message_content += f"* 删除规则: {action['profile']['rule']} \n"
            elif action['type'] == 4:
                message_content += f"* 搜索关键词: {action['keywords'][0]} \n"
        message_content += "\n"
    
    if len(wa_actions) != 0:
        message_content += "但是看起来，你并不希望我帮你:\n\n"
        for action in wa_actions:
            # Similar output
    
    # Save confirmation message
    message = Message(
        session=now_session,
        content=message_content,
        sender='assistant',
        has_action=(len(ac_actions) != 0)
    )
    message.save()
    
    # Update logs - mark actions as accepted/rejected
    for action in ac_actions:
        if action['type'] == 4:  # Search
            search = Searchlog.objects.get(id=action['log_id'])
            search.is_accepted = True
            search.edited_keyword = action['keywords'][0]
            search.save()
        elif action['type'] in [1, 2, 3]:  # Rule operations
            gen_log = GenContentlog.objects.get(id=action['log_id'])
            gen_log.is_ac = True  # Mark as accepted
            gen_log.change_rule = action['profile']['rule']
            gen_log.from_which_message = message
            gen_log.save()
    
    # Similar for wa_actions but with is_ac = False
    
    return build_response(SUCCESS, {
        "content": message.content,
        "sender": message.sender,
    })
```

---

## Action Types Reference

| Type | Name | Direction | LLM Decides | Frontend Shows |
|------|------|-----------|------------|---|
| 1 | Add Rule | User dislikes content | "新增" in get_change_rules | AddItem modal |
| 2 | Update Rule | User adjusts preference | "更新" in get_change_rules or get_contradiction_rules | UpdateItem modal |
| 3 | Delete Rule | User likes content | "删除" in get_contradiction_rules | DeleteItem modal |
| 4 | Search | Related keywords | Part of action in get_fuzzy | SearchItem modal + browser search |

---

## Database Models Used

### GenContentlog
Tracks **AI-generated** rule suggestions and user responses:
- `action_type`: 'add', 'update', 'delete'
- `new_rule`: Suggested rule
- `old_rule`: Previous rule (if updating/deleting)
- `is_ac`: True if user accepted, False if rejected
- `change_rule`: User's edited version of the rule
- `from_which_session`: Linked session
- `from_which_message`: Linked confirmation message

### Chilog
Tracks **all rule changes** (including direct edits):
- `action_type`: 'add', 'update', 'delete'
- `isbot`: True if via chatbot, False if direct management
- `rule`: Final rule text
- `isactive`: Final activation state

### Rule
Stores **current active rules**:
- `iid`: Rule ID
- `rule`: Rule text (e.g., "我不想看XX")
- `isactive`: Whether rule is active
- `platform`: 知乎/B站/头条

---

## Data Flow Summary

```
User Message
    ↓
Frontend: Chatbot.jsx sendMessage()
    ↓ POST /chatbot
Backend: dialogue() 
    ↓
Save Message to DB
    ↓
Get conversation history
    ↓
Load active rules
    ↓
Call get_fuzzy() with LLM
    ├─→ get_has_action() - Detect preference
    ├─→ get_analyse_rules() - Map to existing rules
    ├─→ get_change_rules() or get_contradiction_rules()
    └─→ Generate action list
    ↓
Log actions to GenContentlog (is_ac=False)
    ↓ Return response + actions
Frontend: Chatbot.jsx
    ├─ If actions exist → Trigger ChangeProfile modal
    └─ If no actions → Show bot message
    ↓
User: Confirm/Edit/Cancel
    ├─ CANCEL → POST /make_new_message with empty ac_actions
    │
    └─ CONFIRM → 
        ├─ For each action: POST /save_rules (Create/Update/Delete in Rule table)
        ├─ Also save to Chrome storage
        └─ POST /make_new_message with ac_actions
            ↓
Backend: make_new_message()
    ├─ Build confirmation message
    ├─ Save confirmation message
    ├─ Update GenContentlog.is_ac = True/False
    └─ Return confirmation to frontend
    ↓
Frontend: Display confirmation message in chat
```

---

## Key Algorithms & Prompts

### 1. HAS_ACTION_PROMPT
Determines if user expressed a clear preference:
- Input: Chat history
- Choices: Like / Dislike / Unclear
- Output: needs string with preference description

### 2. ANALYSE_RULES_PROMPT
Maps new need to existing rules:
- Input: New needs + existing rule list
- Process: Analyzes relationships
- Output: Analysis of each rule's relevance

### 3. CHANGE_RULES_PROMPT (For Dislikes)
Decides rule modification:
- Options: Add new / Update existing
- Output: choice, rule_id, new rule text

### 4. DEL_RULES_PROMPT (For Likes)
Handles contradictions:
- Options: Delete / Update / None
- Output: choice, rule_id, new rule text

### 5. REPONSE (Generic)
Continues conversation without rule changes:
- Input: Chat history
- Tone: Helpful, encouraging
- Output: Open-ended question

---

## Rule Format

All rules must follow these patterns:
- **Dislike**: "我不想看XX内容" (e.g., "我不想看政治新闻")
- **Like**: "我想看XX内容" (e.g., "我想看AI相关内容")

Validation in frontend:
```javascript
if(!new_rule.startsWith("我不想看") && !new_rule.startsWith("我想看")) {
    alert("不行,重写! 规则必须以\"我不想看\"或\"我想看\"开头");
}
```

---

## Storage Strategy

### Frontend Storage
- **Chrome Extension Storage** (`profiles`): All user rules
- Synced to backend when rules change
- Acts as source of truth for the user

### Backend Storage
- **Rule table**: Active rules
- **GenContentlog**: AI-generated suggestions + user feedback
- **Chilog**: Complete audit trail of all changes
- Acts as mirror + analytics for the system

---

## Platform Support

- **Platform 0**: 知乎 (Zhihu)
- **Platform 1**: B站 (Bilibili)
- **Platform 2**: 头条 (Toutiao)

Each platform can have different rules and search behaviors.

---

## Error Handling

1. **LLM Parse Errors**: Caught in fuzzy.py, falls back to common response
2. **Invalid Rules**: Frontend validates format before sending
3. **Database Errors**: Logged and caught gracefully
4. **Missing Session**: Auto-creates new session if needed

---

## Notes

- The system is designed to be **non-intrusive**: rules are only suggested, user must accept
- Rules can be **edited by user** before acceptance: frontend allows inline editing
- All changes are **fully logged** for research/analytics
- The LLM uses **context** from chat history to generate relevant rules
- Rules are **session-specific** but stored permanently per user

