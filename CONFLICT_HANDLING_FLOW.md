# Rule Conflict Handling - Visual Flow Diagrams

## 1. Overall Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Browser Extension (Chrome)                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Local Storage: profiles = [{iid, rule, isactive}, ...]  │  │
│  │  - PRIMARY source of truth                              │  │
│  │  - All rule edits happen here first                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↑↓                                    │
│                   [sync on init]                                │
│                            ↑↓                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓ /record_user
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Django Backend (DB)                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Table: agent_rule                                      │  │
│  │  - MIRROR/BACKUP of browser rules                       │  │
│  │  - Used for processing & analysis                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Table: agent_message (chat history)                   │  │
│  │  Table: agent_chilog (audit log)                       │  │
│  │  Table: agent_gencontentlog (suggested changes)        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Chatbot Message Processing Flow

```
User types message in chat
       ↓
   /dialogue endpoint
       ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
║    Call: get_fuzzy()                         ║
║    Input:                                    ║
║    - chat_history (message sequence)        ║
║    - active_rules (current user rules)     ║
║    - platform, pid, max_iid                ║
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       ↓
   Step 1: get_has_action()
   ┌─────────────────────────────┐
   │ Does user want to modify    │
   │ content preferences?        │
   │                             │
   │ Returns:                    │
   │ - has_likes                 │
   │ - has_dislikes              │
   │ - needs (what user wants)  │
   └─────────────────────────────┘
       ↓
  ┌────────────────┬────────────────┬─────────────────┐
  │                │                │                 │
  ↓                ↓                ↓                 ↓
has_dislikes   has_likes        has_likes        no action
(I don't want) (I want to see) (positive rule)  (chatting)
  │              │                │                 │
  └─→ Path A     └─→ Path B      └─→ Path B        └─→ Common
     (negative)     (with conflict   (no conflict)    Response
     rules          handling)        
```

---

## 3. CONFLICT DETECTION: Path B Detail (User says "I want X")

```
User: "我想看足球" (I want to see football)
                ↓
        has_likes = True
                ↓
   get_has_action() returns:
   needs = "用户想看足球"
                ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
║ CRITICAL DECISION POINT:                        ║
║ Check existing negative rules                   ║
║ (rules starting with "我不想看")                ║
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                ↓
   ┌─ Have negative rules? ─┐
   │                        │
   YES                      NO
   │                        │
   ↓                        ↓
CONFLICT              NO CONFLICT
RESOLUTION            Just add
   │                  positive rule
   │                        │
   ↓                        ↓
get_analyse_rules()    get_change_positive_rules()
   │                        │
   ↓                        ↓
LLM analyzes:         Add type 1
"Does new need        or Update type 2
contradict any
existing rules?"
   │
   ↓
get_contradiction_rules()
   │
   ┌──────────────────────┬──────────────┐
   │                      │              │
   ↓                      ↓              ↓
Complete           Partial            No
Contradiction      Contradiction      Conflict
   │                   │                 │
   DELETE          UPDATE               └─→ Add new
   type 3          type 2                  positive rule
   │               +                       type 1
   │               ADD type 1
   │               │
   ├──────────────┘
   │
   ↓
Generate Actions list:
[
  {type: 3, profile: {...}},  // DELETE old negative rule
  {type: 1, profile: {...}}   // ADD new positive rule
]
   ↓
Return to frontend
```

---

## 4. Example: "Don't Show Sports" → "I Want Sports"

