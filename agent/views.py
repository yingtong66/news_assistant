import json
import time
from django.http import JsonResponse
from django.core import serializers
import logging
logger = logging.getLogger("myapp")

from agent.prompt.prompt_utils import interval
from .const import SUCCESS, FAILURE, PLATFORM_CHOICES, PLATFORMS
from .models import *
import random
# 重排时取前 N 条候选，可在此修改
REORDER_TOP_N = 30
# 实验模式参数: 取前 50 条候选，过滤+重排后只展示前 10 条
EXPERIMENT_TOP_N = 50
EXPERIMENT_SHOW_N = 10

from .prompt.filter import filter_item
from .prompt.fuzzy import get_fuzzy
# [已废弃] RAH 偏好对齐，已由 guided_chat/start + unit_interpret 替代
# from .prompt.alignment import get_simple_personalities_from_browses, get_simple_personalities_from_clicks

from .utils import build_response, feedback_to_response, get_his_message_str,get_browses_wc, get_clicks_wc
from pypinyin import lazy_pinyin
from online_TwoStage.unit_controll.dialog import get_guidance_question
from online_TwoStage.unit_interpret import run_unit_interpret


# 提取标题首字的排序键：中文取拼音首字母，英文取首字母，其他排到最后
def extract_first_letter_for_sort(title):
    title = title.strip()
    if not title:
        return 'zzz'
    first_char = title[0]
    if first_char.isascii() and first_char.isalpha():
        return first_char.lower()
    py = lazy_pinyin(first_char)
    if py and py[0]:
        return py[0][0].lower()
    return 'zzz'


# 按标题首字母排序，返回重排后的 id 列表
def reorder_by_first_letter(items):
    items_sorted = sorted(items, key=lambda item: extract_first_letter_for_sort(item.get('title', '')))
    return [item.get('id') for item in items_sorted]


def reorder(request):
    if request.method == 'POST':
        params = json.loads(request.body)
        pid = params.get('pid', '')
        platform_idx = params.get('platform', 0)
        platform = PLATFORM_CHOICES[platform_idx][0]
        items = params.get('items', [])
        experiment = params.get('experiment', False)

        # 批量写入浏览记录
        for item in items:
            Record.objects.create(
                pid=pid,
                platform=platform,
                title=item.get('title', ''),
                content='',
                url='',
                is_filter=True,
            )

        from online_TwoStage.pipeline import run_two_stage_reorder
        order, removed_detail, positive_group = run_two_stage_reorder(pid, platform, items)

        # 实验模式: 只展示前 EXPERIMENT_SHOW_N 条
        if experiment:
            order = order[:EXPERIMENT_SHOW_N]
            logger.info("[reorder] 实验模式: 截取前 %d 条展示", EXPERIMENT_SHOW_N)

        return build_response(SUCCESS, {"order": order})
    return build_response(FAILURE, None)


# 过滤阶段接口: 只做 LLM 过滤，返回过滤后的 items 和被移除列表
def reorder_filter(request):
    if request.method == 'POST':
        params = json.loads(request.body)
        pid = params.get('pid', '')
        platform_idx = params.get('platform', 0)
        platform = PLATFORM_CHOICES[platform_idx][0]
        items = params.get('items', [])

        # 批量写入浏览记录
        for item in items:
            Record.objects.create(
                pid=pid, platform=platform,
                title=item.get('title', ''), content='', url='', is_filter=True,
            )

        from online_TwoStage.pipeline import run_filtering_stage
        filtered_items, removed_list = run_filtering_stage(pid, platform, items)
        return build_response(SUCCESS, {
            "filtered_items": filtered_items,
            "removed_list": removed_list,
            "filtered_count": len(filtered_items),
            "removed_count": len(removed_list),
        })
    return build_response(FAILURE, None)


# 重排阶段接口: 对过滤后的 items 做 LLM 重排，返回最终 order
def reorder_rerank(request):
    if request.method == 'POST':
        params = json.loads(request.body)
        pid = params.get('pid', '')
        platform_idx = params.get('platform', 0)
        platform = PLATFORM_CHOICES[platform_idx][0]
        items = params.get('items', [])
        removed_detail = params.get('removed_list', [])
        experiment = params.get('experiment', False)

        from online_TwoStage.pipeline import run_reranking_stage
        order = run_reranking_stage(pid, platform, items, removed_detail)

        # 实验模式: 只展示前 EXPERIMENT_SHOW_N 条
        if experiment:
            order = order[:EXPERIMENT_SHOW_N]
            logger.info("[reorder_rerank] 实验模式: 截取前 %d 条展示", EXPERIMENT_SHOW_N)

        # 写入重排日志
        from agent.models import ReorderLog
        rules = Rule.objects.filter(pid=pid, platform=platform, isactive=True)
        positive_group = [r.rule for r in rules if r.rule.startswith("我想看")]
        negative_group = [r.rule for r in rules if r.rule.startswith("我不想看")]
        ReorderLog.objects.create(
            pid=pid, platform=platform,
            input_items=json.dumps([{"id": str(it.get("id", "")), "title": it.get("title", "")} for it in items], ensure_ascii=False),
            output_order=json.dumps(order, ensure_ascii=False),
            removed_items=json.dumps(removed_detail, ensure_ascii=False),
            positive_rules=json.dumps(positive_group, ensure_ascii=False),
            negative_rules=json.dumps(negative_group, ensure_ascii=False),
        )

        return build_response(SUCCESS, {"order": order})
    return build_response(FAILURE, None)


