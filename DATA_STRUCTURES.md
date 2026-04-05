# Data Structures & API Contracts

This document details the exact data structures that flow through the chatbot system.

---

## Frontend → Backend: POST /chatbot

### Request Body
```javascript
{
  sid: number,              // Session ID (-1 for new session)
  sender: "user",           // Always "user" for frontend messages
  content: string,          // User's message text
  pid: string,              // User ID (e.g., "user123")
  task: number,             // 0=alignment, 2=feedback
  platform: number          // 0=知乎, 1=B站, 2=头条
}
```

### Example
```json
{
  "sid": 42,
  "sender": "user",
  "content": "我不想看政治新闻",
  "pid": "P001",
  "task": 0,
  "platform": 0
}
```

### Response Body
```javascript
{
  code: number,             // 1=SUCCESS, 0=FAILURE
  data: {
    content: string,        // Bot's response (empty if actions present)
    sid: number,            // Session ID (same or new)
    action: [               // Array of suggested actions (empty if no actions)
      {
        type: number,       // 1=Add, 2=Update, 3=Delete, 4=Search
        profile: {          // For types 1,2,3
          iid: number,      // Rule ID
          platform: number, // Platform index
          rule: string,     // Rule text (e.g., "我不想看政治")
          pid: string,      // User ID
          isactive: bool    // Activation status
        },
        keywords: [         // For type 4 (search)
          string            // Keywords to search
        ],
        log_id: number      // Database log record ID (for tracking)
      }
    ],
    task: number,
    platform: number,
    pid: string,
    summary: string
  }
}
```

### Example Response
```json
{
  "code": 1,
  "data": {
    "content": "",
    "sid": 42,
    "action": [
      {
        "type": 1,
        "profile": {
          "iid": 5,
          "platform": 0,
          "rule": "我不想看政治相关内容",
          "pid": "P001",
          "isactive": true
        },
        "keywords": [],
        "log_id": 789
      }
    ],
    "task": 0,
    "platform": 0,
    "pid": "P001",
    "summary": "User expressed dislike of political content"
  }
}
```

---

## Frontend → Backend: POST /save_rules

### Request Body (CREATE)
```javascript
{
  isbot: true,              // Always true (bot-initiated)
  isdel: false,             // false = create/update, true = delete
  rule: {                   // Rule object (profile from action)
    iid: number,
    platform: number,
    rule: string,
    pid: string,
    isactive: bool
  },
  iid: number,              // Rule ID to match against
  pid: string               // User ID
}
```

### Request Body (UPDATE)
```javascript
{
  isbot: true,
  isdel: false,
  rule: {
    iid: 5,
    platform: 0,
    rule: "我不想看政治和娱乐",  // Modified rule
    pid: "P001",
    isactive: true
  },
  iid: 5,                   // Existing rule ID
  pid: "P001"
}
```

### Request Body (DELETE)
```javascript
{
  isbot: true,
  isdel: true,              // true = delete
  rule: {},                 // Empty for deletion
  iid: 5,                   // Rule ID to delete
  pid: "P001"
}
```

### Response Body
```javascript
{
  code: 1,                  // 1=SUCCESS
  data: null
}
```

---

## Frontend → Backend: POST /make_new_message

### Request Body
```javascript
{
  pid: string,              // User ID
  sid: number,              // Session ID
  platform: number,         // Platform index
  ac_actions: [             // Actions user accepted
    {
      type: number,
      profile: { ... },     // Full profile object
      keywords: [...],
      log_id: number
    }
  ],
  wa_actions: [             // Actions user rejected
    {
      type: number,
      profile: { ... },
      keywords: [...],
      log_id: number
    }
  ]
}
```

### Example
```json
{
  "pid": "P001",
  "sid": 42,
  "platform": 0,
  "ac_actions": [
    {
      "type": 1,
      "profile": {
        "iid": 5,
        "platform": 0,
        "rule": "我不想看政治内容",
        "pid": "P001",
        "isactive": true
      },
      "keywords": [],
      "log_id": 789
    }
  ],
  "wa_actions": []
}
```

### Response Body
```javascript
{
  code: 1,
  data: {
    content: string,        // Confirmation message
    sender: "assistant"     // Always "assistant"
  }
}
```

