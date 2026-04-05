# Quick Reference: Rule Management & Conflict Handling

## TL;DR - The Answer to Your Question

**Q: If a rule says "don't show sports" and user says "I want to see sports", what happens?**

**A:**
1. Chatbot detects the conflict via LLM analysis
2. Proposes to DELETE the old rule AND ADD a new rule
3. Shows user a modal with both actions
4. If user confirms: both changes are executed
5. User gets confirmation message: "我帮你完成了如下操作: 删除规则...新增规则..."

---

## Key Components At A Glance

### 1. Rule Storage
| Component | Location | Role |
|-----------|----------|------|
| **Primary** | Browser local storage | Source of truth, stores all user rules |
| **Secondary** | Backend DB (agent_rule table) | Mirror/backup, used for analysis |

### 2. Rule Format
- **All rules MUST start with one of two prefixes:**
  - `我不想看XXX` - Negative/filter rules
  - `我想看XXX` - Positive/preference rules
- **Validated at:** Frontend (Profile.jsx), Frontend (ChangeProfile.jsx), Backend logs

### 3. Main Endpoints
```
/record_user          → Sync browser rules to backend on init
/save_rules           → Save/update/delete rules (manual or chatbot)
/chatbot              → Process user message via fuzzy matching
/make_new_message     → Execute confirmed actions & generate response
/browse               → Apply filtering based on active rules
```

### 4. Conflict Detection Algorithm (fuzzy.py)
```
1. get_has_action()              → What does user want? (likes/dislikes)
2. get_analyse_rules()           → Does new need conflict with existing rules?
3. get_contradiction_rules()     → If conflict, DELETE or UPDATE?
4. Return actions to frontend    → User confirms via modal
```

### 5. Action Types
| Type | Name | Usage |
|------|------|-------|
| 1 | ADD | Add new rule |
| 2 | UPDATE | Modify existing rule |
| 3 | DELETE | Remove rule |
| 4 | SEARCH | Search for content |

### 6. User Confirmation Flow
```
Backend returns:
  {content: "", action: [...]}
        ↓
Frontend shows modal:
  "我将帮您进行编辑, 请确认:"
  - User can EDIT rules
  - User can REJECT ALL (取消)
  - User can ACCEPT ALL (确定)
        ↓
/make_new_message endpoint:
  - Execute accepted actions
  - Generate confirmation message
  - Update DB & browser storage
```

---

## Conflict Scenarios

### Scenario 1: "Don't Show X" → "I Want X" (Complete Conflict)
```
Before: Rule "我不想看体育"
User: "我想看足球"
↓
Action: [
  {type: 3, profile: {rule: "我不想看体育"}},      // DELETE
  {type: 1, profile: {rule: "我想看足球"}}         // ADD
]
↓
After: Rule "我想看足球" added
```

### Scenario 2: "Don't Show Y" → "I Want X" (Partial Conflict)
```
Before: Rule "我不想看除篮球外的体育"
User: "我想看足球"
↓
Action: [
  {type: 2, profile: {rule: "我不想看除篮球和足球外的体育"}}  // UPDATE
]
↓
After: Rule updated to be more specific
```

### Scenario 3: "Don't Show X" → "I Don't Want Y" (No Conflict)
```
Before: Rule "我不想看体育"
User: "我不想看娱乐"
↓
Action: [
  {type: 1, profile: {rule: "我不想看娱乐"}}      // ADD
]
↓
After: Rule "我不想看娱乐" added
```

### Scenario 4: Just Chatting (No Action)
```
User: "嗨，你好吗？"
↓
has_likes=False, has_dislikes=False
↓
Response: Common chatbot response
Actions: [] (empty)
```

---

## Logging & Audit Trail

### Three Logging Tables
1. **Chilog** - Direct rule changes
   - Tracks: add/update/delete
   - Marks: isbot (True=chatbot, False=manual)

2. **GenContentlog** - Chatbot-proposed changes
   - Tracks: what was suggested vs what user accepted
   - Links to session & message

3. **Searchlog** - Search recommendations

### Example Audit Trail
```
T0: User sends "我想看足球"
    → GenContentlog.create(action='add', new_rule='我想看足球', is_ac=False)

T1: User confirms in modal
    → GenContentlog.update(is_ac=True)
    → Chilog.create(action='add', isbot=True)
    → Message.create(content='我帮你完成了操作...')
```

---

## Frontend Modal (ChangeProfile.jsx)

### What User Sees
```
┌─────────────────────────────────────┐
│ 我将帮您进行编辑, 请确认:          │
├─────────────────────────────────────┤
│ [Action 1]                          │
│ [Action 2]                          │
│ ...                                 │
├─────────────────────────────────────┤
│ [取消]      [确定]                  │
└─────────────────────────────────────┘
```

### What User Can Do
- ✏️ EDIT any rule before confirming
- ❌ REJECT ALL actions (取消)
- ✅ ACCEPT ALL actions (确定)
- ⚠️ Cannot selectively accept/reject individual actions

### Validation on Edit
- Rules must start with "我不想看" or "我想看"
- Alert shown if invalid: "不行,重写! 规则必须以..."

---

## Content Filtering (/browse endpoint)

