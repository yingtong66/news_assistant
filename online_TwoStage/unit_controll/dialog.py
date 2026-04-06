import logging
from agent.prompt.prompt_utils import get_bailian_response, DIALOG_MODEL
from online_TwoStage.unit_controll.prompts import GUIDANCE_COLD_TEMPLATE, GUIDANCE_WARM_PROMPT

logger = logging.getLogger("myapp")


# 根据偏好摘要生成需求引导问题
def get_guidance_question(preference_summary="") -> str:
    if not preference_summary:
        return GUIDANCE_COLD_TEMPLATE
    msg = [{"role": "user", "content": GUIDANCE_WARM_PROMPT.format(preference_summary=preference_summary)}]
    response = get_bailian_response(msg, model=DIALOG_MODEL)
    if response and not response.startswith("对不起"):
        logger.info("[GuidedChat] 生成个性化引导问题: %s", response[:100])
        return response
    logger.warning("[GuidedChat] LLM 生成引导问题失败，回退冷启动模板")
    return GUIDANCE_COLD_TEMPLATE
