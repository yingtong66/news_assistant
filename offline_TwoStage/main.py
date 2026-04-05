import os
import json
import time
import asyncio
import argparse
import numpy as np
import pandas as pd

from src.data import load_mind_data
from src.metrics import compute_impression_metrics
from src.utils import read_jsonl, compact_json
from src.pipeline import TwoStagePipeline
from src.agent.openai_llm import OpenAIAgent
from src.agent.local_llm import LocalModelAgent
from dotenv import load_dotenv
load_dotenv()


# 解析命令行参数
def parse_arguments():
    parser = argparse.ArgumentParser(description="TwoStage 模块化多智能体推荐系统")
    parser.add_argument("--data_dir", type=str,
                        default="/mnt/sh/mmvision/home/zijiexin/project/other_VidLLM/RS-lyt/data/MIND-small_dev_filter_sample1000",
                        help="数据目录（包含 news.tsv, behaviors.tsv, style_keywords.jsonl）")
    parser.add_argument("--batch_size", "-b", type=int, default=100, help="评测样本数")
    parser.add_argument("--model_type", type=str, choices=["openai", "local"], default="local", help="选择代理后端")
    parser.add_argument("--enable_interpret", type=int, choices=[0, 1], default=1, help="启用偏好解析模块 (1=启用, 0=禁用)")
    parser.add_argument("--enable_controll", type=int, choices=[0, 1], default=1, help="启用需求对话模块 (1=启用, 0=禁用)")
    parser.add_argument("--output_dir", type=str, default=None, help="输出目录，留空则自动生成")
    parser.add_argument("--behaviors_file", type=str, default=None,
                        help="指定 behaviors tsv 文件路径（默认使用 data_dir/behaviors.tsv）")
    parser.add_argument("--target_polarity", type=str, choices=["positive", "negative"], default="positive",
                        help="target keywords 极性: positive=用户想看, negative=用户不想看")
    parser.add_argument("--baseline_file", type=str, default=None,
                        help="baseline 结果 JSON 文件路径，使用其 rerank_list 作为候选排序输入")
    parser.add_argument("--keywords_file", type=str, default=None,
                        help="keywords jsonl 文件路径（默认使用 data_dir/style_keywords.jsonl）")
    return parser.parse_args()


# 构建 (user_id, news_id) -> keywords 映射
def build_keyword_map(kw_path):
    kw_map = {}
    for line in read_jsonl(kw_path):
        key = (line["user_id"], line["news_id"])
        kw_map[key] = line.get("keywords", [])
    return kw_map


