import json
import re
import time
from http import HTTPStatus
import dashscope
import logging
logger = logging.getLogger("myapp")

with open("agent/prompt/api.json","r") as f:
    settings_file = json.load(f)

API = settings_file["bailian"]['api']
MODEL = settings_file["bailian"]['model']
DIALOG_MODEL = settings_file["bailian"]['dialog']
dashscope.api_key = API

interval = settings_file["rah"]['update_interval_min']

def extract_code_blocks(markdown_text, language):
    # 定义正则表达式模式
    pattern = rf'```{language}\n(.*?)\n```'

    # 使用 re.DOTALL 使 . 匹配换行符
    code_blocks = re.findall(pattern, markdown_text, re.DOTALL)

    return code_blocks[0]

def get_bailian_response(msg, model=MODEL):
    # ====================== 修改点1：消息格式适配新版接口 ======================
    # 千问3.6 必须用 list 包裹 text 格式！！！旧版qwen-plus不要求
    init_prompt = [{"role": "system", "content": [{"text": "你是一个非常聪明有用的客服"}]}]
    msg = init_prompt + msg

    # ====================== 修改点2：调用接口替换（核心！） ======================
    # 旧版：Generation.call  →  新版Qwen3.x：MultiModalConversation.call
    response = dashscope.MultiModalConversation.call(
        model,
        messages=msg,
        timeout=10,
        # 可选：关闭深度思考（qwen3.6-plus默认开启，旧版qwen-plus默认关闭）
        enable_thinking=False
    )

    cnt_try = 0
    while response["status_code"] != HTTPStatus.OK and cnt_try < 2:
        time.sleep(1)
        logger.error('Request id: %s, Status code: %s, error code: %s, error message: %s' % (
                response.request_id, response.status_code,
                response.code, response.message
        ))
        # 重试也必须用新版接口
        response = dashscope.MultiModalConversation.call(model, messages=msg, timeout=10)
        cnt_try += 1

    if response["status_code"] != HTTPStatus.OK:
        return "对不起，我无法帮助你"

    # ====================== 修改点3：响应结果取值格式适配 ======================
    # 旧版：response['output']['text']  →  新版固定格式
    return response['output']['choices'][0]['message']['content'][0]['text']


REPONSE = """你是一个个性化推荐助手, 帮助用户管理内容过滤和推荐规则。用户可以设置"我不想看xx"(过滤规则)和"我想看xx"(偏好规则)。

请根据上下文给出恰当的回复:
- 如果用户询问当前规则, 请将规则列表清晰格式化展示给用户
- 如果用户在闲聊或询问功能, 简要回答并引导用户表达偏好需求
- 回复应简短友好

**聊天上下文**:
{messages}
客服："""
def get_common_response(messages):
    response = get_bailian_response([{"role": "user", "content":REPONSE.format(messages=messages)}])
    logger.info("[CommonResponse] %s", response[:150])
    return response

def get_clean_items(items):
    '''
        items: list, 待清洗的内容
    '''
    ret_items = []
    for item in items:
        if item.strip() == "": continue
        item = item.strip()
        # 删除数字之前的东西
        index = re.search(r"\d", item)
        if index is not None:
            item = item[index.start():]

        # 提取 数字. 之后的文本
        item = re.sub(r'^\d+\.\s*', '', item)

        ret_items.append(item)
    return ret_items
