import re
import json
from copy import deepcopy
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from src.utils import read_yaml


class Agent(ABC):
    @abstractmethod
    async def generate(self, **params):
        # 抽象方法：子类必须实现生成逻辑。
        # 约定参数通过 **params 传入，便于不同模型/接口扩展。
        pass

    @staticmethod
    def fill_prompt(prompt, **kwargs):
        """
        用于填充 prompt 中的占位符。
        """
        # 将 prompt 中的 {{$var}} 模板变量替换为 kwargs 实参。
        # 例：prompt 中包含 {{$conversation}}，kwargs 传入 conversation="hi"。
        def _fill(msg, kwargs):
            all_context_input = []
            # 正则匹配所有 {{$...}} 形式的占位符。
            context_input = re.findall(r"(\{\{\$.+?\}\})", msg)
            for input_ in context_input:
                # input_ 形如 {{$key}}，提取 key 后在 kwargs 中取值。
                str_to_replace = kwargs[input_[3:-2]]
                all_context_input.append(input_[3:-2])
                # 将常见类型统一转换为字符串表现形式，便于拼接到 prompt。
                if isinstance(str_to_replace, int):
                    str_to_replace = str(str_to_replace)
                if isinstance(str_to_replace, list):
                    # 列表转为项目符号，每行一个元素。
                    str_to_replace = "- " + "\n- ".join(str_to_replace)
                if isinstance(str_to_replace, dict):
                    # dict 转为 JSON 字符串，并做简单换行增强可读性。
                    str_to_replace = json.dumps(str_to_replace).replace('", "', '",\n"')
                # 将当前占位符替换为最终字符串。
                msg = msg.replace(input_, str_to_replace)
            return msg, all_context_input

        # 深拷贝避免就地修改原始 prompt。
        prompt = deepcopy(prompt)
        all_context_input = []
        if isinstance(prompt["messages"], str):
            # prompt["messages"] 是单个字符串时，直接替换。
            output = _fill(prompt["messages"], kwargs)
            prompt["messages"] = output[0]
            all_context_input.extend(output[1])
        else:
            # prompt["messages"] 是消息列表时，逐条替换 content。
            for msg in prompt["messages"]:
                output = _fill(msg["content"], kwargs)
                msg["content"] = output[0]
                all_context_input.extend(output[1])

        # 返回替换后的 prompt（以及已处理的变量名列表）。
        return prompt

    # 与模型无关的 prompt 预处理：加载、合并历史、角色翻转。
    @staticmethod
    def _load_prompt_obj(prompt: Any) -> Dict[str, Any]:
        """
        用于加载 prompt 对象。
        """
        if isinstance(prompt, str) and prompt.endswith(".yaml"):
            return read_yaml(prompt)
        return deepcopy(prompt)

    @staticmethod
    def _merge_history(messages: List[Dict[str, str]], history: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """
        用于合并历史消息。
        """
        if history == []:
            return messages
        if messages and messages[0]["role"] == "system":
            return (
                messages[:1]
                + [{"role": hist["role"], "content": hist["content"]} for hist in history]
                + messages[1:]
            )
        return [{"role": hist["role"], "content": hist["content"]} for hist in history] + messages

    @staticmethod
    def _reverse_roles(messages: List[Dict[str, str]], reverse: bool) -> List[Dict[str, str]]:
        """
        用于翻转角色。
        """
        if not reverse:
            return messages
        # 保持原有行为：将 user/assistant 对调，其他角色统一视为 user。
        return [
            {
                "role": "assistant" if message["role"] == "user" else "user",
                "content": message["content"],
            }
            for message in messages
        ]

    @classmethod
    def build_filled_prompt(
        cls,
        prompt: Any,
        history: Optional[List[Dict[str, str]]] = None,
        reverse_role: bool = False,
        **params,
    ) -> Dict[str, Any]:
        """
        组合与模型无关的处理步骤：读取 prompt、插入 history、翻转角色、填充占位符。
        返回可直接发送给具体模型的参数字典。
        """
        history = history or []
        prompt_obj = cls._load_prompt_obj(prompt)
        prompt_obj["messages"] = cls._merge_history(prompt_obj["messages"], history)
        prompt_obj["messages"] = cls._reverse_roles(prompt_obj["messages"], reverse_role)
        return cls.fill_prompt(prompt_obj, **params)
