# Chatbot Rule Generation System - Complete Overview

Welcome! This document provides a birds-eye view of the entire chatbot conversation flow and rule generation system.

## What Does This System Do?

This is an **intelligent content preference management system** that:

1. **Converses with users** about their content preferences (what they want to see or NOT see)
2. **Analyzes conversations** using LLM to extract user preferences
3. **Suggests rule changes** (add/update/delete rules) based on detected preferences
4. **Saves rules** to database when user confirms
5. **Tracks everything** for research and analytics

## Key Innovation

Instead of asking users to manually write filter rules, the system:
- **Listens** to what users say in natural conversation
- **Infers** their preferences automatically
- **Proposes** rule changes with AI reasoning
- **Validates** user acceptance before saving

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND (React)                                                │
│ - Chatbot.jsx: Shows conversation                               │
│ - ChangeProfile.jsx: Shows rule suggestions in modal            │
│ - User can accept/edit/reject rules                             │
└─────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│ BACKEND (Django)                                                │
│ - dialogue(): Main chat endpoint                                │
│ - save_rules(): Persist rules to database                       │
│ - make_new_message(): Handle user confirmation                  │
└─────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│ LLM (Alibaba Bailian QWen)                                      │
│ - Analyzes: Does user want to see/not see content?              │
│ - Suggests: What rule changes to make?                          │
│ - Reasons: Why that decision?                                   │
└─────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│ DATABASE (Django ORM)                                           │
│ - Rule: Current rules                                           │
│ - Message: Chat history                                         │
│ - GenContentlog: Tracking AI suggestions + user feedback        │
│ - Chilog: Complete audit trail                                  │
└─────────────────────────────────────────────────────────────────┘
```

## The 3 Core Endpoints

### 1. POST /chatbot
**Purpose**: Handle user message and generate rule suggestions

**Input**: User's message + chat context
**Output**: Bot response (or empty if rules suggested) + list of suggested actions
**Process**:
- Save message to DB
- Get full chat history
- Load user's active rules
- Call LLM to analyze preferences and suggest rule changes
- Log suggestions to database

### 2. POST /save_rules
**Purpose**: Persist rule changes to database

**Called by**: Frontend, once for each accepted action
**Input**: Rule object (iid, rule text, platform, etc.)
**Process**:
- Check if rule already exists
- CREATE / UPDATE / DELETE in Rule table
- Log all changes to Chilog

### 3. POST /make_new_message
**Purpose**: Handle user's final decision and generate confirmation

**Called by**: Frontend, after all rules are saved
**Input**: Lists of accepted actions + rejected actions
**Output**: Confirmation message showing what was done
**Process**:
- Build human-readable confirmation message
- Save message to chat history
- Update GenContentlog with acceptance status
- Return confirmation to display in chat

## The 5 Key LLM Prompts

1. **HAS_ACTION_PROMPT**: Detect if user wants to see ("想看") or NOT see ("不想看") content
2. **ANALYSE_RULES_PROMPT**: Map user's preference to existing rules
3. **CHANGE_RULES_PROMPT**: For "不想看" - decide to ADD new rule or UPDATE existing
4. **DEL_RULES_PROMPT**: For "想看" - decide to DELETE conflicting rule or UPDATE it
5. **REPONSE**: For unclear preference - generate friendly response to continue conversation

## Rule Types & Decision Logic

### When User Says "不想看" (Dislike)
```
LLM decides: Should I ADD a new rule or UPDATE an existing one?
- ADD if: No existing rule covers this preference
- UPDATE if: An existing rule can be merged with this preference
```

### When User Says "想看" (Like)
```
LLM decides: Should I DELETE a conflicting rule or UPDATE it?
- DELETE if: Rule directly contradicts user's new preference
- UPDATE if: Rule can be modified to be less restrictive
- NONE if: No conflicting rule exists
```

### When No Clear Preference
```
Generate: A friendly conversational response to encourage user to express more
```

## Action Types

| Type | Name | Meaning | Example |
|------|------|---------|---------|
| 1 | Add | Create new rule | User says "不想看政治" → Bot: "Add rule: 我不想看政治新闻" |
| 2 | Update | Modify existing rule | User adds details → Bot: "Update rule from X to Y" |
| 3 | Delete | Remove rule | User says "I want tech content" → Bot: "Delete rule: 我不想看技术" |
| 4 | Search | Suggest keywords | Bot: "Let me search these keywords for you" |

## Complete User Journey

### Step 1: User Types Message
Frontend sends to POST /chatbot
```json
{
  "sid": 42,
  "content": "我不想看政治新闻",
  "pid": "P001",
  "task": 0,
  "platform": 0
}
```

### Step 2: Backend Processes
- Saves message to database
- Gets conversation history
- Loads current rules
- Calls LLM via get_fuzzy()

### Step 3: LLM Analysis
- Detects: "不想看" (dislike)
- Analyzes: Existing rules
- Decides: Add or Update?
- Returns: Suggested rule change

### Step 4: Backend Returns Action
```json
{
  "action": [
    {
      "type": 1,
      "profile": {
        "iid": 5,
        "rule": "我不想看政治相关内容",
        ...
      }
    }
  ]
}
```

### Step 5: Frontend Shows Modal
Modal displays: "We suggest adding this rule: 我不想看政治相关内容"
- Show 3 buttons: Cancel / Edit / Confirm

### Step 6: User Interacts
- **Cancel**: Send rejection to backend
- **Edit**: User modifies rule text
- **Confirm**: Save rule and send confirmation

### Step 7: Rule Saved
If user confirmed:
- Frontend: POST /save_rules
- Backend: Create/Update/Delete in Rule table
- Frontend: POST /make_new_message
- Backend: Build confirmation message
- Frontend: Display confirmation in chat

### Step 8: Session History
All actions tracked:
- GenContentlog: Records what was suggested
- Chilog: Records what was finally saved
- Message: Records conversation history

## How Rules Work

### Rule Format
All rules must start with:
- "我不想看..." (I don't want to see...)
- "我想看..." (I want to see...)

### Rule Examples
```
✓ "我不想看政治新闻"
✓ "我想看技术相关内容"
✓ "我不想看广告和营销"
✓ "我想看分享的生活方式"

