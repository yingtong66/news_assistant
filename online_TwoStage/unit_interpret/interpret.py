import json
import logging

logger = logging.getLogger("myapp")

from agent.models import Record
from agent.prompt.prompt_utils import get_bailian_response
from online_TwoStage.pipeline import parse_json_from_response
from online_TwoStage.unit_interpret.prompts import (
    LONG_TERM_PARSER_PROMPT,
    SHORT_TERM_PARSER_PROMPT,
    HISTORY_SUMMARY_PROMPT,
)

# 将 Record queryset 格式化为可读文本，供 prompt 使用
def _format_records(records):
    if not records:
        return "（无记录）"
    parts = []
    for r in records:
        parts.append("标题: {}\n内容: {}".format(r.title, r.content or "（无摘要）"))
    return "\n\n".join(parts)


# 调用 LLM，返回文本响应
def _call_llm(prompt_text):
    msg = [{"role": "user", "content": prompt_text}]
    return get_bailian_response(msg)

# 从 Record 提取用户交互历史，运行长短期偏好解析，返回偏好总结
def run_unit_interpret(pid, platform, max_pos=50, max_neg=20):
    """
    Returns:
        (result_dict, fallback)
        result_dict: {"positive_group": [...], "negative_group": [...]}
        fallback: True 表示解析失败，返回空结果
    """
    # 正样本：点击过的记录，时间正序，取最近 max_pos 条
    pos_records = list(
        Record.objects.filter(pid=pid, platform=platform, click=True)
        .order_by("browse_time")[:max_pos]
    )
    # 负样本：曝光但未点击，取最近 max_neg 条
    neg_records = list(
        Record.objects.filter(pid=pid, platform=platform, click=False)
        .order_by("-browse_time")[:max_neg]
    )
    neg_records = list(reversed(neg_records))  # 转为时间正序

    logger.info(
        "[UnitInterpret] pid=%s platform=%s 正样本=%d 负样本=%d",
        pid, platform, len(pos_records), len(neg_records),
    )

    # 正样本为空时无法归纳偏好，直接返回空结果
    if not pos_records:
        logger.warning("[UnitInterpret] 无正样本历史，返回空偏好")
        return {"positive_group": [], "negative_group": []}, True

    full_history_text = _format_records(pos_records)

    # 短期：最近 5 条正样本
    recent_n = min(5, len(pos_records))
    recent_history_text = _format_records(pos_records[-recent_n:])

    # Step 1: 长期偏好解析
    long_term_pref = _call_llm(LONG_TERM_PARSER_PROMPT.format(interaction_history=full_history_text))
    logger.info("[UnitInterpret] ===长期偏好===\n%s", long_term_pref)

    # Step 2: 短期偏好解析
    short_term_pref = _call_llm(SHORT_TERM_PARSER_PROMPT.format(recent_history=recent_history_text))
    logger.info("[UnitInterpret] ===短期偏好===\n%s", short_term_pref)

    # Step 3: 历史画像总结（含负样本）
    neg_history_text = _format_records(neg_records)
    summary_raw = _call_llm(HISTORY_SUMMARY_PROMPT.format(
        long_term_preferences=long_term_pref,
        short_term_preferences=short_term_pref,
        negative_history=neg_history_text,
        neg_count=len(neg_records),
    ))
    logger.info("[UnitInterpret] ===画像总结原始JSON===\n%s", summary_raw)

    result = parse_json_from_response(summary_raw)
    if result is None:
        logger.warning("[UnitInterpret] JSON 解析失败，返回空偏好")
        return {"positive_group": [], "negative_group": []}, True

    result.setdefault("positive_group", [])
    result.setdefault("negative_group", [])
    logger.info("[UnitInterpret] ===最终偏好总结===\n正向: %s\n负向: %s",
                result["positive_group"], result["negative_group"])
    return result, False
