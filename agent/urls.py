from django.urls import path

from .views import *

urlpatterns = [
    path("browse", browse),
    path("click", click),
    path("reorder", reorder),
    path("chatbot", dialogue),
    # path("chatbot/report", report),
    path("chatbot/get_sessions", get_sessions),
    path("save_rules", save_rules),
    path("get_rules", get_rules),
    path("chatbot/get_history/<int:sid>", get_history),
    path("get_alignment", get_alignment),
    path("get_feedback", get_feedback),
    path("save_search", save_search),
    path("make_new_message", make_new_message),
    # path("get_word_count", get_word_count), # 这个是作词云用的,现在废弃了
    path("record_user", record_user),
    path("guided_chat/start", guided_chat_start),
    path("guided_chat/summarize", guided_chat_summarize),
]



# 接口说明
# 1/browse: 内容脚本上报推荐卡片，后端做过滤并返回是否移除。
# 1/click: 内容脚本上报点击行为，记录交互。
# 1/chatbot: 聊天入口，接收用户消息并返回回复/动作。
# 1/chatbot/get_sessions: 拉取会话列表。
# 1/save_rules: 新增/更新/删除规则，同步到后端。
# 1/chatbot/get_history/<sid>: 获取指定会话历史消息。
# 1/get_alignment: 根据浏览和点击，推测用户偏好，并返回对齐（画像/偏好）引导语。
# 1/get_feedback: 返回反馈对话引导语。告诉用户基于规则{rule}过滤了如下内容：{content}，并询问“有什么问题吗”
# 1/save_search: 记录搜索关键词。
# 1/make_new_message: 根据用户确认的动作生成新的机器人消息。
# 1/record_user: 上传本地规则/用户信息到后端。


# /chatbot/report: 报表接口（当前前端未使用）。
# /get_word_count: 词云统计接口（已废弃）。

# make_new_message和dialogue的区别是什么？
# 区别在于职责和触发时机：
# dialogue：处理用户发送的一条聊天消息，创建/更新会话与消息记录，生成机器人回复，可能返回待执行的 action 列表。
# make_new_message：在用户对 action（新增/修改/删除规则、搜索）做出确认/取消之后，再根据已执行/未执行的动作生成新的机器人回复，用于“动作确认后的续聊”。
# 简单说：dialogue 是“用户输入驱动的回复”，make_new_message 是“动作确认结果驱动的回复”。