✗ "政治新闻" (missing prefix)
✗ "看不想我政治" (wrong order)
```

### Rule Storage
- **Frontend**: Chrome extension localStorage under key "profiles"
- **Backend**: Rule table in database (mirror of frontend)
- **Used by**: Content filtering plugin to decide what to show/hide

## Database Models

### Message
Stores each message in a conversation
- sender: "user", "bot", "assistant"
- content: The message text
- has_action: True if actions were accepted

### Rule
Current active rules
- iid: Rule ID
- rule: Rule text
- isactive: Active or deactivated?
- platform: Which platform (知乎/B站/头条)

### GenContentlog
AI-generated suggestions and user feedback
- action_type: "add", "update", "delete"
- new_rule: What was suggested
- old_rule: What existed before
- is_ac: Did user accept?
- change_rule: User's edited version (if they edited)

### Chilog
Complete audit trail
- Records every rule change
- Tracks: isbot (True if via chatbot, False if direct)
- Timeline: When did it happen?

### Searchlog
Search suggestions
- gen_keyword: What we suggested to search
- edited_keyword: What user actually searched
- is_accepted: Did user perform the search?

## Important Concepts

### Session ID (sid)
- Each chat conversation has a unique session ID
- `sid = -1` means "create new session"
- All messages in a session linked via foreign key
- Rules can span multiple sessions (per user)

### Conversation History
- Formatted as: "user:message\nassistant:response\n..."
- Passed to LLM as context for decision-making
- Recent history is most important (defines current preference)

### Action Logging
Each suggested action gets logged immediately:
- Type: add/update/delete
- Original rule & new rule
- Status: is_ac = False initially
- When user confirms: is_ac = True, final rule saved to Rule table

### User Editing
User can edit rules before confirming:
- Frontend: Inline text editing in modal
- Validation: Must keep "我不想看" or "我想看" prefix
- Backend: Receives edited rule and saves as-is

## Performance Notes

- **LLM calls**: 1-4 per message (depending on preference clarity)
- **Database queries**: Fast due to indexing on (pid, platform)
- **Storage**: Rules live in frontend (Chrome storage), backend mirrors them
- **Latency**: Main bottleneck is LLM response time

## Use Cases

### Use Case 1: Dislike Content
```
User: "I don't like politics"
Bot: "OK, I'll add a rule: 我不想看政治新闻"
User: (Confirm)
Result: New rule saved, future political content filtered
```

### Use Case 2: Refine Preference
```
User: "I want more AI content"
Bot: "I noticed you had a rule blocking tech. Should I remove it?"
User: (Confirm)
Result: Rule deleted, AI content will be shown
```

### Use Case 3: Ambiguous Statement
```
User: "Tell me why you filtered these"
Bot: "These were filtered for policy XYZ. Do you want me to adjust?"
User: (No clear preference yet)
Result: No action, continue conversation
```

## Related Systems

- **Content Filtering**: Uses saved rules to decide what to show/hide
- **Personality Extraction**: Infers user preferences from browsing behavior
- **Search Enhancement**: Suggests keywords related to user's expressed interests
- **Analytics**: Tracks rule generation effectiveness and user behavior

## Files You Should Know

### Frontend
- `Chatbot.jsx` - Main chat interface
- `ChangeProfile.jsx` - Rule modal and confirmation
- Chat styling: `Chatbot.css`

### Backend
- `agent/views.py` - All 3 endpoints + helper functions
- `agent/models.py` - Database schema
- `agent/prompt/fuzzy.py` - Core rule generation algorithm
- `agent/prompt/prompt_utils.py` - LLM integration

### Configuration
- `agent/prompt/api.json` - LLM API key + model selection
- `agent/const.py` - Constants

## Common Questions

**Q: What if the LLM makes a wrong suggestion?**
A: User can edit it or reject it. Frontend validates format. All decisions tracked for research.

**Q: Can users have different rules per platform?**
A: Yes! Rules have a "platform" field. User can have different rules for 知乎 vs B站 vs 头条.

**Q: What if user cancels?**
A: No rule is saved, but we log that user rejected the suggestion (is_ac = False in GenContentlog).

**Q: How does rule deduplication work?**
A: LLM ANALYSE_RULES_PROMPT analyzes if new preference relates to existing rules, decides whether to ADD or UPDATE.

**Q: Can rules be contradictory?**
A: Yes, intentionally. User might say "I want tech" and "I don't want software engineering". System tracks both.

## Testing the System

1. **Happy Path**: User → Message with preference → Accept suggestion → Rule saved
2. **Edit Path**: User → Message → Edit rule text → Save
3. **Cancel Path**: User → Message → Modal appears → Click Cancel → No rule saved
4. **Multi-message**: Conversation over multiple turns, LLM accumulates context
5. **Search Path**: Type 4 action, verify search opens in browser

## Next Steps

For a detailed deep dive:
- See `CHATBOT_FLOW_ANALYSIS.md` for step-by-step breakdown
- See `QUICK_REFERENCE.md` for quick lookup
- See `DATA_STRUCTURES.md` for API contracts and database schema

