import os
import re
import json


# 去除 markdown fence 包裹，提取 JSON 文本
def strip_json_fence(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[: text.rfind("```")]
    return text.strip()


class UnitInterpret:
    """用户历史画像解释模块：长期偏好解析 + 短期偏好解析 + 历史画像总结"""

    def __init__(self, agent, prompt_root):
        self._agent = agent
        self._long_term_prompt = os.path.join(prompt_root, "long_term_parser.yaml")
        self._short_term_prompt = os.path.join(prompt_root, "short_term_parser.yaml")
        self._history_summary_prompt = os.path.join(prompt_root, "history_summary.yaml")

        # history_summary 的 JSON schema（正负分组）
        self._summary_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "history_summary_response",
                "schema": {
                    "type": "object",
                    "properties": {
                        "positive_group": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "negative_group": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["positive_group", "negative_group"],
                    "additionalProperties": False,
                },
                "strict": True,
            },
        }

    # 将新闻ID列表格式化为包含title和abstract的可读文本
    def _format_history(self, item_list, title_map, abstract_map):
        if not item_list:
            return "No interaction history available."
        parts = []
        for item_id in item_list:
            title = title_map.get(item_id, "Unknown Title")
            abstract = abstract_map.get(item_id, "No abstract available")
            cleaned = re.sub(u"\\<.*?\\>", "", str(abstract))
            parts.append(f"Item ID: {item_id}\nTitle: {str(title)}\nAbstract: {cleaned}")
        return "\n\n".join(parts)

    async def run(self, history, title_map, abstract_map):
        """
        执行用户历史画像解释。
        Args:
            history: 用户历史点击的新闻ID列表（按时间顺序）
            title_map: news_id -> title 映射
            abstract_map: news_id -> abstract 映射
        Returns:
            (interpret_result: dict, agent_history: list)
            interpret_result: {"positive_group": [...], "negative_group": [...]}
        """
        agent_history = []

        # 长期偏好：全部历史
        full_history_text = self._format_history(history, title_map, abstract_map)

        # 短期偏好：最近 5 条，不足 5 条则全部
        recent_n = min(5, len(history))
        recent_history = history[-recent_n:]
        recent_history_text = self._format_history(recent_history, title_map, abstract_map)

        # Step 1: 长期偏好解析
        long_term_pref = await self._agent.generate(
            prompt=self._long_term_prompt,
            interaction_history=full_history_text,
        )
        agent_history.append({
            "role": "long_term_parser",
            "input": {"interaction_history": full_history_text},
            "output": long_term_pref,
        })

        # Step 2: 短期偏好解析
        short_term_pref = await self._agent.generate(
            prompt=self._short_term_prompt,
            recent_history=recent_history_text,
        )
        agent_history.append({
            "role": "short_term_parser",
            "input": {"recent_history": recent_history_text},
            "output": short_term_pref,
        })

        # Step 3: 历史画像总结（输出 JSON 正负分组）
        summary_raw = await self._agent.generate(
            prompt=self._history_summary_prompt,
            response_format=self._summary_format,
            long_term_preferences=long_term_pref,
            short_term_preferences=short_term_pref,
        )
        agent_history.append({
            "role": "history_summary",
            "input": {
                "long_term_preferences": long_term_pref,
                "short_term_preferences": short_term_pref,
            },
            "output": summary_raw,
        })

        # 解析 JSON
        fallback = False
        try:
            interpret_result = json.loads(strip_json_fence(summary_raw))
        except (json.JSONDecodeError, TypeError):
            interpret_result = {"positive_group": [], "negative_group": []}
            fallback = True

        return interpret_result, agent_history, fallback
