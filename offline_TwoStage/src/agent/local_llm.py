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


class LocalModelAgent(Agent):
    """
    使用本地 Qwen2.5-0.5B-Instruct 的异步 Agent，接口与 OpenAIAgent 保持一致。
    模型路径默认指向 `/home/xzj/VisualSearch/Checkpoints/Qwen/Qwen2.5-0.5B-Instruct`。
    """
    
    def __init__(self, model_path=None, device_map="auto"):
        # 记录模型路径与设备映射；延迟加载模型以节省启动时间和资源。
        self._model_path = model_path
        self._device_map = device_map
        self._model = None
        self._tokenizer = None

    def _apply_response_format(self, messages, response_format):
        """
        将 response_format 信息转化为系统提示，指导本地模型按 schema 输出。
        说明：本地模型不直接支持 OpenAI 的 response_format，因此需要在消息中追加约束性的 system 提示，
            让模型按指定 JSON 结构输出，尽量对齐 OpenAI 行为。
        """
        if not response_format:
            # 未提供 response_format 时，直接返回原始 messages。
            return messages

        # 拷贝消息列表，避免修改上游传入的引用。
        messages = list(messages)
        format_type = response_format.get("type")

        if format_type == "json_schema":
            # 仅处理 json_schema 场景：从 schema_block 中提取 schema/name/strict 约束。
            schema_block = response_format.get("json_schema", {})
            schema_text = json.dumps(schema_block.get("schema", {}), indent=2)
            name = schema_block.get("name")
            # instructions 用于拼接 system 提示，指导模型严格输出 JSON。
            instructions = [
                "Please reply with a single JSON object that follows this schema.",  # 仅返回一个 JSON 对象。
                f"Schema name: {name}" if name else None,  # 若提供 name，附加提示。
                f"Schema definition:\n{schema_text}",  # 展示 schema 具体字段定义。
            ]
            if schema_block.get("strict"):
                # strict=True 时，强调不可出现未定义字段。
                instructions.append("DO NOT add any keys that are not defined in the schema.")
            # 强制不输出额外解释，避免解析困难。
            instructions.append("No extra text or explanation outside the JSON object.")
            messages.append(
                {"role": "system", "content": "\n".join(line for line in instructions if line)}
            )
        else:
            # 其他类型暂未特殊处理，默认要求直接给出最终答案，避免多余格式。
            messages.append(
                {"role": "system", "content": "Return only the final answer without extra formatting."}
            )

        return messages

    def _ensure_model(self):
        # 延迟加载模型，避免未使用时占用显存/内存。
        if self._model is None or self._tokenizer is None:
            # tokenizer 和模型仅在首次调用时加载；先在 CPU 上加载并绑定权重，再推理设备映射。
            self._tokenizer = AutoTokenizer.from_pretrained(self._model_path)
            # 直接按 device_map 将权重加载到目标设备，避免二次 dispatch 产生 meta tensor。
            self._model = AutoModelForCausalLM.from_pretrained(
                self._model_path,
                device_map=self._device_map,
                dtype="auto",
                low_cpu_mem_usage=True,
            )
            print(f"Model <{self._model_path}> loaded successfully on device: {self._model.device}")

    async def generate(
        self,
        prompt,
        history=None,
        reverse_role=False,
        get_usage=False,
        response_format={},
        **params
    ):
        """
        Args:
            prompt: 
            history: 
            reverse_role: 
            get_usage: 
            response_format: 
            **params:
        Returns:
        """
        # 复用通用逻辑：读取/填充 prompt、合并历史、角色翻转、占位符替换。
        filled_prompt = self.build_filled_prompt(
            prompt, history=history or [], reverse_role=reverse_role, **params
        )
        temperature = filled_prompt.get("temperature", 0.7)
        max_new_tokens = filled_prompt.get("max_tokens", 512)
        messages = self._apply_response_format(filled_prompt["messages"], response_format)

        # 同步生成封装为异步调用，避免阻塞事件循环。
        return await asyncio.to_thread(
            self._generate_sync, messages, temperature, max_new_tokens, get_usage, response_format
        )

    def _matches_schema(self, value, schema):
        """
        递归校验 value 是否满足 schema 定义（支持 object/array/原子类型的基本检查）。
        """
        schema_type = schema.get("type")
        if schema_type == "object":
            if not isinstance(value, dict):
                return False
            properties = schema.get("properties", {})
            required_keys = schema.get("required", [])
            for key in required_keys:
                if key not in value:
                    return False
            if schema.get("additionalProperties") is False:
                extra_keys = set(value.keys()) - set(properties.keys())
                if extra_keys:
                    return False
            for key, val in value.items():
                if key in properties and not self._matches_schema(val, properties[key]):
                    return False
            return True
        if schema_type == "array":
            if not isinstance(value, list):
                return False
            item_schema = schema.get("items", {})
            return all(self._matches_schema(item, item_schema) for item in value)
        if schema_type == "string":
            return isinstance(value, str)
        if schema_type == "integer":
            return isinstance(value, int) and not isinstance(value, bool)
        if schema_type == "number":
            return isinstance(value, (int, float)) and not isinstance(value, bool)
        if schema_type == "boolean":
            return isinstance(value, bool)
        if schema_type == "null":
            return value is None
        # 未指定 type 时不强制校验。
        return True

    def _validate_response_format(self, decoded, response_format):
        # 根据 response_format 校验本地模型输出；若不符合预期则抛出异常。
        if not response_format:
            return
        if response_format.get("type") != "json_schema":
            return
        schema_block = response_format.get("json_schema", {})
        schema = schema_block.get("schema", {})
        try:
            parsed = json.loads(decoded)
        except json.JSONDecodeError as err:
            # 不中断程序：仅记录警告，返回原始文本。
            logger.warning("本地模型输出非 JSON，无法解析: %s", err)
            return

        if not self._matches_schema(parsed, schema):
            # 不中断程序：仅记录警告，返回原始文本。
            logger.warning("本地模型输出未满足 schema 约束: %s", schema_block)
            return

    def _generate_sync(self, messages, temperature, max_new_tokens, get_usage, response_format):
        """
        在同步线程内完成推理，主事件循环不会被阻塞。
        """
        self._ensure_model()
        # 将 OpenAI 格式的 messages 转为 Qwen chat 模板。
        # print(f"\nmessages: === {messages}")
        prompt_text = self._tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = self._tokenizer(prompt_text, return_tensors="pt").to(self._model.device)
        outputs = self._model.generate(
            **inputs,
            temperature=temperature,
            max_new_tokens=max_new_tokens,
            do_sample=temperature > 0,
            pad_token_id=self._tokenizer.eos_token_id,
        )
        decoded = self._tokenizer.decode(
            outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True
        )
        # print(f"decoded: === {decoded}")
        # 如指定 response_format，则对输出进行 schema 校验。
        self._validate_response_format(decoded, response_format)
        if get_usage:
            # 本地模型暂无精确 token 计费，返回 None。
            return decoded, None
        return decoded
