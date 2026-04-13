from django.contrib import admin
# 新增：导入导出Admin基类
from import_export.admin import ImportExportModelAdmin

from .models import * 


# 它们都是 Django 管理后台里 “列表/详情页怎么展示和怎么筛选”的配置项：
# 后台：http://127.0.0.1:8000/admin/

# list_display：列表页要显示哪些字段/列。
# list_filter：列表页右侧的过滤器（按字段快速筛选）。
# search_fields：列表页顶部搜索框检索的字段。
# fieldsets：详情/编辑页的字段分组与布局。


# 继承 ImportExportModelAdmin 支持导出
class RecordAdmin(ImportExportModelAdmin):
    list_display = ('pid', 'platform','title', 'filter_result', 'browse_time', 'click', 'click_time','is_filter', 'filter_reason','content')
    list_filter = ['pid', 'platform','filter_result', 'click', 'browse_time', 'click_time']
    search_fields = ['title', 'content', 'context', 'filter_reason']
    fieldsets = [
        ('交互信息', {'fields': ['pid', 'title', 'content', 'click']}),
        ('上下文信息', {'fields': ['context', 'filter_result', 'filter_reason']})
    ]


class RuleAdmin(ImportExportModelAdmin):
    list_display = ('iid', 'pid', 'rule', 'isactive')
    list_filter = ['iid', 'pid', 'isactive']
    search_fields = ['rule']

class SessionAdmin(ImportExportModelAdmin):
    def chat_history(self, obj):
        return obj.message_set.all()
    chat_history.short_description = '聊天记录'

    list_display = ('pid', 'task', 'summary','chat_history')
    list_filter = ['pid', 'task']
    search_fields = ['summary']

# 取消注释，给Message也添加导出功能
class MessageAdmin(ImportExportModelAdmin):
    list_display = ('session', 'content', 'sender', 'has_action')
    list_filter = ['session', 'sender', 'has_action']
    search_fields = ['content', 'sender']

class ChilogAdmin(ImportExportModelAdmin):
    list_display = ('pid', 'iid', 'action_type', "isbot", "rule")
    list_filter = ['pid', 'iid', 'action_type', "isbot"]
    search_fields = ['pid', 'iid', 'action_type','rule']

class GenContentlogAdmin(ImportExportModelAdmin):
    list_display = ('pid', 'action_type','new_rule', 'is_ac', "old_rule", "change_rule")
    list_filter = ['pid', 'action_type','is_ac']
    search_fields = ['new_rule','old_rule', "change_rule"]

class SearchlogAdmin(ImportExportModelAdmin):
    list_display = ('pid', 'gen_keyword','edited_keyword', 'is_accepted')
    list_filter = ['pid', 'is_accepted']
    search_fields = ['gen_keyword','edited_keyword']

class PersonalitiesAdmin(ImportExportModelAdmin):
    list_display = ('pid', 'personality','personality_click', 'first_response')
    list_filter = ['pid',]
    search_fields = ['personality','personality_click', 'first_response']


admin.site.register(Record, RecordAdmin)
admin.site.register(Rule, RuleAdmin)
admin.site.register(Session, SessionAdmin)
admin.site.register(Message, MessageAdmin)  # 绑定导出配置
admin.site.register(Chilog, ChilogAdmin)
admin.site.register(GenContentlog, GenContentlogAdmin)
admin.site.register(Searchlog, SearchlogAdmin)  # 取消注释，启用导出
admin.site.register(Personalities, PersonalitiesAdmin)
admin.site.register(PersonalitiesClick)


class ReorderLogAdmin(ImportExportModelAdmin):
    list_display = ('pid', 'platform', 'timestamp')
    list_filter = ['pid', 'platform']
    search_fields = ['pid']
    readonly_fields = ('pid', 'platform', 'input_items', 'removed_items', 'output_order', 'positive_rules', 'negative_rules', 'timestamp')

admin.site.register(ReorderLog, ReorderLogAdmin)