```
INITIAL STATE:
┌────────────────────────────────────────┐
│ User Rules:                            │
│ [0] "我不想看体育" (isactive: true)   │
│ [1] "我想看编程" (isactive: true)     │
└────────────────────────────────────────┘

User types: "我想看体育新闻" (I want sports news)
                  ↓
─────────────────────────────────────────────
 CHATBOT ANALYSIS
─────────────────────────────────────────────

Step 1: get_has_action()
   Output: has_likes=True, needs="用户想看体育新闻"

Step 2: Scan for negative rules
   Found: Rule[0] = "我不想看体育"
   Overlap: "体育" (sports) appears in both

Step 3: get_analyse_rules(negative_rules)
   LLM: "新需求'想看体育新闻'与Rule[0]'不想看体育'冲突"

Step 4: get_contradiction_rules()
   LLM: "这是完全矛盾(完全冲突)，应该删除Rule[0]"
   Decision: need_del=True

Step 5: get_change_positive_rules()
   LLM: "应该新增正向规则'我想看体育新闻'"
   Decision: need_add=True

Generate Actions:
┌──────────────────────────────────────────┐
│ actions = [                              │
│   {                                      │
│     type: 3,  # DELETE                  │
│     profile: {iid: 0, rule: ...}        │
│   },                                     │
│   {                                      │
│     type: 1,  # ADD                     │
│     profile: {iid: 2, rule: ...}        │
│   }                                      │
│ ]                                        │
└──────────────────────────────────────────┘

─────────────────────────────────────────────
 FRONTEND MODAL
─────────────────────────────────────────────

Modal Title: "我将帮您进行编辑, 请确认:"

┌─────────────────────────────────┐
│ 删除 规则: "我不想看体育"       │
├─────────────────────────────────┤
│ 添加 规则: "我想看体育新闻"     │
├─────────────────────────────────┤
│ [取消]  [确定]                  │
└─────────────────────────────────┘

User can:
- EDIT either rule before confirming
- Click [取消] to REJECT ALL
- Click [确定] to ACCEPT ALL

─────────────────────────────────────────────
 USER ACCEPTS → BACKEND EXECUTION
─────────────────────────────────────────────

/make_new_message endpoint:
  ac_actions = [action1, action2]
  wa_actions = []

For each action in ac_actions:
  if type 3: deleteFunc(iid=0)
  if type 1: addFunc({iid: 2, rule: ...})

Update frontend browser storage:
  profiles.filter(iid != 0)
  profiles.push({iid: 2, rule: ...})

Generate bot message:
  "我帮你完成了如下操作:\n"
  "* 删除规则: 我不想看体育\n"
  "* 新增规则: 我想看体育新闻"

FINAL STATE:
┌────────────────────────────────────────┐
│ User Rules:                            │
│ [1] "我想看编程" (isactive: true)     │
│ [2] "我想看体育新闻" (isactive: true)│
└────────────────────────────────────────┘
```

---

## 5. LLM Decision Tree for Conflict Resolution

```
┌─────────────────────────────────────┐
│ New User Need: "我想看X"           │
│ Existing Negative Rule: "我不想看Y" │
└─────────────────────────────────────┘
           ↓
    ┌──────────────────────────┐
    │ Does X and Y overlap?    │
    │ (semantic analysis by    │
    │  LLM)                    │
    └──────────────────────────┘
           ↓
    ┌──────────────────────────────────┐
    │ NO OVERLAP                       │
    │ → No conflict detected           │
    │ → Just add new positive rule     │
    │   {type: 1}                      │
    └──────────────────────────────────┘
           ↓
    ┌──────────────────────────────────┐
    │ YES, THERE IS OVERLAP            │
    │ → Conflict exists                │
    │ → Analyze severity               │
    └──────────────────────────────────┘
           ↓
    ┌───────────────────────────────────┐
    │ Severity Analysis:               │
    │ - Complete/total conflict?       │
    │ - Partial/specific conflict?     │
    └───────────────────────────────────┘
           ↓
    ┌─────────────────┬────────────────┐
    │                 │                │
    ↓                 ↓                ↓
COMPLETE          PARTIAL            MINOR
CONFLICT          CONFLICT           CONFLICT
   │                 │                  │
   ├─ X is subset of Y    ├─ X overlaps Y    ├─ Similar
   │  e.g., "sports news" │  categories     │   but distinct
   │  vs "sports"         │  e.g., "want    │
   │  → DELETE Y          │  basketball"    │
   │                      │  vs "don't want │
   ├─ Y is explicitly     │  extreme sports"
   │  against X           ├─ UPDATE Y to
   │  e.g., "don't want"  │  be more specific/
   │  any sports" vs      │  refined
   │  "want sports"       │
   │  → DELETE Y          │
   │                      │
   │                      │
   └─ Action: DELETE      ├─ Action: UPDATE
      {type: 3}           │  {type: 2}
                          │
                          └─ New rule:
                             More refined/
                             specific
```

---

## 6. Three-Layer Validation

```
┌──────────────────────────────────────────────────────────┐
│ LAYER 1: Frontend Format Validation                     │
│                                                          │
│ When user edits rule in Profile.jsx:                   │
│ if (!rule.startswith("我不想看") &&                     │
│     !rule.startswith("我想看"))                         │
│   → alert("不行,重写! 规则必须以...")                  │
│   → Don't save                                          │
└──────────────────────────────────────────────────────────┘
                         ↓
         Rules pass Format Validation
                         ↓
┌──────────────────────────────────────────────────────────┐
│ LAYER 2: LLM Intent Analysis (Chatbot only)             │
│                                                          │
│ When user sends message in chat:                        │
│ - get_has_action()                                      │
│ - get_analyse_rules()                                   │
│ - get_change_rules() / get_contradiction_rules()       │
│                                                          │
│ → Semantic analysis of conflicts                        │
│ → Generate proposed actions                            │
└──────────────────────────────────────────────────────────┘
                         ↓
         LLM Analysis produces Actions
                         ↓
┌──────────────────────────────────────────────────────────┐
│ LAYER 3: User Confirmation Modal                        │
│                                                          │
│ Modal shows proposed actions:                           │
│ - User can EDIT rules (re-validated at Layer 1)        │
│ - User can REJECT all                                  │
│ - User can ACCEPT all                                  │
│                                                          │
│ If ACCEPT:                                             │
│ → /save_rules (backend DB update)                      │
│ → /make_new_message (generate bot response)            │
│ → browser setItem('profiles') (local storage sync)     │
└──────────────────────────────────────────────────────────┘
```