# 返回重排配置参数给前端
def get_reorder_config(request):
    experiment = request.GET.get('experiment', '') == '1'
    if experiment:
        return build_response(SUCCESS, {"top_n": EXPERIMENT_TOP_N, "show_n": EXPERIMENT_SHOW_N})
    return build_response(SUCCESS, {"top_n": REORDER_TOP_N})


def browse(request): #ok 需要改这个！
    """监控推荐记录+依上下文操纵呈现内容
    Args:
        request: Django HTTP请求对象，包含POST请求数据
        
    Returns:
        JsonResponse: 包含操作结果和过滤数据的响应
    """
    if request.method == 'POST':
        # 解析请求体中的JSON数据
        params = json.loads(request.body)
        
        # 获取当前用户和平台的有效规则
        all_rules = Rule.objects.filter(pid=params['pid'], platform=PLATFORM_CHOICES[params['platform']][0], isactive=True)
        all_rules_json = json.loads(serializers.serialize('json', all_rules)) 
        
        # 创建新的浏览记录对象
        interaction = Record(pid=params['pid'],
                             platform=PLATFORM_CHOICES[params['platform']][0],
                             title=params['title'],
                             content=params['content'],
                             url=params['url'],
                             is_filter=params['is_filter'])
        
        # 初始化返回数据为0（不过滤）
        data = 0
        
        # 如果需要进行内容过滤
        if params['is_filter']: # 是否打开了插件
            # 调用过滤函数，获取过滤结果、原因和匹配的规则
            filter_result, filter_reason, rule = filter_item(all_rules_json, params['title'])
            data = filter_result  # 设置返回数据为过滤结果
            interaction.filter_result = filter_result  # 记录过滤结果
            interaction.filter_reason = filter_reason  # 记录过滤原因
            interaction.context = rule  # 记录匹配的规则上下文
        
        # 保存浏览记录到数据库
        interaction.save()
        
        # 返回成功响应和过滤数据
        return build_response(SUCCESS, data)

def click(request): #ok
    """监控并保存用户点击行为"""
    if request.method == 'POST':
        params = json.loads(request.body)
        interaction = Record.objects.filter(pid=params['pid'],
                                            platform=PLATFORM_CHOICES[params['platform']][0],
                                            title=params['title']).order_by('-browse_time').first()

        if interaction is None:
            return build_response(FAILURE, None)
        interaction.click = True
        interaction.save()
        return build_response(SUCCESS, None)
    
def report(request): #废弃
    """报表"""
    if request.method == 'GET':
        sk = request.validated_params['sk']
        interactions = Record.objects.filter(key=sk)
        interactions_dict_list = [{
            'key': interaction.key,
            'content': interaction.content,
            'click': interaction.click,
            'label_result': interaction.label_result,
            'browse_time': interaction.browse_time,
            'click_time': interaction.click_time,
        } for interaction in interactions]
        return build_response('成功', SUCCESS, interactions_dict_list)
    