# 加载 baseline 结果，构建 (impression_id, user_id) -> sample 映射
def load_baseline(baseline_path):
    with open(baseline_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    bl_map = {}
    for s in data:
        key = (str(s["impression_id"]), str(s["user_id"]))
        bl_map[key] = s
    return bl_map


# 格式化指标对比表
def format_comparison(bl_metrics, ma_metrics, bl_name="Baseline"):
    lines = []
    bl_label = bl_name[:10]
    header = f"{'Metric':<10} {bl_label:>10} {'MultiAgent':>12} {'Delta':>10}"
    lines.append(header)
    lines.append("-" * len(header))
    for key, label in [("auc", "AUC"), ("mrr", "MRR"), ("ndcg5", "NDCG@5"), ("ndcg10", "NDCG@10")]:
        bv = bl_metrics[key]
        mv = ma_metrics[key]
        delta = mv - bv
        sign = "+" if delta >= 0 else ""
        lines.append(f"{label:<10} {bv:>10.4f} {mv:>12.4f} {sign}{delta:>9.4f}")
    return "\n".join(lines)


async def main():
    args = parse_arguments()
    data_dir = args.data_dir
    batch_size = args.batch_size
    model_type = args.model_type
    enable_interpret = bool(args.enable_interpret)
    enable_controll = bool(args.enable_controll)
    target_polarity = args.target_polarity

    # 加载数据
    mind_data = load_mind_data(data_dir=data_dir)
    news_df = mind_data["news"]

    # 加载 behaviors：支持自定义文件
    if args.behaviors_file:
        behaviors_df = pd.read_csv(
            args.behaviors_file, sep="\t", header=None, quoting=3,
            names=["impression_id", "user_id", "time", "history", "impressions"],
        ).fillna("")
        behaviors_df["candidates"] = behaviors_df["impressions"].apply(
            lambda x: [tok.rsplit("-", 1)[0] for tok in str(x).split() if "-" in tok]
        )
        behaviors_df["labels"] = behaviors_df["impressions"].apply(
            lambda x: [
                int(tok.rsplit("-", 1)[1]) if tok.rsplit("-", 1)[1].isdigit() else 0
                for tok in str(x).split() if "-" in tok
            ]
        )
        behaviors_df["history"] = behaviors_df["history"].apply(
            lambda x: str(x).split() if str(x).strip() else []
        )
    else:
        behaviors_df = mind_data["behaviors"]
    behaviors = behaviors_df.head(batch_size)

    # 构建映射
    title_map = dict(zip(news_df["news_id"], news_df["title"]))
    abstract_map = dict(zip(news_df["news_id"], news_df["abstract"]))
    kw_path = args.keywords_file if args.keywords_file else os.path.join(data_dir, "style_keywords.jsonl")
    kw_map = build_keyword_map(kw_path)

    # 加载 baseline 结果（可选）
    bl_map = {}
    baseline_name = ""
    if args.baseline_file:
        bl_map = load_baseline(args.baseline_file)
        # 从路径中提取 baseline 方法名: .../baseline/<name>/output/... -> <name>
        parts = args.baseline_file.replace("\\", "/").split("/")
        for i, p in enumerate(parts):
            if p == "baseline" and i + 1 < len(parts):
                baseline_name = parts[i + 1]
                break
        if not baseline_name:
            baseline_name = "baseline"
        print(f"Baseline [{baseline_name}]: {len(bl_map)} samples from {args.baseline_file}")

    # 创建 agent
    if model_type == "openai":
        agent = OpenAIAgent(api_key=os.getenv("OPENAI_API_KEY"))
    else:
        agent = LocalModelAgent(model_path=os.getenv("LOCAL_LLM_MODEL_PATH"))

    # prompt 目录
    prompt_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "prompt"))

    # 输出目录
    output_dir = args.output_dir
    if not output_dir:
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        mode_tag = f"I{int(enable_interpret)}C{int(enable_controll)}"
        if baseline_name:
            mode_tag = f"{baseline_name}_{mode_tag}"
        output_dir = os.path.join(
            os.path.dirname(__file__), "output",
            f"{mode_tag}_{timestamp}_bs{batch_size}"
        )
    os.makedirs(output_dir, exist_ok=True)

    # 创建流水线
    pipeline = TwoStagePipeline(
        agent=agent,
        title_map=title_map,
        abstract_map=abstract_map,
        prompt_root=prompt_root,
        enable_interpret=enable_interpret,
        enable_controll=enable_controll,
    )

    mode_desc = f"Interpret={enable_interpret}, Controll={enable_controll}, Polarity={target_polarity}"
    print(f"TwoStage Pipeline | Mode: {mode_desc} | Batch: {batch_size}")
    if baseline_name:
        print(f"Baseline: [{baseline_name}] {args.baseline_file}")
    print(f"Output: {output_dir}")
    print("=" * 60)

    results = []
    all_sample_records = []
    total = len(behaviors)
    elapsed_list = []
    t_start = time.time()

    for seq, (idx, row) in enumerate(behaviors.iterrows()):
        t0 = time.time()
        candidates = row["candidates"]
        labels = row["labels"]
        history = row["history"]

        # 找到 target_id（首个 label=1 的候选）
        target_id = next(
            (cid for cid, lab in zip(candidates, labels) if lab == 1),
            candidates[0] if candidates else None,
        )
        if target_id is None:
            continue

        # 查找 keywords
        keywords = kw_map.get((row["user_id"], target_id), [])

        # 如果有 baseline，用其 rerank_list 作为候选排序输入
        bl_key = (str(row["impression_id"]), str(row["user_id"]))
        bl_sample = bl_map.get(bl_key)
        bl_metrics = None
        if bl_sample:
            bl_rerank = bl_sample["rerank_list"]
            # 用 baseline rerank_list 替代 candidates 顺序，同时重建 labels
            label_map = dict(zip(candidates, labels))
            candidates_ordered = bl_rerank
            labels_ordered = [label_map.get(cid, 0) for cid in candidates_ordered]
            bl_metrics = compute_impression_metrics(bl_rerank, candidates, labels)
        else:
            candidates_ordered = candidates
            labels_ordered = labels

        # 执行流水线（候选已按 baseline 排序）
        rerank_ids, agent_history, fallback_flags = await pipeline.run(
            history=history,
            candidates=candidates_ordered,
            labels=labels_ordered,
            keywords=keywords,
            target_polarity=target_polarity,
        )

        # 计算 multi-agent 指标（基于原始 candidates/labels）
        ma_metrics = compute_impression_metrics(rerank_ids, candidates, labels)
        target_rank = rerank_ids.index(target_id) + 1 if target_id in rerank_ids else -1

        # 耗时与 ETA
        dt = time.time() - t0
        elapsed_list.append(dt)
        avg_dt = sum(elapsed_list) / len(elapsed_list)
        remaining = total - (seq + 1)
        eta = avg_dt * remaining
        eta_m, eta_s = int(eta // 60), int(eta % 60)

        # 打印日志
        total_elapsed = time.time() - t_start
        te_m, te_s = int(total_elapsed // 60), int(total_elapsed % 60)
        fb_str = f"  FALLBACK={list(fallback_flags.keys())}" if fallback_flags else ""
        uid = row.get("user_id", "")
        if bl_metrics:
            bl_rank = bl_sample.get("target_rank", -1)
            print(f"[{seq+1}/{total}] uid={uid}  target={target_id}  cands={len(candidates_ordered)}  "
                  f"bl_rank={bl_rank}->ma_rank={target_rank}  "
                  f"dt={dt:.1f}s  total={te_m}m{te_s:02d}s  ETA={eta_m}m{eta_s:02d}s{fb_str}")
        else:
            print(f"[{seq+1}/{total}] uid={uid}  target={target_id}  cands={len(candidates_ordered)}  rank={target_rank}  "
                  f"dt={dt:.1f}s  total={te_m}m{te_s:02d}s  ETA={eta_m}m{eta_s:02d}s{fb_str}")

        results.append({"bl_metrics": bl_metrics, "ma_metrics": ma_metrics, "fallback_flags": fallback_flags})

        sample_record = {
            "sample_idx": idx,
            "impression_id": row.get("impression_id", ""),
            "user_id": row.get("user_id", ""),
            "target_id": target_id,
            "keywords": keywords,
            "history": history,
            "candidates": candidates,
            "baseline_rerank": bl_sample["rerank_list"] if bl_sample else None,
            "baseline_metrics": bl_metrics,
            "rerank_list": rerank_ids,
            "target_rank": target_rank,
            "metrics": ma_metrics,
            "fallback_flags": fallback_flags,
            "agents": [
                {"name": ah["role"], "input": ah.get("input", {}), "output": ah.get("output", "")}
                for ah in agent_history
            ],
        }
        all_sample_records.append(sample_record)

    print(f"\nTotal processed: {len(results)}")

    # 统计 fallback 情况
    fallback_counts = {}
    fallback_samples = {}
    for i, r in enumerate(results):
        for stage in r["fallback_flags"]:
            fallback_counts[stage] = fallback_counts.get(stage, 0) + 1
            fallback_samples.setdefault(stage, []).append(i)
    if fallback_counts:
        print(f"\n--- Fallback Summary ---")
        for stage, count in sorted(fallback_counts.items()):
            indices = fallback_samples[stage]
            idx_str = ",".join(str(x) for x in indices[:20])
            if len(indices) > 20:
                idx_str += f"...({len(indices)} total)"
            print(f"  {stage}: {count}/{len(results)} samples  [{idx_str}]")
    else:
        print("No fallback triggered.")

    # 写入 samples.json
    if all_sample_records:
        samples_path = os.path.join(output_dir, "samples.json")
        with open(samples_path, "w", encoding="utf-8") as f:
            f.write(compact_json(all_sample_records))
        print(f"Samples saved to: {samples_path}")

    # 汇总评测指标
    ma_all = [r["ma_metrics"] for r in results if r["ma_metrics"] is not None]
    bl_all = [r["bl_metrics"] for r in results if r["bl_metrics"] is not None]
    skipped = len(results) - len(ma_all)

    if ma_all:
        ma_avg = {
            "auc": np.mean([m["auc"] for m in ma_all]),
            "mrr": np.mean([m["mrr"] for m in ma_all]),
            "ndcg5": np.mean([m["ndcg5"] for m in ma_all]),
            "ndcg10": np.mean([m["ndcg10"] for m in ma_all]),
        }

        metrics_path = os.path.join(output_dir, "metrics.txt")
        with open(metrics_path, "w") as f:
            f.write(f"Mode: Interpret={enable_interpret}, Controll={enable_controll}, Polarity={target_polarity}\n")
            if baseline_name:
                f.write(f"Baseline: [{baseline_name}] {args.baseline_file}\n")
            f.write(f"Batch: {batch_size}, Skipped: {skipped}\n\n")

            if bl_all:
                bl_avg = {
                    "auc": np.mean([m["auc"] for m in bl_all]),
                    "mrr": np.mean([m["mrr"] for m in bl_all]),
                    "ndcg5": np.mean([m["ndcg5"] for m in bl_all]),
                    "ndcg10": np.mean([m["ndcg10"] for m in bl_all]),
                }
                comparison = format_comparison(bl_avg, ma_avg, bl_name=baseline_name)
                print(f"\n===== {baseline_name} vs MultiAgent (n={len(ma_all)}, skipped={skipped}) =====")
                print(comparison)
                print("=" * 50)
                f.write(comparison + "\n")
            else:
                summary = (
                    f"===== MultiAgent Metrics (n={len(ma_all)}, skipped={skipped}) =====\n"
                    f"AUC:     {ma_avg['auc']:.4f}\n"
                    f"MRR:     {ma_avg['mrr']:.4f}\n"
                    f"NDCG@5:  {ma_avg['ndcg5']:.4f}\n"
                    f"NDCG@10: {ma_avg['ndcg10']:.4f}\n"
                    f"{'=' * 50}"
                )
                print(f"\n{summary}")
                f.write(summary + "\n")

            # 写入 fallback 统计
            if fallback_counts:
                f.write("\n--- Fallback Summary ---\n")
                for stage, count in sorted(fallback_counts.items()):
                    f.write(f"  {stage}: {count}/{len(results)} samples\n")


if __name__ == "__main__":
    asyncio.run(main())
