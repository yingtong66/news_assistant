import os
import json
import yaml
import pickle
import pandas as pd
from typing import Any, List, Optional
import pyarrow.feather as feather
from scipy.sparse import csr_matrix
from datetime import datetime, timezone


def to_json(obj: dict[str, Any], path: str, encoding: str = "utf-8") -> None:
    """Write a json file."""
    # 确保目录存在，并以可读格式写入 JSON。
    make_folder(path, ["json"])
    with open(path, "w", encoding=encoding) as f:
        json.dump(obj, f, ensure_ascii=False, indent=4)


def read_json(path: str, encoding: str = "utf-8") -> dict:
    """Read a json file."""
    # 读取并解析 JSON 文件为 dict。
    with open(path, "r", encoding=encoding) as f:
        return json.load(f)


def read_pickle(path: str) -> dict:
    """read pickle file"""
    # 读取二进制 pickle 文件。
    with open(path, "rb") as f:
        return pickle.load(f)


def read_yaml(path: str, encoding: str = "utf-8") -> dict:
    """Read a yaml file."""
    # 读取并解析 YAML 文件为 dict。
    with open(path, "r", encoding=encoding) as f:
        return yaml.load(f, Loader=yaml.FullLoader)


def to_pickle(obj: dict, path: str) -> None:
    """write pickle file"""
    # 保存对象为 pickle 文件。
    make_folder(path, ["pkl", "pickle"])
    with open(path, "wb") as f:
        pickle.dump(obj, f)


def make_folder(path, extension):
    # 检查扩展名并创建目标目录。
    dir_, file = os.path.split(path)
    if file.split(".")[-1] not in extension:
        raise ValueError(f"extension is not {extension}")
    if dir_ != "":
        os.makedirs(dir_, exist_ok=True)


def read_jsonl(path: str, encoding: str = "utf-8") -> List[dict]:
    """Read a jsonl file."""
    # 逐行读取 jsonl，每行一个 JSON 对象。
    with open(path, "r", encoding=encoding) as f:
        return [json.loads(line.strip()) for line in f]


def to_jsonl(obj_list: List[dict], path: str, encoding: str = "utf-8") -> None:
    """Write a jsonl file."""
    # 将对象列表逐行写成 jsonl 文件。
    make_folder(path, ["jsonl"])
    with open(path, "w", encoding=encoding) as f:
        for obj in obj_list:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def convert_unix_timestamp_to_utc(timestamp):
    # 将 Unix 时间戳转换为 UTC 字符串（ISO 8601 格式）。
    # Convert milliseconds to seconds
    timestamp_seconds = timestamp

    # Convert to UTC time
    utc_time = datetime.fromtimestamp(timestamp_seconds, timezone.utc)

    # Format the output
    utc_formatted = utc_time.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    return utc_formatted


# def read_sparse_data(filename):
#     dense_df = pd.read_feather(f"{filename}_data.feather")
#     index_names = pd.read_feather(f"{filename}_index.feather")["index_names"]
#     column_names = pd.read_feather(f"{filename}_columns.feather")["column_names"]

#     coo = csr_matrix((dense_df["data"], (dense_df["row"], dense_df["col"])))

#     sparse_df = pd.DataFrame.sparse.from_spmatrix(
#         coo, index=index_names, columns=column_names
#     )

#     return sparse_df


def read_sparse_data(filename):
    # 读取稀疏矩阵拆分文件并重建为 pandas 稀疏 DataFrame。
    dense_df = pd.read_feather(f"{filename}_data.feather")
    index_names = pd.read_feather(f"{filename}_index.feather")["index_names"]
    column_names = pd.read_feather(f"{filename}_columns.feather")["column_names"]

    coo = csr_matrix((dense_df["data"], (dense_df["row"], dense_df["col"])))

    # 实际稀疏矩阵尺寸。
    actual_rows = coo.shape[0]
    actual_cols = coo.shape[1]

    # 按实际尺寸截断索引/列名，避免长度不一致。
    index_names = index_names[:actual_rows]
    column_names = column_names[:actual_cols]

    # 生成稀疏 DataFrame 并挂接索引/列名。
    sparse_df = pd.DataFrame.sparse.from_spmatrix(coo)
    sparse_df.index = index_names
    sparse_df.columns = column_names

    return sparse_df


def to_sparse_data(sparse_df, filename):
    # 将稀疏 DataFrame 拆分保存为 data/index/columns 三个 feather 文件。
    coo = sparse_df.sparse.to_coo()

    dense_df = pd.DataFrame({"data": coo.data, "row": coo.row, "col": coo.col})

    index_names = pd.Series(sparse_df.index.values, name="index_names")
    column_names = pd.Series(sparse_df.columns.values, name="column_names")

    feather.write_feather(dense_df, f"{filename}_data.feather")
    feather.write_feather(pd.DataFrame(index_names), f"{filename}_index.feather")
    feather.write_feather(pd.DataFrame(column_names), f"{filename}_columns.feather")

