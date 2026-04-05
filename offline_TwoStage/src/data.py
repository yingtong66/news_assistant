import os
import pandas as pd
from src.utils import read_json
from typing import Dict


def load_mind_data(root: str = "", split: str = "train", size: str = "small", filtered: bool = False, data_dir: str = "") -> Dict[str, pd.DataFrame]:
    """
    加载 MIND 数据集的 news.tsv 与 behaviors.tsv。
    - data_dir: 直接指定包含 news.tsv/behaviors.tsv 的目录（优先级最高，设置后忽略 root/split/size/filtered）。
    - root: MIND 数据所在根目录，内部结构形如 MINDsmall_train/news.tsv、behaviors.tsv。
    - split: train/dev（test 无标签不做解析）。
    - size: small/large。
    - filtered: 是否使用筛选后的数据（仅保留恰好 1 个正样本的 impression）。
    返回 dict：{"news": news_df, "behaviors": behaviors_df}。
    """
    if data_dir:
        base = data_dir
    else:
        size = size.lower()
        split = split.lower()
        if size not in {"small", "large"}:
            raise ValueError("size must be 'small' or 'large'")
        if split not in {"train", "dev"}:
            raise ValueError("split must be 'train' or 'dev'")
        suffix = "_filter" if filtered else ""
        base = os.path.join(root, f"MIND-{size}_{split}{suffix}")
    news_tsv = os.path.join(base, "news.tsv")
    beh_tsv = os.path.join(base, "behaviors.tsv")
    if not (os.path.exists(news_tsv) and os.path.exists(beh_tsv)):
        raise FileNotFoundError(f"Missing news.tsv or behaviors.tsv under {base}")

    # news.tsv: nid, category, subcategory, title, abstract, url, title_entities, abstract_entities
    news = pd.read_csv(
        news_tsv,
        sep="\t",
        header=None,
        quoting=3,
        names=["news_id", "category", "subcategory", "title", "abstract", "url", "title_entities", "abstract_entities"],
    ).fillna("")

    # behaviors.tsv: impression_id, user_id, time, history, impressions (N123-1 N234-0 ...)
    behaviors = pd.read_csv(
        beh_tsv,
        sep="\t",
        header=None,
        quoting=3,
        names=["impression_id", "user_id", "time", "history", "impressions"],
    ).fillna("")

    # 解析 impressions 列为候选列表与标签，便于后续使用。
    # impressions 形如 "N123-1 N234-0 ..."，按空格拆分后：
    # - candidates 取每个 token "-" 左侧的新闻 ID；
    # - labels 取 "-" 右侧的点击标记（非数字则置 0）。
    behaviors["candidates"] = behaviors["impressions"].apply(
        lambda x: [tok.rsplit("-", 1)[0] for tok in str(x).split() if "-" in tok]
    )
    behaviors["labels"] = behaviors["impressions"].apply(
        lambda x: [
            int(tok.rsplit("-", 1)[1]) if tok.rsplit("-", 1)[1].isdigit() else 0
            for tok in str(x).split() if "-" in tok
        ]
    )
    # history 列是历史新闻 ID 序列（空串则返回空列表）。
    behaviors["history"] = behaviors["history"].apply(
        lambda x: str(x).split() if str(x).strip() else []
    )

    return {"news": news, "behaviors": behaviors}
