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
    logger.info("[TwoStage-过滤] 输入 %d 个候选, 规则: %s", len(items), negative_group)

    response_text = get_bailian_response(msg)
    # logger.info("[TwoStage-过滤] LLM原始响应:\n%s", response_text)

    result = parse_json_from_response(response_text)
    if result is None:
        logger.warning("[TwoStage-过滤] 响应解析失败，回退全量保留 %d 条。", len(items))
        return items, []

    filtered_list = result.get('filtered_list', [])
    removed_list = result.get('removed_list', [])

    # LLM 可能把同一条目同时放进 filtered_list 和 removed_list，用 removed_ids 剔除
    removed_ids_set = set(str(item.get('id', '')) for item in removed_list)
    filtered_list = [item for item in filtered_list if str(item.get('id', '')) not in removed_ids_set]

    logger.info("[TwoStage-过滤] 结果: 保留 %d 条, 移除 %d 条", len(filtered_list), len(removed_list))

    # [已禁用] 保底: 过滤后数量 < 70% 则回退全量
    # if len(filtered_list) < len(items) * 0.7:
    #     logger.warning("[TwoStage-过滤] 过滤过多 (%d/%d < 70%%)，回退全量", len(filtered_list), len(items))
    #     return items, []

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
    logger.info("[TwoStage-重排] 输入 %d 个候选, 偏好: %s", len(items), positive_group if positive_group else "(无)")

    response_text = get_bailian_response(msg)
    logger.info("[TwoStage-重排] LLM原始响应:\n%s", response_text)

    result = parse_json_from_response(response_text)
    if result is None:
        logger.warning("[TwoStage-重排] 响应解析失败，保持原序 %d 条", len(items))
        return [item.get('id') for item in items]

    rerank_list = result.get('rerank_list', [])
    logger.info("[TwoStage-重排] 结果: 输出 %d 条 (期望 %d 条)", len(rerank_list), len(items))
    return [str(item.get('id', '')) for item in rerank_list]


# 两阶段重排主流程: 过滤 + 重排
def run_two_stage_reorder(pid, platform, items):
    if not items:
        return []

    logger.info("[TwoStage] === 开始两阶段重排 === pid=%s, platform=%s, 候选数=%d", pid, platform, len(items))
    rules = Rule.objects.filter(pid=pid, platform=platform, isactive=True)
    # 按规则前缀分为负向（过滤）和正向（重排）
    negative_group = [r.rule for r in rules if r.rule.startswith("我不想看")]
    positive_group = [r.rule for r in rules if r.rule.startswith("我想看")]

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

    # 构建 id -> title 映射，用于最终日志
    id_to_title = {str(item.get('id', '')): item.get('title', '') for item in items}

    # 兜底: 去重 + 补齐缺失 + 被过滤的追加末尾
    seen = set()
    rerank_order = []
    for rid in reranked_ids:
        rid = str(rid)
        if rid not in seen and rid not in removed_ids:
            seen.add(rid)
            rerank_order.append(rid)

    # 补齐重排中遗漏的（非 removed 的）
    for rid in all_ids:
        if rid not in seen and rid not in removed_ids:
            seen.add(rid)
            rerank_order.append(rid)

    # 被过滤掉的直接丢弃，不再展示
    removed_order = [rid for rid in all_ids if rid not in seen]
    final_order = rerank_order

    logger.info("[TwoStage] === 完成 === 共 %d 条 (过滤掉 %d 条)", len(final_order), len(removed_order))
    logger.info("[TwoStage] 正向规则: %s", positive_group if positive_group else "(无)")
    logger.info("[TwoStage] rerank_list (%d 条):", len(rerank_order))
    for i, rid in enumerate(rerank_order, 1):
        logger.info("  %d. id=%s title=%s", i, rid, id_to_title.get(rid, ''))
    logger.info("[TwoStage] 负向规则: %s", negative_group if negative_group else "(无)")
    logger.info("[TwoStage] removed_list (%d 条, 已过滤):", len(removed_order))
    for i, rid in enumerate(removed_order, 1):
        logger.info("  %d. id=%s title=%s", i, rid, id_to_title.get(rid, ''))
    return final_order
