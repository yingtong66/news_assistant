import numpy as np
from sklearn.metrics import roc_auc_score


# 计算单条 impression 的 AUC/MRR/NDCG@K，与 baseline 评测逻辑对齐
def compute_impression_metrics(rerank_list, candidates, labels):
    """
    rerank_list: 模型输出的排序 item ID 列表（可能不含全部候选）
    candidates: 原始候选 ID 列表
    labels: 对应 candidates 的 0/1 标签列表
    返回 dict: {auc, mrr, ndcg5, ndcg10} 或 None（全正/全负样本跳过）
    """
    # 全正或全负样本跳过（AUC 未定义，与 baseline 一致）
    if sum(labels) == 0 or sum(labels) == len(labels):
        return None

    # 建立 candidate -> label 映射
    label_map = dict(zip(candidates, labels))

    # 为 rerank_list 中的 item 按位置赋降序分数，不在列表中的得 0
    n = len(rerank_list)
    score_map = {}
    for rank_idx, item_id in enumerate(rerank_list):
        score_map[item_id] = n - rank_idx

    y_true = []
    y_score = []
    for cid in candidates:
        y_true.append(label_map.get(cid, 0))
        y_score.append(score_map.get(cid, 0))

    # AUC（Area Under the ROC Curve）
    # 衡量：模型将正样本排在负样本前面的概率。随机排序 AUC=0.5，完美排序 AUC=1.0。
    # 计算：对所有"正负样本对"统计正样本得分 > 负样本得分的比例。
    # 理解：AUC=0.8 表示随机取一个正样本和一个负样本，有 80% 的概率模型给正样本打了更高的分。
    #       对候选列表长短不敏感，适合不同长度的 impression 之间横向比较。
    auc = roc_auc_score(y_true, y_score)

    # 按分数降序排列，得到排序后的 label 序列（与 baseline 的 argsort 逻辑一致）
    order = np.argsort(-np.array(y_score))
    ordered_labels = [y_true[i] for i in order]

    # MRR（Mean Reciprocal Rank）
    # 衡量：第一个正样本出现在排序列表中的位置，越靠前越好。
    # 计算：找到排序后第一个 label=1 的位置 r，MRR = 1/r（r 从 1 开始）。
    # 理解：MRR=1.0 表示正样本排第 1；MRR=0.5 表示排第 2；MRR=0.1 表示排第 10。
    #       本项目中每条 impression 只有 1 个正样本，所以 MRR 完全等价于正样本的排名倒数。
    mrr = 0.0
    for rank, lab in enumerate(ordered_labels, 1):
        if lab == 1:
            mrr = 1.0 / rank
            break

    # NDCG@K（Normalized Discounted Cumulative Gain at K）
    # 衡量：排序质量，同时考虑"正样本是否出现在 Top-K"和"出现的位置"。
    # 计算：
    #   DCG@K  = sum_{r=1}^{K} gain_r / log2(r+1)，其中 gain_r 是第 r 位的 label（0 或 1）
    #   IDCG@K = 理想排序（所有正样本排最前）时的 DCG@K
    #   NDCG@K = DCG@K / IDCG@K，归一化到 [0, 1]
    # 理解：NDCG@5=1.0 表示正样本在前 5 名内且尽量靠前；NDCG@5=0 表示前 5 名内没有正样本。
    #       相比 MRR，NDCG 对"排第 2 比排第 3 好多少"有对数衰减的量化，更细粒度。
    #       @5 和 @10 分别关注 Top-5 和 Top-10 窗口内的排序质量。
    def _ndcg_at_k(y_true_list, y_score_list, k):
        order_k = np.argsort(-np.array(y_score_list))[:k]
        gains = [y_true_list[i] for i in order_k]
        dcg = sum(g / np.log2(r + 2) for r, g in enumerate(gains))
        ideal = sorted(y_true_list, reverse=True)[:k]
        idcg = sum(g / np.log2(r + 2) for r, g in enumerate(ideal))
        return dcg / idcg if idcg > 0 else 0.0

    ndcg5 = _ndcg_at_k(y_true, y_score, 5)
    ndcg10 = _ndcg_at_k(y_true, y_score, 10)

    return {"auc": auc, "mrr": mrr, "ndcg5": ndcg5, "ndcg10": ndcg10}


# 计算单条样本的 HIT/NDCG@K/MRR（基于排名位置）
def cal_ndcg_hr_single(answer, ranking_list, topk=10):
    try:
        rank = ranking_list.index(answer)
        HIT = 0
        NDCG = 0
        MRR = 1.0 / (rank + 1.0)
        if rank < topk:
            NDCG = 1.0 / np.log2(rank + 2.0)
            HIT = 1.0
    except ValueError:
        HIT = -1
        NDCG = -1
        MRR = -1
    return HIT, NDCG, MRR


# 汇总评测指标：HT（最后一轮命中）、Sc（提前命中）、平均轮次及成功率
def evaluate_results(results, max_turns, batch_size):
    HT = 0.0
    Sc = 0.0
    turns = 0
    for accepted, turn in results:
        if turn == max_turns:
            if accepted:
                HT += 1
        else:
            if accepted:
                Sc += 1
        turns += turn
    success_rate = Sc / batch_size
    hit_rate = (HT + Sc) / batch_size
    average_turn = turns / batch_size
    return success_rate, hit_rate, average_turn