### Example Response
```json
{
  "code": 1,
  "data": {
    "content": "我帮你完成了如下操作:\n\n* 新增规则: 我不想看政治内容 \n\n",
    "sender": "assistant"
  }
}
```

---

## Frontend Local Storage: Chrome Extension

### profiles (Array of Rule Objects)
```javascript
[
  {
    iid: number,            // Unique rule ID
    platform: number,       // 0=知乎, 1=B站, 2=头条
    rule: string,           // Rule text "我不想看..."
    pid: string,            // User ID
    isactive: bool          // Active?
  },
  {
    iid: 1,
    platform: 0,
    rule: "我不想看政治新闻",
    pid: "P001",
    isactive: true
  },
  {
    iid: 2,
    platform: 0,
    rule: "我想看技术相关",
    pid: "P001",
    isactive: false
  }
]
```

---

## Backend Internal: Conversation History Format

Used in LLM prompts via `get_his_message_str()`:

```
user:你好，我想调整内容推荐
assistant:根据你的浏览记录，我发现...
user:我不想看政治新闻
assistant:我理解了...
```

**Format**: `{sender}:{content}\n{sender}:{content}\n...`

---

## Backend Database: Message Table

```python
{
  id: int,
  session_id: int,          # Foreign key to Session
  content: str,             # Message text
  sender: str,              # "user", "bot", "assistant"
  has_action: bool,         # True if user accepted actions
  timestamp: datetime
}
```

### Example
```
id: 123
session_id: 42
content: "我不想看政治新闻"
sender: "user"
has_action: False
timestamp: 2024-04-05 10:30:15
```

---

## Backend Database: Rule Table

```python
{
  id: int,
  iid: int,                 # Rule ID (user-facing)
  pid: str,                 # User ID
  rule: str,                # Rule text
  isactive: bool,           # Active?
  platform: str,            # "知乎", "B站", "头条"
}
```

### Example
```
id: 1001
iid: 5
pid: "P001"
rule: "我不想看政治内容"
isactive: True
platform: "知乎"
```

---

## Backend Database: GenContentlog Table

Tracks AI-generated suggestions:

```python
{
  id: int,
  pid: str,
  action_type: str,         # "add", "update", "delete"
  platform: str,
  new_rule: str,            # Suggested rule
  old_rule: str,            # Previous rule (if update)
  is_ac: bool,              # User accepted? (False initially, True after confirmation)
  change_rule: str,         # User's edited version (if any)
  timestamp: datetime,
  from_which_session_id: int,
  from_which_message_id: int,  # Message with confirmation
}
```

### Example (Before Confirmation)
```
id: 567
pid: "P001"
action_type: "add"
platform: "知乎"
new_rule: "我不想看政治内容"
old_rule: ""
is_ac: False                 # Not yet confirmed
change_rule: ""
timestamp: 2024-04-05 10:30:20
from_which_session_id: 42
from_which_message_id: null  # No confirmation yet
```

### Example (After Confirmation)
```
id: 567
pid: "P001"
action_type: "add"
platform: "知乎"
new_rule: "我不想看政治内容"
old_rule: ""
is_ac: True                  # Confirmed!
change_rule: "我不想看政治新闻和八卦"  # User edited
timestamp: 2024-04-05 10:30:20
from_which_session_id: 42
from_which_message_id: 124   # Confirmation message
```

---

## Backend Database: Chilog Table

Audit trail of all rule changes:

```python
{
  id: int,
  pid: str,
  iid: int,                 # Rule ID
  action_type: str,        # "add", "update", "delete"
  isbot: bool,             # Bot-initiated? True=chatbot, False=direct edit
  rule: str,               # Final rule text
  isactive: bool,          # Final activation state
  platform: str,
  timestamp: datetime
}
```

### Example
```
id: 890
pid: "P001"
iid: 5
action_type: "add"
isbot: True                # Bot suggested, user confirmed
rule: "我不想看政治新闻和八卦"
isactive: True
platform: "知乎"
timestamp: 2024-04-05 10:31:45
```

---

## Backend Database: Searchlog Table

Tracks suggested keywords:

