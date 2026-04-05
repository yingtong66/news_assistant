# Quick Reference Guide - Chatbot Rule Generation Flow

## High-Level Summary

**Purpose**: Extract user preferences from chat conversations and intelligently suggest rule modifications (add/update/delete) for content filtering.

**Key Insight**: The system uses LLM to analyze conversation context and determine whether the user wants to see MORE or LESS of certain content types, then suggests appropriate rule changes.

---

## The 3 Main Endpoints

### 1. `/chatbot` (dialogue function)
```
Frontend → Backend
├─ User sends message + sid + pid + task + platform
│
Backend process:
├─ Save user message
├─ Get chat history
├─ Load active rules
├─ Call get_fuzzy() with LLM
│
Backend → Frontend
└─ response (bot message) + actions (rule suggestions)
   └─ If actions exist → Frontend shows ChangeProfile modal
```

**Key Decision Point**: Does the user express a clear preference?
- YES (Dislike) → Suggest ADD or UPDATE rule
- YES (Like) → Suggest DELETE or UPDATE rule  
- NO → Generate generic response, continue conversation

---

### 2. `/save_rules` (save_rules function)
```
Frontend → Backend (for each accepted action)
├─ Rule object + iid + pid + isbot flag
│
Backend process:
├─ Check if rule exists
├─ CREATE / UPDATE / DELETE in Rule table
├─ Log to Chilog table
│
Backend → Frontend
└─ Success response
```

**Three operations**:
- CREATE: New rule doesn't exist
- UPDATE: Rule exists, modify it
- DELETE: Remove rule

---

### 3. `/make_new_message` (make_new_message function)
```
Frontend → Backend
├─ ac_actions (accepted) + wa_actions (rejected)
│
Backend process:
├─ Build confirmation message showing what was done
├─ Save confirmation message to Message table
├─ Update GenContentlog with user acceptance status
│
Backend → Frontend
└─ Confirmation message content
   └─ Frontend displays in chat
```

**Side effects**:
- GenContentlog.is_ac set to True/False based on user choice
- Searchlog records marked as accepted/rejected

---

## Core Algorithm: get_fuzzy()

```
INPUT: chat_history, rules, platform, pid

STEP 1: Analyze Preferences
  get_has_action(messages)
  ├─ Output: has_likes, has_dislikes, needs (description of preference)
  └─ Detects: "我不想看X" or "我想看X"

STEP 2: Map to Existing Rules
  IF has_dislikes OR has_likes:
    ├─ get_analyse_rules() - Compare need to existing rules
    │
    ├─ IF has_dislikes:
    │   └─ get_change_rules() - Decide: ADD new or UPDATE existing?
    │       └─ Output: type (1 or 2), rule_id, new rule text
    │
    └─ IF has_likes:
        └─ get_contradiction_rules() - Decide: DELETE or UPDATE?
            └─ Output: type (3 or 2), rule_id, new rule text

STEP 3: Generate Action List
  └─ actions = [{
       type: 1,2,3,4,
       profile: {rule, iid, platform, ...},
       keywords: [...]
     }]

OUTPUT: (response, actions)
```

---

## LLM Prompts (Alibaba Bailian QWen)

### Prompt 1: HAS_ACTION_PROMPT
**Goal**: Determine if user expressed clear preference

**Input**: Chat history
**Output**: 
```json
{
  "choice": "能分析出用户想看的内容" OR "能分析出用户不想看的内容" OR "不能分析出",
  "needs": "用户想看/不想看的具体需求描述"
}
```

### Prompt 2: ANALYSE_RULES_PROMPT
**Goal**: Map user's need to existing rules

**Input**: List of existing rules + new need
**Output**: Relationship analysis for each rule

### Prompt 3: CHANGE_RULES_PROMPT (Dislike case)
**Goal**: Decide how to handle "不想看" need

**Input**: Analysis + need description
**Output**:
```json
{
  "choice": "新增" OR "更新",
  "rule_id": "id if updating",
  "rule": "我不想看..."
}
```

### Prompt 4: DEL_RULES_PROMPT (Like case)
**Goal**: Decide how to handle "想看" need

**Input**: Analysis + need description
**Output**:
```json
{
  "choice": "删除" OR "更新" OR "无",
  "rule_id": "id if deleting/updating",
  "rule": "updated rule or empty"
}
```

### Prompt 5: REPONSE (No preference detected)
**Goal**: Continue conversation to extract preferences

**Output**: Friendly question encouraging user to express more

---

## Action Types

| Type | What | When | Direction |
|------|------|------|-----------|
| 1 | Add Rule | User says "I don't want to see X" | Creates new rule |
| 2 | Update Rule | Need relates to existing rule | Modifies existing rule |
| 3 | Delete Rule | User says "I want to see X" | Deactivates rule |
| 4 | Search | Suggests related keywords | Opens search in browser |

---

## Frontend Flow (Chatbot.jsx)

```
User Types Message
  ↓
Click Send
  ↓
sendMessage() function:
  ├─ Add message to chat UI (optimistic)
  ├─ POST /chatbot with {sid, content, pid, task, platform}
  ├─ Wait for response
  │
  └─ IF response.action.length > 0:
      └─ setAction(response.action)  → Trigger modal
     ELSE:
      └─ Add bot message to chat
```

---

## Frontend Modal (ChangeProfile.jsx)

