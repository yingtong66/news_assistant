# Chatbot System Documentation Index

This directory contains comprehensive documentation about the chatbot conversation flow and rule generation system for the "My Profile Buddy" project.

## Documentation Files

### 1. **README_CHATBOT_SYSTEM.md** (START HERE)
- **Purpose**: High-level overview for anyone new to the system
- **Audience**: Non-technical stakeholders, product managers, researchers
- **Content**: Architecture overview, key innovation, 3 core endpoints, component relationships
- **Length**: ~368 lines
- **Time to read**: 15-20 minutes

### 2. **QUICK_REFERENCE.md** 
- **Purpose**: Fast lookup guide with decision trees and key constants
- **Audience**: Frontend developers, backend developers debugging specific flows
- **Content**: Action type definitions, platform constants, component props, common workflows
- **Length**: ~395 lines
- **Time to read**: 10-15 minutes (as reference)
- **Use case**: "Where does this data come from?" "What are the action types?" "What props does this component need?"

### 3. **DATA_STRUCTURES.md**
- **Purpose**: API contracts, database schemas, type definitions
- **Audience**: Backend developers, API integration specialists
- **Content**: Request/response formats for all endpoints, database model details, error codes
- **Length**: ~631 lines
- **Time to read**: 20-30 minutes (as reference)
- **Use case**: "What should this API response look like?" "What fields does the Rule model have?"

### 4. **CHATBOT_FLOW_ANALYSIS.md**
- **Purpose**: Deep technical dive into the complete 9-phase pipeline
- **Audience**: Full-stack developers, system architects, researchers studying the system
- **Content**: Detailed flow diagrams, code walkthroughs, LLM prompt analysis, decision logic
- **Length**: ~770 lines
- **Time to read**: 45-60 minutes (first time) or 10-15 minutes (specific sections)
- **Use case**: "How does the LLM generate rules?" "What happens after user accepts a rule?"

---

## Quick Navigation by Role

### If you're a **Frontend Developer**:
1. Start with README_CHATBOT_SYSTEM.md (overview)
2. Read CHATBOT_FLOW_ANALYSIS.md sections: "Phase 1-3" (frontend interaction)
3. Reference QUICK_REFERENCE.md for component props and action types

### If you're a **Backend Developer**:
1. Start with README_CHATBOT_SYSTEM.md (overview)
2. Read CHATBOT_FLOW_ANALYSIS.md sections: "Phase 4-9" (backend logic)
3. Reference DATA_STRUCTURES.md for API contracts and DB models
4. Reference QUICK_REFERENCE.md for constants and platform details

### If you're a **Researcher**:
1. Start with README_CHATBOT_SYSTEM.md (understand the research setup)
2. Read CHATBOT_FLOW_ANALYSIS.md completely (understand methodology)
3. Reference DATA_STRUCTURES.md for tracking tables (GenContentlog, Chilog, Searchlog)

### If you're a **New Team Member**:
1. Read README_CHATBOT_SYSTEM.md (15-20 min overview)
2. Skim QUICK_REFERENCE.md (10 min to familiarize with constants)
3. Read CHATBOT_FLOW_ANALYSIS.md Phase 1 & Phase 4 (understand frontend↔backend handoff)

---

## Key Concepts Reference

### The 4 Action Types
- **Type 1**: Add new rule
- **Type 2**: Update existing rule
- **Type 3**: Delete rule
- **Type 4**: Search keywords

### The 2 Data Storage Systems
- **Frontend**: Chrome extension local storage (source of truth for active session)
- **Backend**: Django database (mirror + analytics + research tracking)

### The 3 State Variables in GenContentlog
- **is_ac = False**: AI suggested this rule, user hasn't confirmed yet
- **is_ac = True**: User confirmed this rule
- **is_ac = null**: Search suggestion or rule modification

### The 2 LLM Decision Trees
- **For "不想看" (dislikes)**: Decide if new ADD or UPDATE existing
- **For "想看" (likes)**: Decide if DELETE conflicting or UPDATE existing

### The 5 Steps of get_fuzzy() Algorithm
1. Detect: Does user express any preference? (via HAS_ACTION_PROMPT)
2. Analyze: Which existing rules relate? (via ANALYSE_RULES_PROMPT)
3a. For dislikes: ADD or UPDATE? (via CHANGE_RULES_PROMPT)
3b. For likes: DELETE, UPDATE, or no action? (via DEL_RULES_PROMPT)
4. Return: (response, actions) tuple with decision

---

## File Locations in Project

```
my-profile-buddy-frontend/src/components/
├── Chatbot/
│   ├── Chatbot.jsx ...................... Main chat interface
│   ├── ChatHeader.jsx ................... Header with menu
│   └── SessionList.jsx .................. Session history
└── ChangeProfile.jsx .................... Rule confirmation modal

agent/
├── views.py ............................ Backend endpoints
├── models.py ........................... Database models
├── const.py ............................ Constants & platform choices
└── prompt/
    ├── fuzzy.py ......................... Rule generation algorithm
    ├── prompt_utils.py .................. LLM integration
    ├── __init__.py
    └── ... (other prompt files)
```

---

## System Data Flow (TL;DR)

```
User types message in Chatbot.jsx
         ↓
Frontend sends: {sid, content, pid, task, platform} to /chatbot
         ↓
Backend saves message, calls LLM via get_fuzzy()
         ↓
LLM analyzes conversation history → detects preferences
         ↓
LLM suggests rules changes (ADD/UPDATE/DELETE) → returns actions
         ↓
Backend returns to frontend: {content, action[], sid, ...}
         ↓
Frontend checks: if action.length > 0, show ChangeProfile modal
         ↓
User confirms/edits/cancels in modal
         ↓
Frontend sends each confirmed action to /save_rules
         ↓
Backend saves rules to DB, logs to Chilog & GenContentlog
         ↓
Frontend syncs rules to Chrome storage, updates GenContentlog is_ac=True
         ↓
System ready for next message
```

---

## How to Use This Documentation

### Scenario 1: "I need to fix a bug in the chat sending flow"
→ Read CHATBOT_FLOW_ANALYSIS.md Phase 1-2, then check QUICK_REFERENCE.md for props

### Scenario 2: "How does the LLM decide what rules to suggest?"
→ Read CHATBOT_FLOW_ANALYSIS.md Phase 5-6, then check QUICK_REFERENCE.md for prompts

### Scenario 3: "I need to add a new platform"
→ Read QUICK_REFERENCE.md (Platform Constants), then update const.py and views.py

### Scenario 4: "I'm writing a research paper about this system"
→ Read README_CHATBOT_SYSTEM.md (methodology), then CHATBOT_FLOW_ANALYSIS.md (complete details), then reference DATA_STRUCTURES.md (for metrics tables)

### Scenario 5: "The database schema changed, what needs updating?"
→ Check DATA_STRUCTURES.md (which model changed), QUICK_REFERENCE.md (which code uses it), and grep in source files

---

## Last Updated
- Created: April 5, 2026
- All source code analysis completed
- Documentation verified against actual codebase files

For questions or corrections, refer to the specific documentation file for details and source code references.