def dialogue(request): #ok
    """与用户对话
    Args:
        request: Django HTTP请求对象，包含POST请求数据

    Returns:
        JsonResponse: 包含对话响应、会话信息和操作列表的响应对象
    """
    t_start = time.time()
    # 解析请求体中的JSON数据
    data = json.loads(request.body)
    sid = data['sid']  # 会话ID
    pid = data['pid']  # 参与者ID
    content = data['content']  # 用户输入内容
    task = data['task']  # 任务类型
    platform = PLATFORM_CHOICES[data['platform']][0]  # 平台名称

    # 新建一条用户消息
    try:
        # 尝试获取现有会话
        session = Session.objects.get(id=sid)
    except:
        # 如果会话不存在，创建新会话
        session = Session(pid=pid, task=task, platform=platform, summary="This is a session")
        session.save()
        sid = session.id  # 更新会话ID
        
        # 根据任务类型设置初始系统消息
        if task == 0:
            # 任务0：获取个性化设置并发送欢迎消息
            personalities = Personalities.objects.filter(pid=pid, platform=platform)
            if len(personalities) != 0:
                personalities = personalities.first() 
                sys_message = Message(session=session, content=personalities.first_response, sender='bot')
                sys_message.save()
        elif task == 2:
            # 任务2：基于反馈生成响应
            first_response = feedback_to_response(pid, platform)
            sys_message = Message(session=session, content=first_response, sender='bot')
            sys_message.save()

    # 保存用户消息到数据库
    message = Message(session=session, content=content, sender='user')
    message.save()
    
    # 获取历史对话记录字符串
    messges_str = get_his_message_str(sid)
    
    # 获取当前用户的规则配置
    platform_id = PLATFORMS.index(platform)  # 平台索引
    rules = Rule.objects.filter(pid=pid, platform=platform)  # 所有规则
    active_rule = rules.filter(isactive=True)  # 激活的规则
    rules_json = json.loads(serializers.serialize('json', active_rule))  # 序列化为JSON

    # 设置下一条规则的ID编号
    next_iid = -1
    for rule in rules:
        if rule.iid > next_iid:
            next_iid = rule.iid
    next_iid += 1  # 新规则的ID为当前最大ID+1

    # 调用模糊匹配算法获取响应和操作列表
    response, actions = get_fuzzy(chat_history=messges_str, rules=rules_json, platform=platform_id, pid=pid, max_iid=next_iid)

    # 打印对话结果摘要
    if actions:
        action_types = {1: '新增', 2: '更新', 3: '删除', 4: '搜索'}
        for a in actions:
            atype = action_types.get(a['type'], '未知')
            rule_text = a.get('profile', {}).get('rule', '') or a.get('keywords', [''])[0]
            logger.info("[Dialogue] 操作: %s, 内容: %s", atype, rule_text)
    else:
        logger.info("[Dialogue] 无操作, 普通回复: %s", response[:100] if response else '(空)')

    # 记录生成的操作行为到相应的日志表
    for action in actions:
        if action['type'] == 4:
            # 类型4：搜索操作，记录到搜索日志
            search = Searchlog.objects.create(pid=pid, platform=platform, gen_keyword=action['keywords'][0], is_accepted=False)
            action['log_id'] = search.id
        elif action['type'] == 1:
            # 类型1：添加规则操作，记录到规则生成日志
            gen_content = GenContentlog.objects.create(pid=pid, action_type='add', platform=platform, new_rule=action['profile']['rule'], old_rule='', is_ac=False, change_rule='', from_which_session=session)
            action['log_id'] = gen_content.id
        elif action['type'] == 3:
            # 类型3：更新规则操作，记录到规则生成日志
            rule_id = action['profile']['iid']
            old_rule = Rule.objects.filter(pid=pid, iid=rule_id).first().rule
            gen_content = GenContentlog.objects.create(pid=pid, action_type='update', platform=platform, new_rule=action['profile']['rule'], old_rule=old_rule, is_ac=False, change_rule='', from_which_session=session)
            action['log_id'] = gen_content.id
        elif action['type'] == 2:
            # 类型2：删除规则操作，记录到规则生成日志
            rule_id = action['profile']['iid']
            old_rule = Rule.objects.filter(pid=pid, iid=rule_id).first().rule
            gen_content = GenContentlog.objects.create(pid=pid, action_type='delete', platform=platform, new_rule='', old_rule=old_rule, is_ac=False, change_rule='', from_which_session=session)
            action['log_id'] = gen_content.id
        else:
            # 其他类型操作，不做记录
            pass

    # 如果没有操作行为，保存机器人的响应消息
    if len(actions) == 0:
        bot_message = Message(session=session, content=response, sender='bot')
        bot_message.save()
    
    # 构建并返回响应数据
    elapsed = time.time() - t_start
    logger.info("[Dialogue] 总耗时 %.2fs | pid=%s | 输入: %s", elapsed, pid, content[:60])
    return build_response(SUCCESS,{
        "content": response,  # 机器人响应内容
        "sid": session.id,    # 会话ID
        "action":actions,     # 操作列表
        "task":session.task,  # 任务类型
        "platform":PLATFORMS.index(session.platform),  # 平台索引
        "pid":session.pid,    # 参与者ID
        "summary": session.summary  # 会话摘要
    })

def get_sessions(request): #ok
    """
    获取用户会话列表
    根据用户PID和任务类型查询对应的会话记录
    
    Args:
        request: Django请求对象，包含POST请求数据
        
    Returns:
        Response: 包含会话列表的响应对象
            - 成功时返回SUCCESS状态和会话列表
            - 失败时返回FAILURE状态和空列表
    """
    if request.method == "POST":
        # 解析请求体中的JSON数据
        data = json.loads(request.body)
        # 获取用户PID（唯一标识符）
        pid = data['pid']
        # 获取任务类型
        task = data['task']

        # 根据PID和任务类型过滤会话记录
        sessions = Session.objects.filter(pid=pid, task=task)
        session_list =[]
        # 遍历查询结果，构建会话列表
        for session in sessions:
            session_list.append({
                'sid': session.id,  # 会话ID
                "platform": PLATFORMS.index(session.platform),  # 平台索引
                "task": int(session.task),  # 任务类型
                'summary': session.summary  # 会话摘要
            })
        # 返回成功响应，包含会话列表
        return build_response(SUCCESS, {"sessions": session_list})
    # 非POST请求返回失败响应
    return build_response(FAILURE, {"sessions": []})

def get_rules(request):
    # 获取用户当前所有规则，以后端 DB 为准
    pid = request.GET.get('pid', '')
    platform_idx = int(request.GET.get('platform', 0))
    platform = PLATFORM_CHOICES[platform_idx][0]
    rules = Rule.objects.filter(pid=pid, platform=platform)
    rules_list = [{'iid': r.iid, 'rule': r.rule, 'isactive': r.isactive, 'platform': platform_idx} for r in rules]
    return build_response(SUCCESS, {'rules': rules_list})

