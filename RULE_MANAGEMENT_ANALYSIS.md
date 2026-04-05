# Django + React Rule Management and Conflict Handling Analysis

## Executive Summary

This system implements a **multi-layered rule management system** with intelligent conflict detection and resolution. The key finding is: **Rules are stored in browser local storage as the primary source of truth**, with the backend acting as a mirror. When users want to modify/override existing rules through chatbot conversation, the system uses LLM-based analysis to detect conflicts and suggests automatic resolution.

---

## 1. RULE STORAGE & MANAGEMENT

### 1.1 Data Models (`agent/models.py`)

```python
class Rule(models.Model):
    iid = models.IntegerField()              # Rule ID (sequence number)
    pid = models.CharField()                 # Participant/User ID
    rule = models.CharField(max_length=100)  # Rule content (text)
    isactive = models.BooleanField()         # Activation status
    platform = models.CharField()            # Platform (知乎, B站, etc.)
```

**Key insight**: Rules have explicit activate/deactivate functionality, allowing users to turn rules on/off without deletion.

### 1.2 Frontend Rule Storage Architecture

**Primary Storage**: Chrome extension local storage (`profiles` key)
- Rules stored as JSON: `[{iid, platform, rule, isactive}, ...]`
- Frontend syncs rules to backend on initialization (`record_user` endpoint)
- All rule CRUD operations happen first in frontend, then synced to backend
- Backend is a **mirror/backup**, not authoritative

```javascript
// From Profile.jsx - Rule must start with "我不想看" or "我想看"
if(item.rule.indexOf("我不想看")!==0 && item.rule.indexOf("我想看")!==0){
    alert("不行,重写! 规则必须以\"我不想看\"或\"我想看\"开头");
    return;
}
```

### 1.3 Rule Format Rules (Constraints)

