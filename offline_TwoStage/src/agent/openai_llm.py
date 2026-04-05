from dotenv import load_dotenv
# from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from src.agent.base import Agent
from transformers import AutoModelForCausalLM, AutoTokenizer
from accelerate import infer_auto_device_map, dispatch_model
import json
import asyncio
import logging

load_dotenv()
logger = logging.getLogger(__name__)

class OpenAIAgent(Agent):
    def __init__(self, api_key=None):
        # 初始化异步 OpenAI 客户端；api_key 可外部注入，也可依赖环境变量。
        self._client = AsyncOpenAI(api_key=api_key)

    async def generate(
        self, prompt, history=[], reverse_role=False, get_usage=False,response_format={}, **params
    ):
        # 与模型无关的处理统一到 build_filled_prompt，便于其他 Agent 复用。
        filled_prompt = Agent.build_filled_prompt(
            prompt, history=history, reverse_role=reverse_role, **params
        )
        # 设置响应格式。
        if response_format:
            filled_prompt["response_format"] = response_format
        else:
            pass

        # 异步调用 OpenAI ChatCompletions。
        response = await self._client.chat.completions.create(**filled_prompt)

        # 需要用量信息时返回 (文本, usage)，否则仅返回生成文本。
        if get_usage:
            usage = dict(response.usage)
            return [choice.message.content for choice in response.choices][0], usage
        return [choice.message.content for choice in response.choices][0]