def save_rules(request): #ok
    if request.method == "POST":
        data = json.loads(request.body)
        isbot = data['isbot']
        isdel = data['isdel']
        rule = data['rule']
        rule_id = data['iid']
        pid = data['pid']

        target_rules = Rule.objects.filter(pid=pid, iid=rule_id)
        if not isdel:
            if len(target_rules) == 0:
                # 说明是增加
                new_rule = Rule.objects.create(iid=rule['iid'], pid=pid, rule=rule['rule'], isactive=rule['isactive'], platform=PLATFORM_CHOICES[rule['platform']][0])
                # 记录Chilog
                chilog = Chilog.objects.create(pid=pid, platform=PLATFORM_CHOICES[rule['platform']][0], iid=rule['iid'], rule=rule['rule'], isactive=rule['isactive'], action_type='add', isbot=isbot)
            elif target_rules.first().rule != rule['rule'] or target_rules.first().isactive != rule['isactive'] or target_rules.first().platform != PLATFORM_CHOICES[rule['platform']][0]:
                # 说明是更新
                target_rules.update(rule=rule['rule'], isactive=rule['isactive'], platform=PLATFORM_CHOICES[rule['platform']][0])
                # 记录Chilog
                chilog = Chilog.objects.create(pid=pid, platform=PLATFORM_CHOICES[rule['platform']][0], iid=rule['iid'], rule=rule['rule'], isactive=rule['isactive'], action_type='update', isbot=isbot)
        else:  
            target_rules.delete()
            chilog = Chilog.objects.create(pid=pid, iid=rule_id, action_type='delete', isbot=isbot)

        logger.info(f"save rules of {pid}: {Rule.objects.filter(pid=pid)}")
        return build_response(SUCCESS, None)
    return build_response(FAILURE, None)
    
def get_history(request, sid): #ok
    """
    获取指定会话的历史消息记录
    
    Args:
        request: Django HTTP请求对象
        sid: 会话ID，用于标识特定的对话会话
        
    Returns:
        JsonResponse: 包含会话历史消息的JSON响应
            - 成功时返回包含消息列表的响应
            - 失败时返回错误响应
    """
    # 检查请求方法是否为GET
    if request.method == "GET":
        # 查询指定会话的所有消息，按时间戳升序排列
        messages = Message.objects.filter(session=sid).order_by('timestamp')
        messages_list = []
        
        # 将消息对象转换为字典格式
        for message in messages:
            messages_list.append({
                "content": message.content,    # 消息内容
                "sender": message.sender,      # 消息发送者
            })
        
        # 返回成功的响应，包含消息列表
        return build_response(SUCCESS, {"messages": messages_list})
    
    # 如果请求方法不是GET，返回失败响应
    return build_response(FAILURE, None)

def save_search(request): #ok
    # 保存搜索的关键词
    if request.method == "POST":
        data = json.loads(request.body)
        pid = data['pid']
        platform = PLATFORM_CHOICES[data['platform']][0]
        keyword = data['keyword']
        search = Searchlog(pid=pid, platform=platform, keyword=keyword, is_accepted=True)
        search.save()
        return build_response(SUCCESS, None)
    return build_response(FAILURE, None)

# 从 Personalities 缓存读取偏好摘要，供 Dashboard 历史偏好区展示
def get_alignment(request):
    data = json.loads(request.body)
    pid = data['pid']
    platform = PLATFORM_CHOICES[data['platform']][0]
    personality = Personalities.objects.filter(pid=pid, platform=platform).first()
    personalities = personality.personality if personality and personality.personality else ''
    return build_response(SUCCESS, {"personalities": personalities})


