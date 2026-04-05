import json
import re
import logging

logger = logging.getLogger("myapp")

from agent.models import Rule
from agent.prompt.prompt_utils import get_bailian_response
from online_TwoStage.prompts import FILTERING_PROMPT, RERANKING_PROMPT


# 从 LLM 返回文本中提取 JSON 对象
def parse_json_from_response(text):
    # 先尝试从 code block 中提取
    m = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if m:
        text = m.group(1)
    # 再尝试直接解析
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        # 尝试找到第一个 { 和最后一个 }
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            try:
                return json.loads(text[start:end+1])
            except json.JSONDecodeError:
                pass
    return None


# 将 items 格式化为 prompt 中的文本
def format_items_text(items):
    lines = []
    for item in items:
        lines.append("id:{}, 标题:{}".format(item.get('id', ''), item.get('title', '')))
    return "\n".join(lines)


# 调用 LLM 执行过滤，返回过滤后的 items 列表
def run_filtering(items, negative_group):
    items_text = format_items_text(items)
    rules_text = "\n".join("- {}".format(r) for r in negative_group)

    prompt = FILTERING_PROMPT.format(negative_group=rules_text, items=items_text)
    msg = [{"role": "user", "content": prompt}]
    logger.info("[TwoStage] 过滤请求: %d 个候选, %d 条规则", len(items), len(negative_group))

    response_text = get_bailian_response(msg)
    logger.info("[TwoStage] 过滤响应: %s", response_text[:500])

    result = parse_json_from_response(response_text)
    if result is None:
        logger.warning("[TwoStage] 过滤响应解析失败，回退全量")
        return items, []

    filtered_list = result.get('filtered_list', [])
    removed_list = result.get('removed_list', [])

    # 保底: 过滤后数量 < 70% 则回退全量
    if len(filtered_list) < len(items) * 0.7:
        logger.warning("[TwoStage] 过滤过多 (%d/%d < 70%%)，回退全量", len(filtered_list), len(items))
        return items, []

    return filtered_list, removed_list


# 调用 LLM 执行重排，返回排序后的 id 列表
def run_reranking(items, positive_group):
    items_text = format_items_text(items)
    if positive_group:
        pos_text = "\n".join("- {}".format(p) for p in positive_group)
    else:
        pos_text = "暂无明确偏好信息，请保持原始顺序。"

    prompt = RERANKING_PROMPT.format(positive_group=pos_text, items=items_text)
    msg = [{"role": "user", "content": prompt}]
    logger.info("[TwoStage] 重排请求: %d 个候选", len(items))

    response_text = get_bailian_response(msg)
    logger.info("[TwoStage] 重排响应: %s", response_text[:500])

    result = parse_json_from_response(response_text)
    if result is None:
        logger.warning("[TwoStage] 重排响应解析失败，保持原序")
        return [item.get('id') for item in items]

    rerank_list = result.get('rerank_list', [])
    return [str(item.get('id', '')) for item in rerank_list]


# 两阶段重排主流程: 过滤 + 重排
def run_two_stage_reorder(pid, platform, items):
    if not items:
        return []

    # 查询用户的 active 规则作为 negative_group
    rules = Rule.objects.filter(pid=pid, platform=platform, isactive=True)
    negative_group = [r.rule for r in rules]
    # positive_group 暂为空，等第1/2部分实现
    positive_group = []

    all_ids = [str(item.get('id', '')) for item in items]

    # 阶段1: 过滤
    removed_ids = set()
    if negative_group:
        filtered_items, removed_list = run_filtering(items, negative_group)
        removed_ids = set(str(item.get('id', '')) for item in removed_list)
        # 用过滤后的列表进入重排
        items_for_rerank = filtered_items
    else:
        items_for_rerank = items

    # 阶段2: 重排
    reranked_ids = run_reranking(items_for_rerank, positive_group)

    # 兜底: 去重 + 补齐缺失 + 被过滤的追加末尾
    seen = set()
    final_order = []
    for rid in reranked_ids:
        rid = str(rid)
        if rid not in seen:
            seen.add(rid)
            final_order.append(rid)

    # 补齐重排中遗漏的（非 removed 的）
    for rid in all_ids:
        if rid not in seen and rid not in removed_ids:
            seen.add(rid)
            final_order.append(rid)

    # 被过滤掉的追加到末尾
    for rid in all_ids:
        if rid not in seen:
            seen.add(rid)
            final_order.append(rid)

    logger.info("[TwoStage] 最终排序: %d 个, 其中 %d 个被过滤排末尾", len(final_order), len(removed_ids))
    return final_order
