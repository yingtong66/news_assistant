import json
import re
import logging

logger = logging.getLogger("myapp")

from agent.models import Rule
from agent.prompt.prompt_utils import get_bailian_response
from online_TwoStage.prompts import FILTERING_PROMPT, RERANKING_PROMPT


# 从 LLM 返回文本中提取 JSON 对象
def parse_json_from_response(text):
    if not text:
        return None
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
        parts = ["id:{}, 标题:{}".format(item.get('id', ''), item.get('title', ''))]
        source = item.get('source', '')
        time_str = item.get('time', '')
        if source:
            parts.append("来源:{}".format(source))
        if time_str:
            parts.append("时间:{}".format(time_str))
        lines.append(", ".join(parts))
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
    if not removed_list:
        logger.warning("[TwoStage-过滤] 过滤未生效，无条目被移除")

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
    # logger.info("[TwoStage-重排] LLM原始响应:\n%s", response_text)

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
        return [], [], []

    logger.info("[TwoStage] === 开始两阶段重排 === pid=%s, platform=%s, 候选数=%d", pid, platform, len(items))
    rules = Rule.objects.filter(pid=pid, platform=platform, isactive=True)
    # 按规则前缀分为负向（过滤）和正向（重排）
    negative_group = [r.rule for r in rules if r.rule.startswith("我不想看")]
    positive_group = [r.rule for r in rules if r.rule.startswith("我想看")]

    all_ids = [str(item.get('id', '')) for item in items]
    # 构建 id -> 原始完整条目的映射，保留 source/time 等字段
    id_to_item = {str(item.get('id', '')): item for item in items}

    # 阶段1: 过滤
    removed_ids = set()
    removed_detail = []  # [{id, title, reason}, ...]
    if negative_group:
        filtered_items, removed_list = run_filtering(items, negative_group)
        removed_ids = set(str(item.get('id', '')) for item in removed_list)
        removed_detail = removed_list  # LLM 返回的已含 reason
        # 用原始 items 还原完整字段，保留过滤后的顺序
        filtered_ids = [str(item.get('id', '')) for item in filtered_items]
        items_for_rerank = [id_to_item[rid] for rid in filtered_ids if rid in id_to_item]
    else:
        items_for_rerank = items

    # 阶段2: 重排
    reranked_ids = run_reranking(items_for_rerank, positive_group)

    # 构建 id -> 条目信息映射，用于最终日志
    id_to_info = {}
    for item in items:
        rid = str(item.get('id', ''))
        title = item.get('title', '')
        source = item.get('source', '')
        time_str = item.get('time', '')
        extra = []
        if source:
            extra.append("source={}".format(source))
        if time_str:
            extra.append("time={}".format(time_str))
        id_to_info[rid] = "title={} {}".format(title, " ".join(extra)).strip()

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

    # 检查重排是否实际生效
    original_order = [str(item.get('id', '')) for item in items_for_rerank]
    if rerank_order == original_order:
        logger.warning("[TwoStage] 重排未生效，输出与原序完全一致")
    else:
        changed = [(i+1, rid) for i, (rid, oid) in enumerate(zip(rerank_order, original_order)) if rid != oid]
        logger.info("[TwoStage] 重排生效，共 %d 个位置发生变化", len(changed))

    logger.info("[TwoStage] === 完成 === 共 %d 条 (过滤掉 %d 条)", len(final_order), len(removed_order))
    logger.info("[TwoStage] 正向规则: %s", positive_group if positive_group else "(无)")
    logger.info("[TwoStage] rerank_list (%d 条):", len(rerank_order))
    for i, rid in enumerate(rerank_order, 1):
        logger.info("  %d. id=%s %s", i, rid, id_to_info.get(rid, ''))
    logger.info("[TwoStage] 负向规则: %s", negative_group if negative_group else "(无)")
    logger.info("[TwoStage] removed_list (%d 条, 已过滤):", len(removed_order))
    for i, rid in enumerate(removed_order, 1):
        logger.info("  %d. id=%s %s", i, rid, id_to_info.get(rid, ''))

    # 写入重排日志到数据库
    from agent.models import ReorderLog
    ReorderLog.objects.create(
        pid=pid,
        platform=platform,
        input_items=json.dumps([{"id": str(it.get("id", "")), "title": it.get("title", "")} for it in items], ensure_ascii=False),
        output_order=json.dumps(final_order, ensure_ascii=False),
        removed_items=json.dumps(removed_detail, ensure_ascii=False),
        positive_rules=json.dumps(positive_group, ensure_ascii=False),
        negative_rules=json.dumps(negative_group, ensure_ascii=False),
    )

    return final_order, removed_detail, positive_group


# 仅执行过滤阶段，返回过滤后 items 和被移除列表
def run_filtering_stage(pid, platform, items):
    if not items:
        return items, []
    rules = Rule.objects.filter(pid=pid, platform=platform, isactive=True)
    negative_group = [r.rule for r in rules if r.rule.startswith("我不想看")]
    if not negative_group:
        logger.info("[TwoStage-过滤阶段] 无负向规则, 跳过过滤")
        return items, []
    id_to_item = {str(item.get('id', '')): item for item in items}
    filtered_items, removed_list = run_filtering(items, negative_group)
    removed_ids_set = set(str(item.get('id', '')) for item in removed_list)
    filtered_ids = [str(item.get('id', '')) for item in filtered_items]
    result_items = [id_to_item[rid] for rid in filtered_ids if rid in id_to_item]
    return result_items, removed_list


# 仅执行重排阶段，返回最终 order
def run_reranking_stage(pid, platform, items, removed_detail):
    if not items:
        return []
    rules = Rule.objects.filter(pid=pid, platform=platform, isactive=True)
    positive_group = [r.rule for r in rules if r.rule.startswith("我想看")]
    reranked_ids = run_reranking(items, positive_group)

    # 兜底去重补齐
    all_ids = [str(item.get('id', '')) for item in items]
    seen = set()
    rerank_order = []
    for rid in reranked_ids:
        rid = str(rid)
        if rid not in seen:
            seen.add(rid)
            rerank_order.append(rid)
    for rid in all_ids:
        if rid not in seen:
            seen.add(rid)
            rerank_order.append(rid)

    # 检查重排是否生效
    if rerank_order == all_ids:
        logger.warning("[TwoStage] 重排未生效，输出与原序完全一致")
    else:
        changed = [(i+1, rid) for i, (rid, oid) in enumerate(zip(rerank_order, all_ids)) if rid != oid]
        logger.info("[TwoStage] 重排生效，共 %d 个位置发生变化", len(changed))

    return rerank_order