# [已废弃] RAH 偏好对齐，已由 guided_chat/start + unit_interpret 替代
# def get_alignment(request):
#     """
#     获取用户偏好对齐信息
#     基于（之前已保存的）用户的浏览和点击记录，分析用户偏好并生成个性化响应（回复）
#     """
#     data = json.loads(request.body)
#     platform = PLATFORM_CHOICES[data['platform']][0]
#     pid = data['pid']
#     browses = Record.objects.filter(pid=pid, platform=platform, is_filter=True).order_by('-browse_time')
#     if len(browses) == 0:
#         return build_response(SUCCESS, {"personalities": [], "response": "你最近没有浏览记录"})
#     browses_title = [browse.title for browse in browses[:min(10, len(browses))]]
#     clicks = browses.filter(click=True)
#     click_titles = [click.title for click in clicks[:min(10, len(clicks))]]
#     try:
#         now_personality = Personalities.objects.filter(pid=pid, platform=platform).first()
#         if browses[0].browse_time <= now_personality.update_time and clicks[0].click_time <= now_personality.update_time:
#             return build_response(SUCCESS, {"personalities": now_personality.personality, "response": now_personality.first_response})
#         else:
#             personalities = get_simple_personalities_from_browses(browses=browses_title).strip()
#             try:
#                 personality_click = PersonalitiesClick.objects.filter(pid=pid, platform=platform).first().personality_click
#                 assert len(personality_click)>0
#             except:
#                 if len(click_titles)>0:
#                     personality_click = get_simple_personalities_from_clicks(clicks=click_titles).strip()
#                 else:
#                     personality_click=""
#             if len(click_titles)>0:
#                 first_response = f"根据**平台推荐**，你可能喜欢\n{personalities}\n\n 而根据你的**点击内容**，我猜你的偏好是\n{personality_click}\n\n 请问有什么可以帮助你的吗？"
#             else:
#                 first_response = f"根据**平台推荐**，你可能喜欢\n{personalities}\n\n 而你都没有点击, 是不是不喜欢这些内容？"
#             now_personality.personality_click = personality_click
#             now_personality.personality = personalities
#             now_personality.first_response = first_response
#             now_personality.save()
#             return build_response(SUCCESS, {"personalities": now_personality.personality, "response": now_personality.first_response})
#     except:
#         personalities = get_simple_personalities_from_browses(browses=browses_title).strip()
#         try:
#             personality_click = PersonalitiesClick.objects.filter(pid=pid, platform=platform).first().personality_click
#             assert len(personality_click)>0
#         except:
#             if (len(click_titles)>0):
#                 personality_click = get_simple_personalities_from_clicks(clicks=click_titles).strip()
#             else:
#                 personality_click=""
#         if len(click_titles)>0:
#             first_response = f"根据**平台推荐**，你可能喜欢\n{personalities}\n\n 而根据你的**点击内容**，我猜你的偏好是\n{personality_click}\n\n 请问有什么可以帮助你的吗？"
#         else:
#             first_response = f"根据**平台推荐**，你可能喜欢\n{personalities}\n\n 而你都没有点击, 是不是不喜欢这些内容？"
#         now_personality = Personalities(pid=pid, platform=platform, personality=personalities, personality_click=personality_click, first_response=first_response)
#         now_personality.save()
#         return build_response(SUCCESS, {"personalities": now_personality.personality, "response": now_personality.first_response})

def get_feedback(request): #ok
    # 告诉用户近期基于规则{rule}过滤了如下内容：{content}，并询问“有什么问题吗”
    # 调用feedback_to_response函数
    data = json.loads(request.body)
    platform = PLATFORM_CHOICES[data['platform']][0]
    pid = data['pid']
    response = feedback_to_response(pid, platform) 
    return build_response(SUCCESS, {"response": response}) 

def make_new_message(request): #ok
    """
    创建新的消息并处理用户操作反馈
    
    该函数用于处理用户对AI建议操作（规则管理、搜索等）的确认或拒绝反馈，
    生成相应的系统消息，并更新相关日志记录。
    
    Args:
        request: Django HTTP请求对象，包含POST请求数据
        
    Returns:
        JsonResponse: 包含新消息内容和发送者信息的响应
    """
    if request.method == "POST":
        # 解析请求数据
        data = json.loads(request.body)
        pid = data['pid']  # 用户ID
        sid = data['sid']  # 会话ID
        platform = PLATFORM_CHOICES[data['platform']][0]  # 平台类型
        ac_actions = data['ac_actions']  # 用户接受的操作列表
        wa_actions = data['wa_actions']  # 用户拒绝的操作列表

        # 验证会话是否存在
        now_session = Session.objects.filter(id=sid, pid=pid, platform=platform)
        if len(now_session) == 0:
            logger.error("[make_new_message] 找不到会话: sid=%s, pid=%s, platform=%s", sid, pid, platform)
            return build_response(FAILURE, None)
        now_session = now_session.first()
        
        # 构建消息内容
        message_content = ""
        
        # 处理用户接受的操作
        if len(ac_actions) != 0:
            message_content += "我帮你完成了如下操作:\n\n"
            for action in ac_actions:
                if action['type'] == 1:
                    message_content += f"* 新增规则: {action['profile']['rule']} \n"
                elif action['type'] == 3:
                    message_content += f"* 删除规则: {action['profile']['rule']} \n"
                elif action['type'] == 2:
                    message_content += f"* 更新规则: {action['profile']['rule']} \n"
                elif action['type'] == 4:
                    message_content += f"* 搜索关键词: {action['keywords'][0]} \n"
            message_content += "\n"
            
        # 处理用户拒绝的操作
        if len(wa_actions) != 0:
            message_content += "但是看起来，你并不希望我帮你:\n\n"
            for action in wa_actions:
                if action['type'] == 1:
                    message_content += f"* 新增规则: {action['profile']['rule']} \n"
                elif action['type'] == 3:
                    message_content += f"* 删除规则: {action['profile']['rule']} \n"
                elif action['type'] == 2:
                    message_content += f"* 更新规则: {action['profile']['rule']} \n"
                elif action['type'] == 4:
                    message_content += f"* 搜索关键词: {action['keywords'][0]} \n"
                    
        # 创建并保存消息记录
        message = Message(session=now_session, content=message_content, sender='assistant', has_action=(len(ac_actions)!=0))
        message.save()

        # 更新会话摘要（简单示意）
        now_session=Session.objects.get(id=sid)
        now_session.summary = message_content
        now_session.save()

        # 更新日志记录 - 处理接受的操作
        for action in (ac_actions):
            if action['type'] == 4:  # 搜索操作
                search = Searchlog.objects.get(id=action['log_id'])
                search.is_accepted = True  # 标记为已接受
                search.edited_keyword = action['keywords'][0]  # 记录编辑后的关键词
                search.save()
            elif action['type'] in [1, 2, 3]:  # 规则操作（新增、更新、删除）
                gen_content = GenContentlog.objects.get(id=action['log_id'])
                gen_content.is_ac = True  # 标记为已接受
                gen_content.change_rule = action['profile']['rule']  # 记录规则变更
                gen_content.from_which_message = message  # 关联到消息
                gen_content.save()
                logger.info("新的操作:"+serializers.serialize('json', [gen_content]))
                print("新的操作:"+serializers.serialize('json', [gen_content]))

        # 更新日志记录 - 处理拒绝的操作
        for action in (wa_actions):
            if action['type'] == 4:  # 搜索操作
                search = Searchlog.objects.get(id=action['log_id'])
                search.is_accepted = False  # 标记为已拒绝
                search.edited_keyword = action['keywords'][0]  # 记录编辑后的关键词
                search.save()
            elif action['type'] in [1, 2, 3]:  # 规则操作（新增、更新、删除）
                gen_content = GenContentlog.objects.get(id=action['log_id'])
                gen_content.is_ac = False  # 标记为已拒绝
                gen_content.change_rule = action['profile']['rule']  # 记录规则变更
                gen_content.from_which_message = message  # 关联到消息
                gen_content.save()
                logger.info("新的操作:"+serializers.serialize('json', [gen_content]))
                print("新的操作:"+serializers.serialize('json', [gen_content]))
                
        # 返回成功响应
        return build_response(SUCCESS, {
            "content": message.content,
            "sender": message.sender,
        })

