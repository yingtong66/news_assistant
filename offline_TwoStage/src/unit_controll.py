import os
import json


# 去除 markdown fence 包裹，提取 JSON 文本
def strip_json_fence(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[: text.rfind("```")]
    return text.strip()


class UnitControll:
    """用户需求可控模块：需求识别引导 + 用户模拟器对话 + 需求画像总结"""

    def __init__(self, agent, prompt_root):
        self._agent = agent
        self._req_id_prompt = os.path.join(prompt_root, "requirement_identifier.yaml")
        self._req_id_cold_prompt = os.path.join(prompt_root, "requirement_identifier_cold.yaml")
        self._user_sim_positive_prompt = os.path.join(prompt_root, "user_simulator.yaml")
        self._user_sim_negative_prompt = os.path.join(prompt_root, "user_simulator_negative.yaml")
        self._req_summary_prompt = os.path.join(prompt_root, "requirement_summary.yaml")

        # requirement_summary 的 JSON schema
        self._req_summary_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "requirement_summary_response",
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

    async def run(self, keywords, preference_summary="", target_polarity="positive"):
        """
        执行用户需求可控对话。
        Args:
            keywords: target news 的模糊关键词列表
            preference_summary: 可选的偏好总结文本（来自 UnitInterpret）
            target_polarity: "positive" 表示用户想看这类新闻，"negative" 表示用户不想看这类新闻
        Returns:
            (requirement_result: dict, dialogue_history: list, agent_history: list)
        """
        agent_history = []
        dialogue_history = []

        # Step 1: 需求识别引导（单轮）
        if preference_summary:
            guidance_question = await self._agent.generate(
                prompt=self._req_id_prompt,
                preference_summary=preference_summary,
            )
            agent_history.append({
                "role": "requirement_identifier",
                "input": {"preference_summary": preference_summary},
                "output": guidance_question,
            })
        else:
            guidance_question = await self._agent.generate(
                prompt=self._req_id_cold_prompt,
            )
            agent_history.append({
                "role": "requirement_identifier_cold",
                "input": {},
                "output": guidance_question,
            })

        dialogue_history.append({"role": "assistant", "content": guidance_question})

        # Step 2: 根据 target_polarity 选择正向/负向用户模拟器
        keywords_text = ", ".join(keywords) if isinstance(keywords, list) else str(keywords)
        if target_polarity == "negative":
            us_prompt = self._user_sim_negative_prompt
            us_role = "user_simulator_negative"
        else:
            us_prompt = self._user_sim_positive_prompt
            us_role = "user_simulator_positive"

        user_response = await self._agent.generate(
            prompt=us_prompt,
            keywords=keywords_text,
            guidance_question=guidance_question,
        )
        agent_history.append({
            "role": us_role,
            "input": {"keywords": keywords_text, "guidance_question": guidance_question},
            "output": user_response,
        })
        dialogue_history.append({"role": "user", "content": user_response})

        # Step 3: 需求画像总结
        conversation_text = "\n".join(
            f"{'recommender' if m['role'] == 'assistant' else 'seeker'}: {m['content']}"
            for m in dialogue_history
        )
        req_summary_raw = await self._agent.generate(
            prompt=self._req_summary_prompt,
            response_format=self._req_summary_format,
            conversation=conversation_text,
            preference_summary=preference_summary if preference_summary else "(no preference information available)",
        )
        agent_history.append({
            "role": "requirement_summary",
            "input": {
                "conversation": conversation_text,
                "preference_summary": preference_summary or "(none)",
            },
            "output": req_summary_raw,
        })

        # 解析 JSON 输出
        fallback = False
        try:
            requirement_result = json.loads(strip_json_fence(req_summary_raw))
        except (json.JSONDecodeError, TypeError):
            requirement_result = {"positive_group": [], "negative_group": []}
            fallback = True

        return requirement_result, dialogue_history, agent_history, fallback