def evaluation(title,given_recommendation):
    # 简单评测：若命中且排名 < 10 则计入 NDCG。
    NDCG =0
    HT = 0
    for i in range(len(given_recommendation)):
        if given_recommendation[i]== title:
            rank = i
    if rank<10:
        NDCG +=1


def format_dialogue_history(dialogue_history: List[dict], idx: int = None) -> str:
    """
    格式化对话历史，使其更易读。
    
    Args:
        dialogue_history: 对话历史列表，每个元素包含 'role' 和 'content' 字段
        idx: 可选的索引编号，用于标识不同的对话
    
    Returns:
        str: 格式化后的对话历史字符串
    """
    if not dialogue_history:
        return "No dialogue history available."
    
    lines = []
    if idx is not None:
        lines.append(f"\n{'='*80}")
        lines.append(f"Dialogue History [{idx}]")
        lines.append(f"{'='*80}")
    else:
        lines.append(f"\n{'='*80}")
        lines.append("Dialogue History")
        lines.append(f"{'='*80}")
    
    for i, msg in enumerate(dialogue_history, 1):
        role = msg.get('role', 'unknown')
        content = msg.get('content', '')
        
        # 格式化角色名称
        role_display = role.upper() if role in ['user', 'assistant'] else role
        
        lines.append(f"\n[Turn {i}] {role_display}:")
        # 如果内容太长，进行换行处理
        if len(content) > 100:
            # 尝试按句号、问号、感叹号分割
            # sentences = content.replace('。', '。\n').replace('?', '?\n').replace('!', '!\n')
            sentences = content
            lines.append(sentences)
        else:
            lines.append(content)
        lines.append(f"{'-'*80}")
    
    lines.append(f"\n{'='*80}\n")
    return "\n".join(lines)


def format_agent_history(agent_history: List[dict], idx: int = None) -> str:
    """
    格式化agent输出历史，使其更易读。
    
    Args:
        agent_history: agent历史列表，每个元素包含 'role' 和 'content' 字段
        idx: 可选的索引编号，用于标识不同的对话
    
    Returns:
        str: 格式化后的agent历史字符串
    """
    if not agent_history:
        return "No agent history available."
    
    lines = []
    if idx is not None:
        lines.append(f"\n{'='*80}")
        lines.append(f"Agent History [{idx}]")
        lines.append(f"{'='*80}")
    else:
        lines.append(f"\n{'='*80}")
        lines.append("Agent History")
        lines.append(f"{'='*80}")
    
    for i, agent_output in enumerate(agent_history, 1):
        role = agent_output.get('role', 'unknown')
        content = agent_output.get('content', '')
        
        # 格式化角色名称
        role_display = role.replace('_', ' ').title()
        
        lines.append(f"\n[Step {i}] {role_display}:")
        
        # 尝试解析JSON格式的内容
        try:
            if isinstance(content, str) and (content.strip().startswith('{') or content.strip().startswith('[')):
                parsed = json.loads(content)
                formatted_json = json.dumps(parsed, ensure_ascii=False, indent=2)
                lines.append(formatted_json)
            else:
                lines.append(str(content))
        except (json.JSONDecodeError, TypeError):
            # 如果不是JSON，直接输出
            lines.append(str(content))
        lines.append(f"{'-'*80}")
    
    lines.append(f"\n{'='*80}\n")
    return "\n".join(lines)


def format_history_output(
    dialogue_history: Optional[List[dict]] = None,
    agent_history: Optional[List[dict]] = None,
    idx: Optional[int] = None
) -> str:
    """
    同时格式化对话历史和agent历史，返回完整的格式化输出。

    Args:
        dialogue_history: 对话历史列表
        agent_history: agent历史列表
        idx: 可选的索引编号

    Returns:
        str: 格式化后的完整输出字符串
    """
    output_parts = []

    if dialogue_history:
        output_parts.append(format_dialogue_history(dialogue_history, idx))

    if agent_history:
        output_parts.append(format_agent_history(agent_history, idx))

    return "\n".join(output_parts)


# 自定义 JSON 序列化：value 中不含 dict 的输出为单行，含 dict 的递归展开
def compact_json(obj, indent=0):
    pad = "  " * indent
    pad_inner = "  " * (indent + 1)

    def _is_simple(v):
        if isinstance(v, dict):
            return False
        if isinstance(v, list):
            return all(not isinstance(x, dict) for x in v)
        return True

    if isinstance(obj, list):
        if all(_is_simple(x) for x in obj):
            return json.dumps(obj, ensure_ascii=False)
        items = []
        for item in obj:
            items.append(pad_inner + compact_json(item, indent + 1))
        return "[\n" + ",\n".join(items) + "\n" + pad + "]"

    if isinstance(obj, dict):
        items = []
        for k, v in obj.items():
            key_str = json.dumps(k, ensure_ascii=False)
            if _is_simple(v):
                val_str = json.dumps(v, ensure_ascii=False)
            else:
                val_str = compact_json(v, indent + 1)
            items.append(pad_inner + key_str + ": " + val_str)
        return "{\n" + ",\n".join(items) + "\n" + pad + "}"

    return json.dumps(obj, ensure_ascii=False)