def get_word_count(request): #废弃
    # return word cloud, 传入参数可能是浏览的，也可能是click
    '''
    wc =[{word:xxx, count:xxx}]
    '''
    data = json.loads(request.body)
    pid = data['pid']
    type = data['type']
    platform = PLATFORM_CHOICES[data['platform']][0]
    if type == "browse":
        # 获取浏览记录
        data = get_browses_wc(pid, platform, count=10)
        return_data = [{"text": key, "value": value} for key, value in data.items()]
        return build_response(SUCCESS, return_data)
    elif type == "click":
        # 获取点击记录
        data = get_clicks_wc(pid, platform, count=10)
        return_data = [{"text": key, "value": value} for key, value in data.items()]
        return build_response(SUCCESS, return_data)
    return build_response(FAILURE, None)

def record_user(request): #ok
    # 真正的规则管理流程：
    #     规则存储在浏览器本地：用户的所有规则都保存在Chrome扩展的本地存储中
    #     开启插件时同步：当用户开启插件时，前端将本地规则上传到后端
    #     后端只是镜像：后端数据库中的规则只是前端本地规则的镜像副本
    #     真正的修改在前端：所有规则的增删改查操作都在前端完成，然后同步到后端
    """记录用户信息并初始化用户规则配置
    Args:
        request: Django HTTP请求对象，包含POST请求数据
        
    Returns:
        JsonResponse: 包含操作结果的响应
    """
    # 记录连接用户日志
    logger.debug(f"connect user:{json.loads(request.body)['pid']}")
    pid = json.loads(request.body)['pid']
    
    try:
        # 检查用户是否已存在
        UserPid.objects.get(pid=pid)
        # 如果用户已存在，删除该用户的所有现有规则（用于重置）
        Rule.objects.filter(pid=pid).delete()
    except:
        # 如果用户不存在，创建新用户
        logger.debug(f"create new user: {pid}")
        UserPid.objects.create(pid=pid)
        
    # 从请求体中获取用户配置的规则列表
    profiles = json.loads(request.body)['profiles']
    
    # 遍历所有配置规则并创建到数据库
    for profile in profiles:
        Rule.objects.create(iid=profile['iid'],          # 规则ID
                           pid=pid,                     # 用户ID
                           rule=profile['rule'],        # 规则内容
                           isactive=profile['isactive'], # 是否激活
                           platform=PLATFORM_CHOICES[profile['platform']][0])  # 平台类型

    # 记录用户激活和配置信息日志
    logger.info(f"active user:{pid}, with profile: {Rule.objects.filter(pid=pid)}")
    
    # 返回成功响应
    return build_response(SUCCESS, None)



# 后面是用一个定时任务计算每个人的personalities