```
User browses content on platform
     ↓
Frontend sends /browse with:
  - title, content, platform
     ↓
Backend fetches user's active rules
     ↓
Call filter_item():
  1. Analyze content topics
  2. Check each rule
  3. Return first matching rule that filters
     ↓
If filter_result=True:
  - Content blocked
  - Reason recorded
  - Rule recorded
     ↓
Record saved to agent_record table
```

---

## Prompts Used

### HAS_ACTION_PROMPT
Asks: "Does user express 'want to see' or 'don't want to see'?"

### ANALYSE_RULES_PROMPT
Asks: "Does new need relate to existing rules?"

### DEL_RULES_PROMPT (The Key One)
Asks: "Should we DELETE, UPDATE, or do NOTHING?"
- DELETE: Complete contradiction
- UPDATE: Partial contradiction (refine rule)
- NONE: No conflict

### JUDGE_PROMPT
Asks: "Should this content be filtered based on this rule?"

---

## Common Workflows

### Workflow 1: Manual Rule Edit
```
User opens Profile page
  ↓
Clicks edit on rule
  ↓
Changes rule text
  ↓
Clicks save
  ↓
Frontend: /save_rules {isbot: false}
  ↓
Backend: Update DB, create Chilog
  ↓
Frontend: Update browser storage
```

### Workflow 2: Chatbot Suggests Rule Change
```
User sends message in chat
  ↓
Backend: /chatbot
  ↓
get_fuzzy() analyzes message
  ↓
Conflict detected
  ↓
Generate actions
  ↓
Return: {content: "", action: [...]}
  ↓
Frontend: Show modal
  ↓
User: Edit & Confirm
  ↓
Frontend: /make_new_message
  ↓
Backend: Execute actions, create logs
```

### Workflow 3: Init Browser Extension
```
Browser extension loads
  ↓
Get rules from local storage
  ↓
Send /record_user to backend
  ↓
Backend: Clear old rules, insert new ones
  ↓
User can now use extension
```

---

## Important Facts

✅ **Browser is authoritative** - Rules stored locally are the source of truth

✅ **Backend mirrors browser** - DB rules are synced from browser, not the other way

✅ **All changes are logged** - Complete audit trail with timestamps and user confirmation

✅ **LLM powers conflict detection** - Uses Alibaba Bailian API for semantic analysis

✅ **User always confirms** - No automatic rule changes, always via modal

❌ **No per-action toggle** - User accepts/rejects all actions together

❌ **No rule versioning** - No rollback mechanism for rule changes

❌ **Conflict detection only in chatbot** - Direct edits bypass LLM analysis

---

## Edge Cases Handled

| Case | Handling |
|------|----------|
| Rule format invalid | Alert on save, prevent submission |
| Complete rule conflict | DELETE old + ADD new |
| Partial rule conflict | UPDATE old rule (refine) |
| User rejects all actions | Generate "看起来你不希望我..." message |
| User edits proposed rules | Re-validate format before accepting |
| Browser and DB out of sync | /record_user re-syncs on extension start |

---

## Files to Reference

| File | Purpose |
|------|---------|
| `agent/models.py` | Data models (Rule, Chilog, GenContentlog, etc.) |
| `agent/views.py` | API endpoints (/dialogue, /save_rules, etc.) |
| `agent/prompt/fuzzy.py` | **Core conflict detection algorithm** |
| `agent/prompt/filter.py` | Content filtering logic |
| `my-profile-buddy-frontend/src/pages/Profile/Profile.jsx` | Rule management UI |
| `my-profile-buddy-frontend/src/components/ChangeProfile.jsx` | **Action confirmation modal** |
| `my-profile-buddy-frontend/src/components/Chatbot/Chatbot.jsx` | Chat UI |

---

## Decision Matrix: What Happens When...

```
┌─────────────────────────────────┬──────────────────────┬──────────────┐
│ User Action                     │ System Detection     │ Result       │
├─────────────────────────────────┼──────────────────────┼──────────────┤
│ "我想看足球" (want sports)      │ has_likes + conflict │ DELETE old   │
│ (existing: 我不想看体育)        │ with negative rule   │ + ADD new    │
├─────────────────────────────────┼──────────────────────┼──────────────┤
│ "我不想看新闻"                  │ has_dislikes         │ ADD new rule │
│ (existing: 我想看编程)          │ no conflict          │              │
├─────────────────────────────────┼──────────────────────┼──────────────┤
│ Manual edit in Profile page     │ isbot=false          │ Save to DB   │
│                                 │ no LLM analysis      │ (direct)     │
├─────────────────────────────────┼──────────────────────┼──────────────┤
│ "你好" (just chatting)          │ no action detected   │ Common       │
│                                 │                      │ response     │
├─────────────────────────────────┼──────────────────────┼──────────────┤
│ User rejects all in modal       │ wa_actions populated │ "看起来你    │
│                                 │                      │ 不希望我..." │
└─────────────────────────────────┴──────────────────────┴──────────────┘
```

---

## Summary

This is a **sophisticated, LLM-driven personalization system** that:
1. Stores rules in browser (primary) and backend (mirror)
2. Detects rule conflicts through semantic LLM analysis
3. Proposes intelligent resolutions (DELETE/UPDATE vs. ADD)
4. Always confirms with user before applying changes
5. Maintains complete audit trail of all modifications

The answer: **"Don't show sports" + "I want sports" = DELETE + ADD, with user confirmation via modal.**