1. **All rules must start with one of two prefixes**:
   - `我不想看` (I don't want to see) - **negative/filter rules**
   - `我想看` (I want to see) - **positive/preference rules**

2. **Validation occurs at multiple layers**:
   - Frontend validation in `Profile.jsx` (line 131-134)
   - Frontend validation in `ChangeProfile.jsx` (line 378-381)
   - Backend logging in `record_user` and `save_rules`

---

## 2. BACKEND ENDPOINTS FOR RULE MANAGEMENT

### 2.1 `/record_user` - User Initialization & Rule Sync

```python
def record_user(request):
    """When browser extension connects, sync all local rules to backend"""
    pid = json.loads(request.body)['pid']
    profiles = json.loads(request.body)['profiles']  # Rules from browser
    
    # Clear all existing rules for this user
    Rule.objects.filter(pid=pid).delete()
    
    # Save new rules from browser to DB
    for profile in profiles:
        Rule.objects.create(
            iid=profile['iid'],
            pid=pid,
            rule=profile['rule'],
            isactive=profile['isactive'],
            platform=PLATFORM_CHOICES[profile['platform']][0]
        )
```

**Purpose**: Browser → Backend sync when extension starts

---

### 2.2 `/save_rules` - Direct Rule Modification

```python
def save_rules(request):
    """Direct rule CRUD (not via chatbot)"""
    data = json.loads(request.body)
    isbot = data['isbot']      # True if chatbot initiated, False if manual edit
    isdel = data['isdel']      # True to delete, False to add/update
    rule = data['rule']        # Rule content
    rule_id = data['iid']      # Rule ID
    pid = data['pid']
    
    target_rules = Rule.objects.filter(pid=pid, iid=rule_id)
    
    if not isdel:
        if len(target_rules) == 0:
            # ADD new rule
            new_rule = Rule.objects.create(...)
        elif target_rules.first().rule != rule['rule']:
            # UPDATE existing rule
            target_rules.update(rule=rule['rule'], ...)
    else:
        # DELETE rule
        target_rules.delete()
    
    # Log to Chilog with isbot flag
    Chilog.objects.create(
        pid=pid, 
        iid=rule['iid'], 
        action_type='add'|'update'|'delete',
        isbot=isbot  # Track if bot initiated
    )
```

**Key Feature**: Tracks whether rule changes are from chatbot (`isbot=True`) or manual (`isbot=False`)

---

## 3. CHATBOT CONVERSATION FLOW & CONFLICT DETECTION

### 3.1 Dialogue Endpoint (`/chatbot`)

```python
def dialogue(request):
    """Main chatbot endpoint"""
    content = data['content']           # User message
    messages_str = get_his_message_str(sid)  # Chat history
    active_rule = Rule.objects.filter(pid=pid, platform=platform, isactive=True)
    rules_json = json.loads(serializers.serialize('json', active_rule))
    
    # Call fuzzy matching algorithm
    response, actions = get_fuzzy(
        chat_history=messages_str,
        rules=rules_json,
        platform=platform_id,
        pid=pid,
        max_iid=next_iid
    )
    
    # If actions generated, create corresponding log entries
    for action in actions:
        if action['type'] == 1:     # ADD
            GenContentlog.objects.create(..., action_type='add', ...)
        elif action['type'] == 2:   # UPDATE
            GenContentlog.objects.create(..., action_type='update', ...)
        elif action['type'] == 3:   # DELETE
            GenContentlog.objects.create(..., action_type='delete', ...)
        elif action['type'] == 4:   # SEARCH
            Searchlog.objects.create(...)
    
    return {
        "content": response,  # Bot reply (empty if actions)
        "action": actions,    # Rule operations for user confirmation
        ...
    }
```

**Critical Point**: When `actions` is non-empty, the response is EMPTY and the user sees a modal to confirm the proposed rule changes instead of getting a text response.

---

### 3.2 Fuzzy Matching Algorithm (`agent/prompt/fuzzy.py`)

This is where **CONFLICT DETECTION** happens!

#### Step 1: Intent Analysis (Does user want to modify rules?)

```python
def get_has_action(messages):
    """Analyze if user expressed 'want to see' or 'don't want to see' content"""
    prompt = HAS_ACTION_PROMPT.format(messages=messages)
    response = get_bailian_response(...)
    
    # Parse LLM response for:
    # - has_likes:    True if user expressed "想看" (want to see)
    # - has_dislikes: True if user expressed "不想看" (don't want to see)
    # - needs:        What specifically user wants/doesn't want
```

**Example**:
- User: "I don't want to see sports news" → `has_dislikes=True, needs="用户不想看体育新闻"`
- User: "Show me more machine learning" → `has_likes=True, needs="用户想看机器学习"`
- User: "Hello?" → `has_likes=False, has_dislikes=False` (no action)

#### Step 2: Rule Relationship Analysis (Conflict Detection)

```python
def get_analyse_rules(rules, count, histories, needs):
    """Analyze if new need conflicts with existing rules"""
    prompt = ANALYSE_RULES_PROMPT.format(rules=rules, count=count, needs=needs)
    # LLM analyzes: "Does the new need contradict any existing rules?"
```

#### Step 3A: HANDLING "DON'T WANT TO SEE" (Negative Rules)

```python
if has_dislikes:
    # Analyze relationship to existing rules
    analyse, histories = get_analyse_rules(rules_str, count, histories, needs)
    
    # Decide: add new rule or update existing?
    need_add, need_update, histories, update_id, new_rule = get_change_rules(...)
    
    actions = []
    if need_add:
        # User said something new we don't have a rule for
        actions.append({
            "type": 1,  # ADD action
            "profile": {"iid": next_iid, "rule": new_rule, ...}
        })
    elif need_update and update_id:
        # New need is related to existing rule, update it
        actions.append({
            "type": 2,  # UPDATE action
            "profile": {"iid": id_to_iid[int(update_id)-1], "rule": new_rule, ...}
        })
```

#### Step 3B: HANDLING "WANT TO SEE" (Positive Rules) - **THE CONFLICT SCENARIO**

```python
elif has_likes:
    # THIS IS THE CRITICAL PART FOR CONFLICT HANDLING
    
    # Split existing rules into negative and positive
    negative_rules = []   # Rules starting with "我不想看"
    positive_rules = []   # Rules starting with "我想看"
    
    actions = []
    
    # CONFLICT RESOLUTION STEP A: Check for contradictions!
    if negative_rules:
        # User now wants something they previously filtered!
        histories_neg = list(histories)
        analyse, histories_neg = get_analyse_rules(
            neg_rules_str, 
            len(negative_rules), 
            histories_neg, 
            needs  # The new "I want to see X" need
        )
        
        # LLM decides if this contradicts negative rules
        need_del, need_update, operate_id, new_rule = get_contradiction_rules(...)
        
        if need_del:
            # DELETE the conflicting negative rule!
            actions.append({
                "type": 3,  # DELETE
                "profile": {"iid": negative_id_to_iid[int(operate_id)-1], ...}
            })
        elif need_update:
            # UPDATE the negative rule to be more specific/refined
            actions.append({
                "type": 2,  # UPDATE
                "profile": {"iid": ..., "rule": new_rule, ...}
            })
    
    # CONFLICT RESOLUTION STEP B: Add/Update positive rule
    if positive_rules:
        # User has existing positive rules, check if new need relates
        need_add, need_update, histories_pos, update_id, new_rule = \
            get_change_positive_rules(...)
        
        if need_add:
            actions.append({"type": 1, ...})  # ADD positive rule
        elif need_update:
            actions.append({"type": 2, ...})  # UPDATE positive rule
    else:
        # No existing positive rules, just add the new one
        actions.append({"type": 1, ...})
```

**KEY INSIGHT**: When user says "I want to see sports" and there's an existing rule "I don't want to see sports", the algorithm:
1. Detects the contradiction
2. Uses LLM to decide: DELETE or UPDATE the negative rule?
3. Suggests the appropriate action to the user
4. User confirms in the modal before changes are applied

---

## 4. SPECIFIC CONFLICT SCENARIO: "Don't Show Sports" → "I Want Sports"

### Scenario Flow

```
User Profile (existing):
├─ Rule 0: "我不想看体育" (Don't show sports)
└─ Rule 1: "我想看编程" (Show programming)

User types: "我想看体育新闻" (I want to see sports news)

CHATBOT ANALYSIS:
├─ Step 1: get_has_action() → has_likes=True, needs="用户想看体育新闻"
├─ Step 2: get_analyse_rules(negative_rules) 
│   └─ LLM: "新需求与Rule0 '我不想看体育' 冲突"
├─ Step 3: get_contradiction_rules()
│   └─ LLM decides: "应该删除Rule0" (DELETE) or "更新为更具体的规则"
└─ Step 4: Return actions to user
    └─ action[0]: {type: 3, profile: {iid: 0, rule: "我不想看体育"}}  # DELETE
    └─ action[1]: {type: 1, profile: {iid: 2, rule: "我想看体育新闻"}} # ADD

FRONTEND MODAL:
├─ Show: "删除: 我不想看体育"
├─ Show: "添加: 我想看体育新闻"
└─ User clicks "确定" (Confirm)

BACKEND EXECUTION:
├─ Delete Rule 0
├─ Add new Rule 2
└─ Call /make_new_message to generate bot confirmation
    └─ "我帮你完成了如下操作: \n* 删除规则: 我不想看体育 \n* 新增规则: 我想看体育新闻"
```

---

## 5. PROMPT TEMPLATES FOR CONFLICT RESOLUTION

### 5.1 Contradiction Detection Prompt (`DEL_RULES_PROMPT` in `fuzzy.py`)

```python
DEL_RULES_PROMPT = """根据你的分析，请你告诉我应该如何操作已有的规则...
你可以进行"删除""更新"和"无"三种操作：

1、当你新总结的用户需求与某一条已有规则关联性很大且完全矛盾，
   你可以选择"删除"该已有规则。

2、当你新总结的用户需求与某一条已有规则关联性很大且并不完全矛盾，
   可以通过对该规则进行细化而将二者统一起来，
   你可以选择"更新"该已有规则。

3、当你新总结的用户需求与任意一条已有规则的关联性都很小时，
   你可以选择"无"...
"""
```

This prompt explicitly handles THREE scenarios:
1. **Complete contradiction** → DELETE the old rule
2. **Partial contradiction** → UPDATE to refine/narrow the old rule
3. **No conflict** → Do nothing, add new rule separately

---

## 6. USER CONFIRMATION & EXECUTION FLOW

### 6.1 Frontend Modal (ChangeProfile.jsx)

When backend returns `actions`, frontend shows modal:

```javascript
<Modal title="我将帮您进行编辑, 请确认:">
    {/* Show each proposed action */}
    {actionData.map((item) => {
        if(item.type === 1) return <AddItem rule={item.profile.rule} />
        if(item.type === 2) return <UpdateItem oldRule={...} newRule={...} />
        if(item.type === 3) return <DeleteItem rule={item.profile.rule} />
        if(item.type === 4) return <SearchItem keyword={item.keywords[0]} />
    })}
    
    <Button onClick={handleCancel}>取消</Button>  // Reject ALL
    <Button onClick={saveFunc}>确定</Button>     // Accept ALL
</Modal>
```

**Important**: 
- User can EDIT rules before confirming
- Edited rules still must start with "我不想看" or "我想看"
- Users accept or reject ALL actions together (no selective approval per action)

### 6.2 Backend Execution (`/make_new_message`)

```python
def make_new_message(request):
    """Execute confirmed actions and generate bot message"""
    ac_actions = data['ac_actions']    # Accepted actions
    wa_actions = data['wa_actions']    # Rejected actions
    
    # Apply accepted actions to DB/browser
    for action in ac_actions:
        if action['type'] == 1:
            addFunc(action.profile)
        elif action['type'] == 2:
            updateFunc(action.profile.iid, action.profile)
        elif action['type'] == 3:
            deleteFunc(action.profile.iid)
    
    # Generate bot confirmation message
    message_content = "我帮你完成了如下操作:\n\n"
    for action in ac_actions:
        message_content += f"* {action_description}\n"
    
    if len(wa_actions) > 0:
        message_content += "\n但是看起来，你并不希望我帮你:\n\n"
        for action in wa_actions:
            message_content += f"* {action_description}\n"
    
    # Save message and log
    message = Message(session=now_session, content=message_content, sender='assistant')
    message.save()
```

---

## 7. LOGGING & AUDIT TRAIL

### 7.1 Three Logging Tables

1. **Chilog**: Direct rule changes (manual or bot-initiated)
   ```python
   class Chilog(models.Model):
       pid, iid, action_type, isbot, rule, isactive, timestamp
       # isbot=True: chatbot initiated
       # isbot=False: manual edit
   ```

2. **GenContentlog**: Chatbot-proposed rule changes
   ```python
   class GenContentlog(models.Model):
       pid, action_type, new_rule, old_rule, is_ac (accepted?), change_rule, timestamp
       from_which_session, from_which_message
       # Tracks what chatbot suggested vs what user actually changed to
   ```

3. **Searchlog**: Search recommendations
   ```python
   class Searchlog(models.Model):
       pid, platform, gen_keyword, edited_keyword, is_accepted, timestamp
   ```

---

## 8. CONTENT FILTERING WITH RULES (`/browse` endpoint)

Rules are applied when user browses content:

```python
def browse(request):
    """Check if content should be filtered based on rules"""
    all_rules = Rule.objects.filter(pid=params['pid'], isactive=True)
    
    # Call filter_item (agent/prompt/filter.py)
    filter_result, filter_reason, rule = filter_item(all_rules, title)
    
    # Save browsing record with filter result
    interaction = Record(
        filter_result=filter_result,
        filter_reason=filter_reason,
        context=rule  # Which rule caused the filter
    )
```

The `filter_item` function:
1. Analyzes the content title (what topics does it cover?)
2. Checks each active rule (does this rule apply?)
3. Returns first matching rule that filters the content

---

## 9. KEY FINDINGS: CONFLICT HANDLING MECHANISM

### 9.1 Three-Layer Conflict Detection

| Layer | Where | How |
|-------|-------|-----|
| **Frontend** | Profile.jsx, ChangeProfile.jsx | Rule format validation (must start with "我不想看" or "我想看") |
| **LLM Analysis** | fuzzy.py get_analyse_rules() | Semantic analysis of new need vs existing rules |
| **Explicit Rules** | DEL_RULES_PROMPT | LLM decides DELETE/UPDATE/NONE based on contradiction level |

### 9.2 When User Says "I Want X" but Rule Says "Don't Show X"

**System Behavior**:
1. **Detects**: LLM recognizes the contradiction
2. **Analyzes**: Determines if it's complete (delete rule) or partial (refine rule)
3. **Proposes**: Returns 1-2 actions (DELETE + ADD or just ADD)
4. **Confirms**: User sees modal and can edit/reject
5. **Executes**: If confirmed, deletes old rule and adds new rule
6. **Logs**: Tracks all changes with timestamps and user confirmation status

**Example Resolution**:
```
Old Rule: "我不想看任何体育" (I don't want ANY sports)
User: "我想看足球" (I want to see football)

LLM Decision: "完全矛盾" → DELETE old rule + ADD new preference

Backend sends to frontend:
{
  actions: [
    {type: 3, profile: {iid: 0, rule: "我不想看任何体育"}},  // DELETE
    {type: 1, profile: {iid: 2, rule: "我想看足球"}}          // ADD
  ]
}

Alternative if refining:
Old Rule: "我不想看除足球外的体育" (I don't want sports except football)
User: "我想看篮球" (I want to see basketball)

LLM Decision: "部分矛盾" → UPDATE old rule to be more specific

Backend sends:
{
  actions: [
    {type: 2, profile: {iid: 0, rule: "我不想看除足球和篮球外的体育"}}  // UPDATE
  ]
}
```

---

## 10. EDGE CASES & LIMITATIONS

### 10.1 Handled Cases
✅ User adds conflicting positive rule (DELETE/UPDATE negative rule)  
✅ User adds conflicting negative rule (analyzed and updated)  
✅ User can edit proposed rules before confirmation  
✅ User can reject all proposed actions  
✅ All changes are audited and logged  

### 10.2 Potential Issues
⚠️ User can only accept/reject ALL actions together (no per-action toggle)  
⚠️ LLM-based conflict detection might miss semantic nuances  
⚠️ No version control or rollback mechanism for rule changes  
⚠️ Conflict detection only happens through chatbot conversation (not when editing rules directly in Profile page)  

---

## 11. SUMMARY TABLE: RULE CONFLICT HANDLING

```
User Input                          | System Detection        | Action
────────────────────────────────────┼─────────────────────────┼──────────────
"I want sports"                     | has_likes=True          |
(existing: "Don't show sports")     | get_contradiction...()  |
                                    | LLM: "Complete conflict"|→ DELETE old + ADD new
                                    |                         | OR UPDATE old
────────────────────────────────────┼─────────────────────────┼──────────────
"I don't want news"                 | has_dislikes=True       |
(existing: "Show programming")      | get_analyse_rules()     |
                                    | No conflict detected    | → ADD new rule
────────────────────────────────────┼─────────────────────────┼──────────────
"Tell me about your features"       | has_likes=False         |
                                    | has_dislikes=False      | → Common response
                                    | (no action)             | (no rule changes)
────────────────────────────────────┼─────────────────────────┼──────────────
Direct edit: "我不想看……"           | Frontend validation     |
(on Profile page)                   | isbot=False             | → Saved to DB
                                    | Chilog created          | (no LLM analysis)
```

---

## CONCLUSION

The system implements **sophisticated, LLM-driven conflict resolution** for content filter rules:

1. **Smart Detection**: Semantic analysis of user intent vs existing rules
2. **Intelligent Resolution**: LLM decides DELETE (contradiction) vs UPDATE (refinement) vs NONE
3. **User Control**: Modal confirmation before applying changes
4. **Audit Trail**: All changes tracked with bot vs manual origin
5. **Dual Storage**: Browser local storage + backend mirror for resilience

The answer to your specific question: **If rule says "don't show sports" and user says "I want to see sports", the chatbot will propose to DELETE the old rule and ADD a new positive rule, asking user to confirm via modal before executing.**