def guided_chat_start(request):
    """需求引导对话第一步：基于历史偏好总结生成个性化引导问题
    Args:
        request: GET 请求，参数为 pid, platform (数字索引)
    Returns:
        {guidance_question: str, has_preference: bool}
    """
    pid = request.GET.get('pid', '')
    platform_idx = int(request.GET.get('platform', 0))
    platform = PLATFORM_CHOICES[platform_idx][0]

    # 检查是否有新的浏览记录需要刷新偏好
    personality = Personalities.objects.filter(pid=pid, platform=platform).first()
    latest_record = Record.objects.filter(pid=pid, platform=platform).order_by('-browse_time').first()
    need_refresh = (
        personality is None
        or latest_record is None
        or latest_record.browse_time > personality.update_time
    )

    preference_summary = ""
    if latest_record is not None and need_refresh:
        # 有新数据，运行长短期偏好解析（3步LLM）
        logger.info("[GuidedChat] 检测到新浏览记录，重新运行偏好总结 pid=%s", pid)
        result, fallback = run_unit_interpret(pid, platform)
        if not fallback:
            pos = result.get("positive_group", [])
            neg = result.get("negative_group", [])
            parts = []
            if pos:
                parts.append("用户偏好（正向）：\n" + "\n".join("- " + p for p in pos))
            if neg:
                parts.append("用户不感兴趣（负向）：\n" + "\n".join("- " + n for n in neg))
            preference_summary = "\n\n".join(parts)
            # 写回 Personalities 缓存
            if personality is None:
                personality = Personalities(pid=pid, platform=platform)
            personality.personality = preference_summary
            personality.save()
    elif personality and personality.personality:
        # 无新数据，直接使用缓存
        preference_summary = personality.personality
        logger.info("[GuidedChat] 使用缓存偏好 pid=%s\n%s", pid, preference_summary)

    guidance_question = get_guidance_question(preference_summary)
    logger.info("[GuidedChat] start: pid=%s, platform=%s, has_preference=%s", pid, platform, bool(preference_summary))
    return build_response(SUCCESS, {
        "guidance_question": guidance_question,
        "has_preference": bool(preference_summary),
    })


def guided_chat_refresh(request):
    """强制刷新用户历史偏好总结，清除缓存后重新运行 run_unit_interpret，并返回新的引导问题
    Args:
        request: GET 请求，参数为 pid, platform (数字索引)
    Returns:
        {guidance_question: str, has_preference: bool}
    """
    pid = request.GET.get('pid', '')
    platform_idx = int(request.GET.get('platform', 0))
    platform = PLATFORM_CHOICES[platform_idx][0]

    logger.info("[GuidedChat] 强制刷新偏好 pid=%s platform=%s", pid, platform)

    # 清除旧缓存，强制重新计算
    Personalities.objects.filter(pid=pid, platform=platform).delete()

    result, fallback = run_unit_interpret(pid, platform)
    preference_summary = ""
    if not fallback:
        pos = result.get("positive_group", [])
        neg = result.get("negative_group", [])
        parts = []
        if pos:
            parts.append("用户偏好（正向）：\n" + "\n".join("- " + p for p in pos))
        if neg:
            parts.append("用户不感兴趣（负向）：\n" + "\n".join("- " + n for n in neg))
        preference_summary = "\n\n".join(parts)
        personality = Personalities(pid=pid, platform=platform, personality=preference_summary)
        personality.save()

    guidance_question = get_guidance_question(preference_summary)
    logger.info("[GuidedChat] refresh 完成: pid=%s has_preference=%s", pid, bool(preference_summary))
    return build_response(SUCCESS, {
        "guidance_question": guidance_question,
        "has_preference": bool(preference_summary),
    })