```
Modal Appears
  ├─ Shows each action based on type:
  │  ├─ Type 1: AddItem → "新增: [EDITABLE_RULE]"
  │  ├─ Type 2: UpdateItem → "修改: [OLD_RULE] → [EDITABLE_NEW_RULE]"
  │  ├─ Type 3: DeleteItem → "删除: [RULE]"
  │  └─ Type 4: SearchItem → "搜索: [EDITABLE_KEYWORDS]"
  │
  └─ User chooses:
     ├─ Cancel → POST /make_new_message with empty ac_actions
     ├─ Confirm → 
     │  ├─ For each action: POST /save_rules
     │  ├─ POST /make_new_message with ac_actions
     │  └─ Display confirmation message
     │
     └─ Edit → User can inline-edit rules before confirming
        └─ Validation: Rule must start with "我不想看" or "我想看"
```

---

## Database Schema (Simplified)

### Rule (Current Active Rules)
```
iid (int)          - Rule ID
pid (str)          - User ID
rule (str)         - Rule text "我不想看..."
isactive (bool)    - Active?
platform (str)     - 知乎/B站/头条
```

### Message (Chat History)
```
session (FK)       - Links to Session
content (str)      - Message text
sender (str)       - "user", "bot", "assistant"
has_action (bool)  - User accepted actions?
timestamp (dt)     - When sent
```

### GenContentlog (AI-Generated Suggestions)
```
pid (str)          - User ID
action_type (str)  - "add", "update", "delete"
new_rule (str)     - Suggested rule
old_rule (str)     - Previous rule
is_ac (bool)       - User accepted?
change_rule (str)  - User's edited version
from_which_session (FK) - Link to session
from_which_message (FK) - Link to confirmation message
```

### Chilog (All Rule Changes)
```
pid (str)          - User ID
iid (int)          - Rule ID
action_type (str)  - "add", "update", "delete"
isbot (bool)       - Via chatbot?
rule (str)         - Final rule text
```

---

## Storage Strategy

### Frontend (Chrome Extension Storage)
- Key: `"profiles"`
- Value: Array of rule objects
- Updated whenever rules change
- Source of truth for the user

### Backend (Database)
- **Rule table**: Current active rules (mirror of frontend)
- **GenContentlog**: Track AI suggestions + user feedback
- **Chilog**: Complete audit trail
- Used for: Analytics, research, debugging

---

## Important Validation Rules

### Rule Format
```javascript
// Must start with one of these:
✓ "我不想看..."   (I don't want to see...)
✓ "我想看..."    (I want to see...)
✗ "其他格式"     (Other format - rejected)
```

### Action Decision Logic
```
User says "不想看" (dislike):
  ├─ Check if similar rule exists
  ├─ If YES → UPDATE (merge with existing)
  └─ If NO → ADD new rule

User says "想看" (like):
  ├─ Check if conflicting rules exist
  ├─ If YES → DELETE or UPDATE (less restrictive)
  └─ If NO → No action needed

User says nothing clear:
  └─ Generate response to continue conversation
```

---

## Error Handling

| Error | Where | Fallback |
|-------|-------|----------|
| LLM fails to parse JSON | fuzzy.py | Return empty response & no actions |
| Invalid rule format | Frontend | Alert user, reject submission |
| Database error | Backend | Log error, return failure response |
| Missing session | Backend | Auto-create new session |

---

## Session Types (task parameter)

| Task | Value | Behavior |
|------|-------|----------|
| Alignment | 0 | Load user's inferred personalities first |
| Feedback | 2 | Show filtered content records first |

---

## Platform Identifiers

| Platform | Value | Search URL |
|----------|-------|-----------|
| 知乎 (Zhihu) | 0 | `https://www.zhihu.com/search?q={keyword}` |
| B站 (Bilibili) | 1 | `https://search.bilibili.com/all?keyword={keyword}` |
| 头条 (Toutiao) | 2 | `https://so.toutiao.com/search?keyword={keyword}` |

---

## Key Files

### Frontend
- `Chatbot.jsx` - Main chat interface + message sending
- `ChangeProfile.jsx` - Rule modification modal + confirmation

### Backend
- `agent/views.py` - All endpoints (dialogue, save_rules, make_new_message)
- `agent/prompt/fuzzy.py` - Core rule generation algorithm
- `agent/prompt/prompt_utils.py` - LLM integration & helper functions
- `agent/models.py` - Database models

### Configuration
- `agent/prompt/api.json` - LLM API key + model selection
- `agent/const.py` - Constants (platforms, tasks, etc.)

---

## Complete Message Lifecycle

```
1. User types in frontend
2. Frontend: POST /chatbot
3. Backend: dialogue() saves message, calls get_fuzzy()
4. LLM: Analyzes preferences via 5 prompts
5. Backend: Returns actions or generic response
6. Frontend: Shows modal if actions exist
7. User: Accepts/Edits/Cancels
8. Frontend: POST /save_rules for each action
9. Backend: Create/Update/Delete in Rule table
10. Frontend: POST /make_new_message
11. Backend: Build confirmation, update logs
12. Frontend: Display confirmation in chat
```

---

## Performance Considerations

- **LLM Calls**: 1-4 calls per message (slow, but necessary)
- **Database**: Indexed on (pid, platform) for fast lookups
- **Rules**: Loaded fresh each message (not cached)
- **Storage**: Rules stored in both frontend (source) and backend (mirror)

---

## Testing Checklist

- [ ] User can start new chat session
- [ ] Bot detects "不想看" preferences
- [ ] Bot detects "想看" preferences
- [ ] Modal shows correct action types
- [ ] User can edit rule text before confirming
- [ ] Rules validate format before saving
- [ ] Cancel sends rejection to backend
- [ ] Confirm saves rules and sends confirmation
- [ ] Confirmation message displays in chat
- [ ] Rules persist across sessions
- [ ] Search action opens browser correctly

