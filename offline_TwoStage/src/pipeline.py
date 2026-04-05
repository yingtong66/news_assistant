import os
import re
import json
from src.unit_interpret import UnitInterpret
from src.unit_controll import UnitControll


# 去除 markdown fence 包裹，提取 JSON 文本
def strip_json_fence(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[: text.rfind("```")]
    return text.strip()


class TwoStagePipeline:
    """
    TwoStage 模块化多智能体推荐流水线。
    支持四种组合模式：
    - (True, True):  偏好总结 -> 需求识别 -> 用户对话 -> 需求总结(正/负) -> 过滤/重排
    - (True, False): 偏好总结 -> 直接作为 final_needs -> 过滤/重排
    - (False, True): 无偏好上下文 -> 冷启动引导 -> 用户对话 -> 需求总结(正/负) -> 过滤/重排
    - (False, False): 无用户画像 -> 保持原始排名（baseline）
    """

    def __init__(self, agent, title_map, abstract_map, prompt_root,
                 enable_interpret=True, enable_controll=True):
        self._agent = agent
        self._title_map = title_map
        self._abstract_map = abstract_map
        self._enable_interpret = enable_interpret
        self._enable_controll = enable_controll

        # 按需创建子模块
        if enable_interpret:
            self._unit_interpret = UnitInterpret(agent, prompt_root)
        if enable_controll:
            self._unit_controll = UnitControll(agent, prompt_root)

        # 过滤和重排 prompt
        self._filtering_prompt = os.path.join(prompt_root, "filtering.yaml")
        self._reranking_prompt = os.path.join(prompt_root, "reranking.yaml")

        # 过滤 JSON schema
        self._filtering_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "filtering_response",
                "schema": {
                    "type": "object",
                    "properties": {
                        "filtered_list": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "removed_list": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "explanation": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["filtered_list", "removed_list", "explanation"],
                    "additionalProperties": False,
                },
                "strict": True,
            },
        }

        # 重排 JSON schema
        self._ranking_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "custom_response",
                "schema": {
                    "type": "object",
                    "properties": {
                        "rerank_list": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "explanation": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["rerank_list", "explanation"],
                    "additionalProperties": False,
                },
                "strict": True,
            },
        }

    # 将候选ID列表格式化为紧凑文本（供 LLM 阅读）
    def _format_candidate_list(self, item_list):
        if not item_list:
            return ""
        parts = []
        for item_id in item_list:
            title = self._title_map.get(item_id, "Unknown Title")
            abstract = self._abstract_map.get(item_id, "No abstract available")
            cleaned = re.sub(u"\\<.*?\\>", "", str(abstract))
            title_str = str(title)[:20]
            abstract_str = cleaned[:50]
            parts.append(f"item id:{item_id}, corresponding title:{title_str}, abstract:{abstract_str} ;")
        return "".join(parts)

    # 将正/负需求格式化为文本
    def _format_needs(self, positive_group, negative_group):
        lines = []
        if positive_group:
            lines.append("Positive requirements (user wants):")
            for s in positive_group:
                lines.append(f"  - {s}")
        if negative_group:
            lines.append("Negative requirements (user does NOT want):")
            for s in negative_group:
                lines.append(f"  - {s}")
        return "\n".join(lines) if lines else ""

    async def run(self, history, candidates, labels, keywords, target_polarity="positive"):
        """
        执行完整流水线。
        Args:
            history: 用户历史点击新闻ID列表
            candidates: 候选新闻ID列表
            labels: 对应候选的0/1标签
            keywords: target news的模糊关键词列表
        Returns:
            (rerank_ids: list, all_agent_history: list, fallback_flags: dict)
        """
        all_agent_history = []
        fallback_flags = {}

        # --- 阶段一: Unit_Interpret ---
        interp_positive = []
        interp_negative = []
        preference_summary = ""
        if self._enable_interpret and history:
            interp_result, interp_history, interp_fallback = await self._unit_interpret.run(
                history, self._title_map, self._abstract_map
            )
            all_agent_history.extend(interp_history)
            if interp_fallback:
                fallback_flags["history_summary"] = True
            interp_positive = interp_result.get("positive_group", [])
            interp_negative = interp_result.get("negative_group", [])
            # 拼成文本供 Unit_Controll 使用
            preference_summary = self._format_needs(interp_positive, interp_negative)

        # --- 阶段二: Unit_Controll ---
        positive_group = []
        negative_group = []
        if self._enable_controll:
            req_result, dial_hist, ctrl_history, ctrl_fallback = await self._unit_controll.run(
                keywords=keywords,
                preference_summary=preference_summary,
                target_polarity=target_polarity,
            )
            all_agent_history.extend(ctrl_history)
            if ctrl_fallback:
                fallback_flags["requirement_summary"] = True
            positive_group = req_result.get("positive_group", [])
            negative_group = req_result.get("negative_group", [])
        else:
            # 无 Unit_Controll -> 直接使用 Interpret 的正负分组
            positive_group = interp_positive
            negative_group = interp_negative

        # 构造过滤/重排的输入文本
        positive_text = "\n".join(f"- {s}" for s in positive_group) if positive_group else "(none)"
        negative_text = "\n".join(f"- {s}" for s in negative_group) if negative_group else "(none)"

        # --- 阶段三: 过滤 ---
        filtered_ids = list(candidates)
        drop_group = []

        if negative_group:
            formatted_candidates = self._format_candidate_list(candidates)
            filtering_result = await self._agent.generate(
                prompt=self._filtering_prompt,
                response_format=self._filtering_format,
                negative_requirements=negative_text,
                candidate_list=formatted_candidates,
            )
            all_agent_history.append({
                "role": "filtering_agent",
                "input": {"negative_requirements": negative_text, "candidate_list": formatted_candidates},
                "output": filtering_result,
            })

            # 解析过滤结果，保底保留 >= 70%
            try:
                filtering_json = json.loads(strip_json_fence(filtering_result))
                parsed_filtered = filtering_json.get("filtered_list", [])
                parsed_removed = filtering_json.get("removed_list", [])
                min_keep = max(1, int(len(candidates) * 0.7 + 0.999))
                if parsed_filtered and len(parsed_filtered) >= min_keep:
                    # 仅保留合法ID
                    valid = set(candidates)
                    filtered_ids = [c for c in parsed_filtered if c in valid]
                    drop_group = [c for c in parsed_removed if c in valid]
                    # 补齐被遗漏的ID到 drop_group
                    accounted = set(filtered_ids) | set(drop_group)
                    for c in candidates:
                        if c not in accounted:
                            filtered_ids.append(c)
            except (json.JSONDecodeError, TypeError):
                fallback_flags["filtering"] = True
        else:
            all_agent_history.append({
                "role": "filtering_agent",
                "input": {},
                "output": "(skipped: no negative requirements)",
            })

        # --- 阶段四: 重排 ---
        formatted_filtered = self._format_candidate_list(filtered_ids)
        rerank_result = await self._agent.generate(
            prompt=self._reranking_prompt,
            response_format=self._ranking_format,
            positive_requirements=positive_text,
            candidate_list=formatted_filtered,
        )
        all_agent_history.append({
            "role": "reranking_agent",
            "input": {"positive_requirements": positive_text, "candidate_list": formatted_filtered},
            "output": rerank_result,
        })

        # 解析重排结果 + 兜底
        try:
            rerank_json = json.loads(strip_json_fence(rerank_result))
            rerank_list = rerank_json.get("rerank_list", [])
            # 去重（保序）、仅保留合法 ID
            valid_ids = set(filtered_ids)
            seen = set()
            deduped = []
            for cid in rerank_list:
                if cid in valid_ids and cid not in seen:
                    deduped.append(cid)
                    seen.add(cid)
            # 补齐缺失项
            for cid in filtered_ids:
                if cid not in seen:
                    deduped.append(cid)
                    seen.add(cid)
            rerank_ids = deduped
        except (json.JSONDecodeError, TypeError):
            rerank_ids = list(filtered_ids)
            fallback_flags["reranking"] = True

        # 将 drop_group 中不在 rerank_ids 中的追加到末尾（去重）
        existing = set(rerank_ids)
        for cid in drop_group:
            if cid not in existing:
                rerank_ids.append(cid)
                existing.add(cid)

        return rerank_ids, all_agent_history, fallback_flags