```python
{
  id: int,
  pid: str,
  platform: str,
  gen_keyword: str,        # What bot suggested
  edited_keyword: str,     # What user searched (if different)
  is_accepted: bool,       # User accepted?
  timestamp: datetime
}
```

### Example (After User Accepts)
```
id: 456
pid: "P001"
platform: "知乎"
gen_keyword: "人工智能最新进展"
edited_keyword: "AI最新发展"    # User edited
is_accepted: True
timestamp: 2024-04-05 10:32:00
```

---

## Backend: Action Object Structure

Passed from `get_fuzzy()` to frontend:

### Type 1: Add Rule
```javascript
{
  type: 1,
  profile: {
    iid: 6,                 // New ID
    platform: 0,
    rule: "我不想看政治",
    pid: "P001",
    isactive: true
  },
  keywords: [],
  log_id: 789               // GenContentlog record
}
```

### Type 2: Update Rule
```javascript
{
  type: 2,
  profile: {
    iid: 5,                 // Existing ID
    platform: 0,
    rule: "我不想看政治和娱乐",  // Updated
    pid: "P001",
    isactive: true
  },
  keywords: [],
  log_id: 790
}
```

### Type 3: Delete Rule
```javascript
{
  type: 3,
  profile: {
    iid: 5,                 // ID to delete
    platform: 0,
    rule: "我不想看政治",
    pid: "P001",
    isactive: false         // Will be deactivated
  },
  keywords: [],
  log_id: 791
}
```

### Type 4: Search
```javascript
{
  type: 4,
  profile: {
    iid: -1,                // N/A for search
    platform: 0,
    rule: "",
    pid: "P001",
    isactive: true
  },
  keywords: ["人工智能", "深度学习"],
  log_id: 792               // Searchlog record
}
```

---

## LLM Response Structures

### HAS_ACTION_PROMPT Response
```json
{
  "analysis": "用户在对话中明确表示不想看政治相关内容",
  "choice": "能分析出用户不想看的内容",
  "needs": "用户不想看政治新闻"
}
```

### CHANGE_RULES_PROMPT Response (for dislikes)
```json
{
  "analysis": "用户的需求与规则1关联性很大，两者都涉及政治内容",
  "choice": "更新",
  "rule_id": "1",
  "rule": "我不想看政治新闻和评论"
}
```

### DEL_RULES_PROMPT Response (for likes)
```json
{
  "analysis": "用户想看科技内容，这与规则3（不想看科技）直接矛盾",
  "choice": "删除",
  "rule_id": "3",
  "rule": ""
}
```

---

## Error Response Structure

### Backend Error
```json
{
  "code": 0,
  "data": null,
  "message": "Optional error message"
}
```

---

## Platform Constant Mapping

### Frontend
```javascript
platform = 0  // 知乎
platform = 1  // B站
platform = 2  // 头条
```

### Backend (PLATFORM_CHOICES)
```python
PLATFORM_CHOICES = [
  ('知乎', '知乎'),    # platform=0
  ('B站', 'B站'),      # platform=1
  ('头条', '头条')     # platform=2
]
```

---

## Validation Rules

### Rule Text
```javascript
✓ Starts with "我不想看" or "我想看"
✓ Length: reasonable (< 100 chars)
✓ No special characters causing issues

✗ Empty string
✗ Doesn't start with required prefix
✗ Duplicate of existing rule (warning, but allowed)
```

### Session ID
```javascript
-1           // Special value = create new session
> 0          // Existing session ID
```

### Task Type
```javascript
0            // Alignment (show personalities first)
2            // Feedback (show filtered content first)
```

### Platform Index
```javascript
0            // 知乎 (Zhihu)
1            // B站 (Bilibili)
2            // 头条 (Toutiao)
```

---

## State Transitions

### GenContentlog.is_ac
```
Initial (after suggestion): is_ac = False

User confirms:   is_ac = True    → Rule saved to Rule table
User rejects:    is_ac = False   → Rule NOT saved
```

### Searchlog.is_accepted
```
Initial (after suggestion): is_accepted = False

User confirms:   is_accepted = True
User rejects:    is_accepted = False (or not set)
```

### Rule.isactive
```
When added:      isactive = True
When updated:    isactive = (as specified in update)
When deleted:    isactive = False (or rule removed entirely)
```