---

## 7. Audit Trail

```
When chatbot proposes a rule change:

1. GenContentlog entry created IMMEDIATELY
   └─ is_ac: false (not yet accepted)
   └─ new_rule, old_rule recorded
   └─ from_which_session, from_which_message
   └─ timestamp

2. User confirms in modal
   └─ Frontend applies changes locally
   └─ Backend /save_rules called with isbot=true

3. /make_new_message processes action
   └─ GenContentlog updated: is_ac=true
   └─ change_rule recorded (what user actually confirmed)
   └─ from_which_message linked to bot confirmation

4. Chilog entry created
   └─ Tracks: add/update/delete
   └─ isbot=true (vs manual edit where isbot=false)
   └─ rule, isactive, platform

Timeline for "Delete old, Add new" scenario:
┌──────────────────────────────────────────┐
│ T0: User sends message                   │
│ └─ GenContentlog[A]: is_ac=false (DELETE)│
│ └─ GenContentlog[B]: is_ac=false (ADD)   │
│                                          │
│ T1: User confirms in modal               │
│ └─ GenContentlog[A]: is_ac=true          │
│ └─ GenContentlog[B]: is_ac=true          │
│ └─ Chilog[A]: action=delete, isbot=true │
│ └─ Chilog[B]: action=add, isbot=true     │
│ └─ Message: bot confirmation              │
│                                          │
│ Result: Full audit trail of change      │
└──────────────────────────────────────────┘
```

---

## 8. Data Flow: Browser ↔ Backend Sync

```
┌─ Browser Local Storage ─┐
│                         │
│ profiles = [            │
│   {iid, rule, ...}     │
│ ]                      │
└─────────────────────────┘
         ↓ /record_user (on init)
         ↓
    Backend DB
┌─────────────────────────┐
│ Rule table:             │
│ [                       │
│   {iid, pid, rule, ...} │
│ ]                       │
└─────────────────────────┘

SYNC FLOW:

1. Browser extension detects user login
   → Sends /record_user with all profiles

2. Backend clears old rules
   → Inserts fresh rules from browser

3. User browses content
   → Frontend sends /browse
   → Backend fetches active rules
   → Applies filtering

4. User edits rule in Profile page
   → Frontend calls /save_rules
   → Backend updates DB
   → Frontend updates browser storage

5. User chats with chatbot
   → Frontend sends /chatbot
   → Backend fetches active rules
   → Analyzes via get_fuzzy()
   → Returns proposed actions
   → Frontend shows modal
   → If accepted, /save_rules + /make_new_message

6. Chatbot proposes rule change
   → Backend sends /make_new_message
   → Frontend updates browser storage
   → Browser becomes source of truth again

Key: Frontend (browser) is PRIMARY, Backend is MIRROR
```

---

## 9. State Machine: Rule Conflict Resolution

```
START: User rule conflict detected
   ↓
[ANALYZE_CONFLICT]
   - LLM determines severity
   - has_likes/has_dislikes
   - get_analyse_rules()
   ↓
   ├─→ No Conflict Detected
   │    └─→ [ADD_NEW_RULE]
   │         └─→ Generate type 1 action
   │
   ├─→ Partial Conflict
   │    └─→ [CONFLICT_ANALYSIS]
   │         - Can they coexist with refinement?
   │         ├─→ Yes: [UPDATE_RULE]
   │         │         └─→ Generate type 2 action
   │         └─→ No: [DELETE_AND_ADD]
   │                  └─→ Generate type 3 + type 1
   │
   └─→ Complete Conflict
        └─→ [DELETE_AND_ADD]
             └─→ Generate type 3 + type 1
             ↓
[GENERATE_ACTIONS]
   ├─ type 1: ADD
   ├─ type 2: UPDATE
   ├─ type 3: DELETE
   └─ type 4: SEARCH
   ↓
[SEND_TO_FRONTEND]
   - Empty response
   - Actions list
   ↓
[USER_CONFIRMATION]
   - Show modal
   - User can edit/accept/reject
   ↓
   ├─→ REJECT
   │    └─→ Call /make_new_message(wa_actions=all)
   │         └─→ Generate "看起来你不希望我..." message
   │
   └─→ ACCEPT
        └─→ For each action:
        │    ├─ type 1: addFunc()
        │    ├─ type 2: updateFunc()
        │    └─ type 3: deleteFunc()
        ├─→ Sync to browser
        ├─→ Update DB
        └─→ Call /make_new_message(ac_actions=all)
             └─→ Generate "我帮你完成..." message
             ↓
[COMPLETE]
   - Rules updated
   - Message saved
   - Audit trail created
```

