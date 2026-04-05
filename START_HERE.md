# 🚀 START HERE - Chatbot Documentation Quick Start

## Welcome to the Chatbot System Documentation!

This is your **first stop** for understanding how the entire chatbot conversation flow and rule generation system works.

---

## ⏱️ I have 5 minutes - What's the TL;DR?

**The system is an intelligent content preference manager that:**
1. Listens to what users say in conversation 
2. Uses AI (LLM) to understand if they want more or less of certain content
3. Proposes rule changes (add/update/delete) based on their preferences
4. Saves rules when users confirm
5. Tracks everything for research

**The pipeline is:**
```
User message → /chatbot endpoint → LLM analyzes → suggests rules 
→ modal shows suggestions → user confirms → /save_rules → database + storage
```

👉 **Next: Read DOCUMENTATION_INDEX.md** (10 min) to pick the right documentation for your role

---

## ⏱️ I have 15 minutes - Quick Overview

1. **Read this file completely** (5 min)
2. **Skim DOCUMENTATION_INDEX.md** (5 min)
3. **Glance at QUICK_REFERENCE.md sections**:
   - Action Types (what are the 4 types?)
   - Platform Constants (which platforms?)
   - Component Props (what data flows where?)

---

## ⏱️ I have 30+ minutes - Proper Onboarding

Follow the path matching **your role**:

### 👨‍💻 If you're a Frontend Developer:
1. README_CHATBOT_SYSTEM.md (15 min) - System overview
2. CHATBOT_FLOW_ANALYSIS.md **Phase 1-3** (15 min) - Frontend flow
3. QUICK_REFERENCE.md (10 min) - Components and props

### 🛠️ If you're a Backend Developer:
1. README_CHATBOT_SYSTEM.md (15 min) - System overview
2. CHATBOT_FLOW_ANALYSIS.md **Phase 4-9** (20 min) - Backend logic
3. DATA_STRUCTURES.md (15 min) - API format and database

### 📊 If you're a Researcher:
1. README_CHATBOT_SYSTEM.md (15 min) - Understand methodology
2. CHATBOT_FLOW_ANALYSIS.md **complete** (60 min) - Full system details
3. DATA_STRUCTURES.md **Tracking section** (15 min) - GenContentlog, Chilog

### 🆕 If you're a New Team Member:
1. README_CHATBOT_SYSTEM.md (20 min)
2. QUICK_REFERENCE.md (10 min) 
3. CHATBOT_FLOW_ANALYSIS.md Phase 1 & Phase 4 (15 min)

---

## 📚 Documentation Files at a Glance

| File | Purpose | Audience | Time |
|------|---------|----------|------|
| **README_CHATBOT_SYSTEM.md** | High-level overview | Everyone | 15-20 min |
| **QUICK_REFERENCE.md** | Developer lookup guide | Developers | 10-15 min |
| **DATA_STRUCTURES.md** | API & database details | Backend devs | 20-30 min |
| **CHATBOT_FLOW_ANALYSIS.md** | Deep technical dive | Architects | 45-60 min |
| **DOCUMENTATION_INDEX.md** | Navigation hub | Everyone | 5-10 min |

---

## 🎯 Common Questions - Where to Find Answers

**"How does the whole system work?"**
→ README_CHATBOT_SYSTEM.md

**"What are the 4 action types?"**
→ QUICK_REFERENCE.md (Action Types section)

**"What data should I send to /chatbot?"**
→ DATA_STRUCTURES.md (API Endpoints section)

**"How does the LLM decide what rules to suggest?"**
→ CHATBOT_FLOW_ANALYSIS.md Phase 5-6

**"What's the database schema?"**
→ DATA_STRUCTURES.md (Database Models section)

**"Where's the frontend code?"**
→ QUICK_REFERENCE.md (File Locations section)

**"I need to debug why rules aren't saving"**
→ CHATBOT_FLOW_ANALYSIS.md Phase 9

**"What's stored in the database vs Chrome storage?"**
→ README_CHATBOT_SYSTEM.md (Dual Storage section)

**"How do I add a new platform?"**
→ QUICK_REFERENCE.md (Platform Constants) + CHATBOT_FLOW_ANALYSIS.md Phase 5

---

## 🔑 Key Concepts (Remember These!)

### 4 Action Types:
- **Type 1**: Add new rule → "I don't want to see this"
- **Type 2**: Update existing rule → "Change my previous rule"
- **Type 3**: Delete rule → "Show me everything again"
- **Type 4**: Search keywords → "Find content about..."

### 9 Pipeline Phases:
1. User types message
2. Send to /chatbot
3. Backend receives
4. Get chat history
5. LLM analyzes (get_fuzzy)
6. Generate actions
7. Frontend gets response
8. Modal shows suggestions
9. Rules saved to DB

### 3 Storage Locations:
- **Chrome storage**: Current rules (source of truth)
- **Database**: All rules + audit trail
- **GenContentlog**: Track user acceptance of AI suggestions

---

## ✅ Documentation Checklist

Use this to track your reading:

- [ ] Skimmed START_HERE.md (you are here!)
- [ ] Read DOCUMENTATION_INDEX.md
- [ ] Read README_CHATBOT_SYSTEM.md
- [ ] Skimmed QUICK_REFERENCE.md
- [ ] (Optional) Read CHATBOT_FLOW_ANALYSIS.md
- [ ] (Optional) Read DATA_STRUCTURES.md for your specific role

---

## 🚨 Need Help?

### If you're confused about:
- **Overall flow**: Start with README_CHATBOT_SYSTEM.md
- **Specific component**: Check QUICK_REFERENCE.md
- **API format**: Check DATA_STRUCTURES.md
- **Why something works this way**: Check CHATBOT_FLOW_ANALYSIS.md for that phase

### If documentation is unclear:
- This is a living document!
- Check if CHATBOT_FLOW_ANALYSIS.md has the detail you need
- Look in the source code comments (marked with Chinese comments)

---

## 📊 Documentation Statistics

- **Total lines**: 2,336 across 5 files
- **Code analyzed**: 2,500+ lines
- **Endpoints documented**: 6+
- **Database models**: 7
- **Components documented**: 5
- **LLM prompts analyzed**: 4
- **Platforms supported**: 3 (知乎, B站, 头条)

---

## 🎓 Next Steps After Reading

1. **Pick your documentation path** based on your role (see section above)
2. **Follow the recommended reading order**
3. **Reference specific docs** when you encounter code
4. **Bookmark QUICK_REFERENCE.md** for fast lookup
5. **Star this project if it helped!** ⭐

---

**Ready to dive in?**

👉 **Next page**: [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md)

Or jump directly to:
- 🏗️ [System Architecture](./README_CHATBOT_SYSTEM.md)
- ⚙️ [Developer Reference](./QUICK_REFERENCE.md)
- 📡 [API & Database](./DATA_STRUCTURES.md)
- 🔍 [Deep Dive Analysis](./CHATBOT_FLOW_ANALYSIS.md)

---

**Last Updated**: April 5, 2026
**Documentation Version**: 1.0
**Project**: My Profile Buddy - Chatbot System
