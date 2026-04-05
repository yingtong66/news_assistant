ROOT_DIR=/mnt/sh/mmvision/home/zijiexin/project/other_VidLLM/RS-lyt/TwoStage
DATA_DIR=/mnt/sh/mmvision/home/zijiexin/project/other_VidLLM/RS-lyt/data/MIND-small_dev_filter_sample1000

# 可选模型:
# Qwen2.5-3B-Instruct, Qwen2.5-7B-Instruct, Qwen2.5-32B-Instruct
# Qwen3-4B-Instruct-2507, Qwen3-8B, Qwen3-30B-A3B-Instruct-2507
# Qwen3.5-4B, Qwen3.5-9B, Qwen3.5-27B
model_type=Qwen3-4B-Instruct-2507
model_dir=/mnt/sh/mmvision/share/pretrained_models/${model_type}
if [ ! -d ${model_dir} ]; then
    echo "Error: 本地LLM模型路径 ${model_dir} 不存在"
    exit 1
fi
rsync -avPh ${model_dir} /tmp/srcs/
model_dir=/tmp/srcs/${model_type}
export LOCAL_LLM_MODEL_PATH=${model_dir}

# ====== 实验配置 ======
BATCH_SIZE=100
ENABLE_INTERPRET=0
ENABLE_CONTROLL=1
# target keywords 极性: positive=用户想看, negative=用户不想看
TARGET_POLARITY=positive
# keywords 名称，对应 data_dir 下的 {KEYWORDS_NAME}_keywords.jsonl
KEYWORDS_NAME=style  # style, L1topic, style_L1topic
KEYWORDS_FILE=${DATA_DIR}/${KEYWORDS_NAME}_keywords.jsonl
# baseline 结果文件（留空则不使用 baseline 初始排名）
BASELINE_FILE=/mnt/sh/mmvision/home/zijiexin/project/other_VidLLM/RS-lyt/baseline/nrms/output/20260315_135237/best_samples.json

# 从 baseline 路径提取方法名: .../baseline/<name>/output/... -> <name>
BASELINE_NAME=""
BASELINE_ARG=""
if [ -n "${BASELINE_FILE}" ] && [ -f "${BASELINE_FILE}" ]; then
    BASELINE_NAME=$(echo "${BASELINE_FILE}" | grep -oP 'baseline/\K[^/]+')
    BASELINE_ARG="--baseline_file ${BASELINE_FILE}"
fi

# 输出目录
TIMESTAMP=$(date +'%Y%m%d_%H%M%S')
if [ -n "${BASELINE_NAME}" ]; then
    output_dir=${ROOT_DIR}/output/${model_type}/${TIMESTAMP}_${BASELINE_NAME}_KN${KEYWORDS_NAME}_I${ENABLE_INTERPRET}C${ENABLE_CONTROLL}_bs${BATCH_SIZE}
else
    output_dir=${ROOT_DIR}/output/${model_type}/${TIMESTAMP}_KN${KEYWORDS_NAME}_I${ENABLE_INTERPRET}C${ENABLE_CONTROLL}_bs${BATCH_SIZE}
fi
mkdir -p ${output_dir}

cd ${ROOT_DIR}
python main.py \
    --data_dir ${DATA_DIR} \
    --batch_size ${BATCH_SIZE} \
    --enable_interpret ${ENABLE_INTERPRET} \
    --enable_controll ${ENABLE_CONTROLL} \
    --output_dir ${output_dir} \
    --behaviors_file ${DATA_DIR}/behaviors_neg19_absfilt.tsv \
    --target_polarity ${TARGET_POLARITY} \
    --keywords_file ${KEYWORDS_FILE} \
    ${BASELINE_ARG} \
    2>&1 | tee "${output_dir}/output.log"