def guided_chat_summarize(request):
    """需求引导对话第二步：将引导问答传给 fuzzy 生成规则建议
    Args:
        request: POST，body 含 pid, platform, guidance_question, user_response
    Returns:
        {actions: list} 格式与 /chatbot 一致，供前端弹窗确认
    """
    t_start = time.time()
    data = json.loads(request.body)
    pid = data['pid']
    platform_idx = data['platform']
    platform = PLATFORM_CHOICES[platform_idx][0]
    guidance_question = data['guidance_question']
    user_response = data['user_response']

    # 创建 Session 并保存引导轮对话消息
    session = Session(pid=pid, task=0, platform=platform, summary="guided chat")
    session.save()
    Message(session=session, content=guidance_question, sender='bot').save()
    Message(session=session, content=user_response, sender='user').save()

    # 构造单轮对话历史字符串
    chat_history = f"客服:{guidance_question}\n用户:{user_response}"

    # 获取当前规则列表（同 dialogue 流程）
    platform_id = PLATFORMS.index(platform)
    rules = Rule.objects.filter(pid=pid, platform=platform)
    active_rule = rules.filter(isactive=True)
    rules_json = json.loads(serializers.serialize('json', active_rule))
    next_iid = max((r.iid for r in rules), default=-1) + 1

    # 调用 fuzzy 生成规则操作建议
    response, actions = get_fuzzy(chat_history=chat_history, rules=rules_json, platform=platform_id, pid=pid, max_iid=next_iid)

    if not actions:
        # 用户未表达偏好需求，直接用 get_fuzzy 返回的普通回复（已含规则上下文）
        elapsed = time.time() - t_start
        logger.info("[GuidedChat] 总耗时 %.2fs | 无操作，普通回复 | pid=%s | 输入: %s", elapsed, pid, user_response[:60])
        return build_response(SUCCESS, {"actions": [], "sid": session.id, "content": response})

    # 创建 GenContentlog 日志记录（is_ac=False，等待用户确认）
    for action in actions:
        if action['type'] == 1:
            gen = GenContentlog.objects.create(
                pid=pid, action_type='add', platform=platform,
                new_rule=action['profile']['rule'], old_rule='', is_ac=False, change_rule='',
                from_which_session=session
            )
            action['log_id'] = gen.id
        elif action['type'] == 2:
            rule_obj = Rule.objects.filter(pid=pid, iid=action['profile']['iid']).first()
            old_rule = rule_obj.rule if rule_obj else ''
            gen = GenContentlog.objects.create(
                pid=pid, action_type='update', platform=platform,
                new_rule=action['profile']['rule'], old_rule=old_rule, is_ac=False, change_rule='',
                from_which_session=session
            )
            action['log_id'] = gen.id
        elif action['type'] == 3:
            rule_obj = Rule.objects.filter(pid=pid, iid=action['profile']['iid']).first()
            old_rule = rule_obj.rule if rule_obj else ''
            gen = GenContentlog.objects.create(
                pid=pid, action_type='delete', platform=platform,
                new_rule='', old_rule=old_rule, is_ac=False, change_rule='',
                from_which_session=session
            )
            action['log_id'] = gen.id

    elapsed = time.time() - t_start
    logger.info("[GuidedChat] 总耗时 %.2fs | 生成 %d 个操作 | pid=%s | 输入: %s", elapsed, len(actions), pid, user_response[:60])
    return build_response(SUCCESS, {"actions": actions, "sid": session.id})

# 被 Django 导入时就会执行：初始化 BackgroundScheduler、注册 job 并 scheduler.start()。通常在服务启动/第一次加载 views 时就会触发。

# # 临时注释APScheduler初始化代码，避免在数据库表创建前访问数据库
from apscheduler.schedulers.background import BackgroundScheduler
from django_apscheduler.jobstores import DjangoJobStore, register_events
from apscheduler.triggers.interval import IntervalTrigger
import datetime as dt
from django_apscheduler.models import DjangoJobExecution
from .rah import get_rah_personalities

def set_rah_personalities():
    print(time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())+" start rah")
    all_pid = list(set([item.pid for item in UserPid.objects.all()]))
    logger.debug(f"all_pid: {all_pid}")
    platform = "知乎"
    is_new = False
    for pid in all_pid:
        last_personalities = PersonalitiesClick.objects.filter(pid=pid, platform=platform)
        if len(last_personalities) == 0:
            is_new = True
            last_personalities = PersonalitiesClick(pid=pid, platform=platform, personality_click="")
        else:
            last_personalities = last_personalities.first()
            logger.debug("last_personalities: "+serializers.serialize('json', [last_personalities]))
        records_all = Record.objects.filter(pid=pid, platform=platform, is_filter=True, filter_result=False).order_by('-browse_time')
        # 删除已经计算过的记录
        if not is_new:
            records_all = records_all.filter(browse_time__gt=last_personalities.update_time)
        logger.debug("还没有计算过的记录:")
        logger.debug(f"{records_all}")
        if len(records_all) == 0:
            continue

        # 分组， 需要保证每个组内的浏览时间不超过1min
        records_group = []
        one_group= []
        has_clicks = False
        earliest_time = records_all[0].browse_time
        for record in records_all:
            if record.browse_time - earliest_time > dt.timedelta(minutes=1):
                if len(one_group)!=0 and has_clicks:
                    records_group.append(one_group)
                one_group = []
                one_group.append(record)
                has_clicks = record.click
                earliest_time = record.browse_time
            else:
                has_clicks = (has_clicks or record.click)
                one_group.append(record)
        if len(one_group)!=0 and has_clicks:
            records_group.append(one_group)
        print(time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())+"开始分组采样并更新")
        logger.debug("(滑动窗口分组数)group num: "+str(len(records_group)))
        # 对于每个分组采样, 然后更新personalites
        for group in records_group:
            pos_records = [record.title for record in group if record.click]
            neg_records = [record.title for record in group if not record.click]
            click_personal = get_rah_personalities(pid, platform, pos_records, neg_records)
            if len(click_personal) == 0:
                continue
            last_personalities.personality_click = click_personal
            last_personalities.save()


def delete_old_job_executions(max_age=604_800):
    DjangoJobExecution.objects.delete_old_job_executions(max_age)

scheduler = BackgroundScheduler()
scheduler.add_jobstore(DjangoJobStore(), "default")

scheduler.add_job(
    set_rah_personalities,
    trigger=IntervalTrigger(minutes=interval),
    args=[],
    id='rah',
    max_instances=1,
    replace_existing=True,
)
register_events(scheduler)
scheduler.start()
# Hook into the apscheduler shutdown to delete old job executions
scheduler.add_listener(delete_old_job_executions, mask=2048)
