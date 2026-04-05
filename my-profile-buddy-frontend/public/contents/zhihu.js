const backendUrl = "http://localhost:8000" //客户端后端 (用户数据的处理分析)
// const userPid = "大梦想家豪哥" //用户的id
const userPid = "Hsyy04" //用户的id
// const userPid = "DST" //
function sendBackgroundRequest(type, data) {
  return new Promise((resolve, reject) => {
    if (!chrome?.runtime?.sendMessage) {
      reject(new Error("runtime messaging unavailable"));
      return;
    }
    chrome.runtime.sendMessage({ type, data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}



/**
 * 异步获取Chrome扩展存储中的开关状态
 * 该函数用于检查内容过滤功能是否开启
 * @returns {Promise<boolean>} 返回一个Promise，解析为布尔值表示开关状态
 * @throws {Error} 如果Chrome运行时出现错误则抛出异常
 */
async function getIsOpen() { // 异步获取Chrome扩展存储中的开关状态
    return new Promise((resolve, reject) => {
      // 从Chrome扩展的同步存储中获取"isOpen"值
      chrome.storage.sync.get("isOpen", (result) => {
        // 检查Chrome运行时是否有错误
        if (chrome.runtime.lastError) {
          // 如果有错误，拒绝Promise并抛出错误
          reject(new Error(chrome.runtime.lastError));
        } else {
          // 检查存储中是否存在isOpen值
          if (result.isOpen === undefined) {
            // 如果未定义，默认返回false（关闭状态）
            resolve(false);
          } else {
            // 返回存储中的实际值
            resolve(result.isOpen);
          }
        }
      });
    });
  }


function isHost(host) {
  return window.location.hostname === host;
}

function setupClickListener(options) {
  const { host, containerSelector, platform, getTitle } = options;
  if (!isHost(host)) return;

  const targetNode = document.querySelector(containerSelector);
  if (!targetNode) return;

  // 不再无条件滚动，交给 checkAndLoadMore 按需加载
  targetNode.addEventListener('click', async function (event) {
    const title = getTitle(event);
    if (!title) return;
    const jsonData = JSON.stringify({ pid: userPid, platform: platform, title: title});
    chrome.runtime.sendMessage({ type: "build_request_click", data: jsonData });
    console.log('click data:', jsonData);
  }, true);
}

/* 记录用户在推荐列表页的点击事件 */
window.addEventListener('load', function () {
  //知乎
  setupClickListener({
    host: "www.zhihu.com",
    containerSelector: ".Topstory-recommend", //".css-1fsnuue",
    platform: 1,
    getTitle: (event) => {
      let target = event.target;  // 用户点击的元素
      if (target.tagName === 'A' &&
        target.getAttribute('data-za-detail-view-element_name') === 'Title' &&
        target.getAttribute('data-za-detail-view-id') === '2812') {  // 先看看元素是否为标题中可点击的部分，如果是，什么都不做
        } else {                                                         // 如果不是，再看看元素是否为摘要中可点击的部分（体现在target是否为null上）
          target = target.closest('.RichContent-inner, .RichContent-cover');
        }
        // 经过上面的if-else，如果元素是标题中可点击的部分，或者摘要中可点击的部分，不为null
        if (!target) return;
        target = target.closest('.Card.TopstoryItem.TopstoryItem-isRecommend');  // 找到卡片
        if (!target) return;
        const titleDiv = target.querySelector('.ContentItem-title')?.firstChild;
        return titleDiv?.querySelector('a')?.innerText;
    }
  });

  //B站
  setupClickListener({
    host: "www.bilibili.com",
    containerSelector: ".recommended-container_floor-aside",
    platform: 2,
    getTitle: (event) => {
      let target = event.target;  // 用户点击的元素
      if (target.tagName === 'A' && target.getAttribute('data-idx') === 'click' ) { 
        target = target.parentNode;
        } else {                                                         // 如果不是，再看看元素是否为摘要中可点击的部分（体现在target是否为null上）
          target = target.closest('.bili-video-card__info--tit');
        }
        // 经过上面的if-else，如果元素是标题中可点击的部分，或者摘要中可点击的部分，不为null
        if (!target) return;
        return target.getAttribute('title');
    }
  });

  //头条
  setupClickListener({
    host: "www.toutiao.com",
    containerSelector: ".ttp-feed-module",
    platform: 0,
    getTitle: (event) => {
      let target = event.target;
      const card = target.closest('.feed-card-wrapper.feed-card-article-wrapper');
      if (!card) return;
      const a = card.querySelector('a[aria-label]') || card.querySelector('a');
      if (!a) return;
      return a.getAttribute('aria-label') || a.innerText.trim();
    }
  });
});



/* 处理单个卡片的逻辑 */
async function processElement(element, platform=0) {

    let title = "" //undefined
    let content = ""
    let url = ""

    if(platform === 1){ //知乎
        // 获取标题
        const title_tag = element.querySelector(".ContentItem-title");
        title = title_tag.innerText;
        // //获取 content
        const content_tag = element.querySelector(".css-376mun")
        content = content_tag.innerText;
        // 获取 answer_url
        const url_tag = element.querySelector('.ContentItem-title').firstChild
        url = url_tag.querySelector("a").href
    }

    else if(platform ===2){ //B站
      const title_tag = element.querySelector(".bili-video-card__info--tit")
      title = title_tag.getAttribute("title")
    }

    else if(platform === 0){ //头条
      const a =
        element.querySelector(".feed-card-article a[aria-label]") ||
        element.querySelector(".feed-card-article a") ||
        element.querySelector("a[aria-label]") ||
        element.querySelector("a");
      if (a) {
        title = a.getAttribute("aria-label") || a.innerText.trim();
        url = a.href;
      }
      // const content_tag =
      //   element.querySelector(".feed-card-article-desc") ||
      //   element.querySelector(".feed-card-article-summary") ||
      //   element.querySelector(".feed-card-article-content") ||
      //   element.querySelector(".abstract");
      // if (content_tag) {
      //   content = content_tag.innerText.trim();
      // }
    }

    // [已禁用] 逐条过滤已移除，统一由 /reorder 批量处理
    // const isOpen = await getIsOpen();
    // const jsonData = JSON.stringify({ pid: userPid, platform: platform, title: title, content: content, url: url, is_filter: isOpen});
    // try {
    //   const data = await sendBackgroundRequest("build_request_browse", jsonData);
    //   if (data?.data === true) {
    //     // element.style.backgroundColor = '#d3d3d3';
    //     element.remove();
    //     console.log("remove:" + title);
    //   }
    //   console.log("processing one:" + title);
    //   if (isOpen === true) {
    //     var add_label_div = element.querySelector('.ContentItem-title').firstChild;
    //     var label = document.createElement('label');
    //     label.classList.add("FEfUrdfMIKpQDJDqkjte");
    //     label.innerHTML = '??????';
    //     label.style.backgroundColor = 'rgb(146, 207, 191)';
    //     add_label_div.insertAdjacentElement('beforeend', label);
    //   }
    // } catch (err) {
    //   console.warn("browse request failed", err);
    // }
}


async function requestReorder(platform, items) { //向后端请求重排
  try {
    const jsonData = JSON.stringify({ pid: userPid, platform: platform, items: items });
    const data = await sendBackgroundRequest("build_request_reorder", jsonData);
    return data?.data?.order || [];
  } catch (err) {
    console.warn("reorder request failed", err);
    return [];
  }
}

function simulateSilentScrollToBottom() { //静默滚动到页面底部
  // 获取可滚动的根元素，优先用 scrollingElement
  const scrollElement = document.scrollingElement || document.documentElement;
  // 如果当前页面不可滚动，直接退出
  if (!scrollElement) return;
  // 记录当前滚动位置，便于稍后恢复
  const originalTop = scrollElement.scrollTop;
  // 计算页面最大滚动高度（底部位置）
  const targetTop = scrollElement.scrollHeight;
  // 已经在底部就不需要再滚动
  if (targetTop === originalTop) return;
  // 瞬间滚动到页面底部，触发网站加载更多内容
  scrollElement.scrollTop = targetTop;
  // 延迟恢复，给头条等使用 IntersectionObserver 的站点足够时间检测到滚动
  setTimeout(() => {
    scrollElement.scrollTop = originalTop;
  }, 300);
}

async function reorderNewNodes(options, nodes) { //把新插入的卡片发给后端获取随机顺序，然后只重排这批新卡片并插回页面。
  const { container, platform, getTitleForItem } = options;
  // 容器不存在时直接返回空列表
  if (!container) return [];

  // 读取插件开关，未开启则保持原顺序并返回
  const isOpen = await getIsOpen();
  if (!isOpen) return nodes;

  // 过滤出仍然存在于容器中的节点，避免对已被移除的卡片重排
  const liveNodes = nodes.filter((node) => container.contains(node));

  // 构造发送给后端的 items 列表（id 用索引表示，title 用于后端计算）
  const items = liveNodes.map((node, index) => ({
    id: String(index + 1),
    title: getTitleForItem(node) || "",
  }));

  // 请求后端返回新的顺序
  const order = await requestReorder(platform, items);
  // 后端返回异常或数量不匹配则放弃重排
  if (!order || order.length !== liveNodes.length) return liveNodes;

  // 建立 id 到节点的映射，方便按新顺序取回节点
  const idToNode = {};
  liveNodes.forEach((node, index) => {
    idToNode[String(index + 1)] = node;
  });

  // 记录每个节点原本后面的锚点，重排后尽量插回原位置区间

  // Record positions inside the container so we can reinsert by index.
  const positions = liveNodes.map((node) =>
    Array.prototype.indexOf.call(container.children, node)
  );
  positions.sort((a, b) => a - b);

  // Remove nodes before reinsert to avoid index shifts.
  liveNodes.forEach((node) => container.removeChild(node));

  // Reinsert according to the backend order, using fixed indices.
  order.forEach((id, index) => {
    const node = idToNode[id];
    if (!node) return;
    node.dataset.mpbInserted = "1";
    const targetIndex = positions[index];
    if (targetIndex === undefined || targetIndex < 0) {
      container.appendChild(node);
      return;
    }
    const refNode = container.children[targetIndex] || null;
    container.insertBefore(node, refNode);
  });

  // 返回实际参与重排的节点列表，供外层清理缓存
  return liveNodes;
}


/**
 * 设置页面内容观察器，用于监控和重新排序动态加载的内容
 * @param {Object} options - 配置选项
 * @param {string} options.url - 目标页面的URL
 * @param {string} options.initialSelector - 初始元素选择器，用于识别页面中的内容项
 * @param {string} options.containerSelector - 容器选择器，指定包含内容项的父容器
 * @param {string} options.platform - 平台标识
 * @param {Function} options.getTitleForItem - 获取内容项标题的函数
 * @param {string} options.reorderKey - 重新排序的键值
 */
async function setupFeedObserver(options) {
  // 解构配置参数
  const {
    url,
    initialSelector, // 初始内容项选择器
    containerSelector, // 内容容器选择器
    platform,
    getTitleForItem,
    reorderKey,
  } = options;
  
  // 检查当前页面是否为目标页面
  if (this.window.location.href !== url) return;

  // 处理页面初始加载的内容项

  // 获取目标容器元素
  const targetNode = document.querySelector(containerSelector);
  if (!targetNode) return;

  // 对容器中的现有内容进行重新排序

  // 初始化待处理状态对象
  const reorderState = {
    nextBatchStart: 0, // 下一组的起始 originalOrder
    running: false,
    timer: null,
    loadMoreTimer: null,
  };

  let originalIndex = 0;

  const initialElements = document.querySelectorAll(initialSelector);
  initialElements.forEach((value) => {
    markOriginalOrder(value, originalIndex);
    processElement(value, platform);
    originalIndex += 1;
  });

  // 仅在第一组不足20条时由 tryReorderCurrentBatch 内部滚动，不再单独 checkAndLoad

  // 尝试对当前组进行重排（仅当该组卡片已凑满20条或已是最后一批时）
  const tryReorderCurrentBatch = () => {
    if (reorderState.timer || reorderState.running) return;
    reorderState.timer = setTimeout(async () => {
      reorderState.timer = null;
      if (reorderState.running) return;
      reorderState.running = true;

      const batchStart = reorderState.nextBatchStart;
      const batchEnd = batchStart + 20;

      // 第一组: 不再主动滚动，等用户手动滚动加载
      // if (batchStart === 0) { ... }

      // 收集当前组卡片
      const allNodes = Array.from(targetNode.querySelectorAll(initialSelector));
      const batch = allNodes.filter((node) => {
        const order = Number(node.dataset.originalOrder);
        return Number.isFinite(order) && order >= batchStart && order < batchEnd;
      });

      if (batch.length >= 20) {
        await reorderNewNodes({
          container: targetNode,
          platform: platform,
          getTitleForItem: getTitleForItem,
        }, batch);
        reorderState.nextBatchStart += 20;
        console.log("[MPB] 第", Math.floor(batchStart / 20) + 1, "组重排完成, 20条");
      }

      reorderState.running = false;
    }, 300);
  };

  tryReorderCurrentBatch();

  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (addedNode) {
        if (addedNode?.matches?.(initialSelector)) {
          if (addedNode.dataset.mpbInserted === "1" || addedNode.dataset.originalOrder) return;
          markOriginalOrder(addedNode, originalIndex);
          processElement(addedNode, platform);
          originalIndex += 1;
        }
      });
    });

    // 检查当前组是否凑满20条，凑满则触发重排
    const allNodes = Array.from(targetNode.querySelectorAll(initialSelector));
    const batchStart = reorderState.nextBatchStart;
    const batchEnd = batchStart + 20;
    const batchCount = allNodes.filter((node) => {
      const order = Number(node.dataset.originalOrder);
      return Number.isFinite(order) && order >= batchStart && order < batchEnd;
    }).length;
    if (batchCount >= 20) {
      tryReorderCurrentBatch();
    }
  });

  const config = { childList: true, subtree: false };
  observer.observe(targetNode, config); // 开始观察目标容器
}


function getZhihuTitleFromCard(node) {
  return node.querySelector(".ContentItem-title")?.innerText;
}

function getBilibiliTitleFromCard(node) {
  return node.querySelector(".bili-video-card__info--tit")?.getAttribute("title");
}

function getToutiaoTitleFromCard(node) {
  const a =
    node.querySelector(".feed-card-article a[aria-label]") ||
    node.querySelector(".feed-card-article a") ||
    node.querySelector("a[aria-label]") ||
    node.querySelector("a");
  return a ? (a.getAttribute("aria-label") || a.innerText.trim()) : "";
}

function markOriginalOrder(node, orderIndex) {
  if (!node || node.dataset.originalOrder) return;
  node.dataset.originalOrder = String(orderIndex);
  if (!node.querySelector(".mpb-original-order")) {
    const badge = document.createElement("span");
    badge.className = "mpb-original-order";
    badge.textContent = `原序: ${orderIndex + 1}`;
    badge.style.cssText =
      "display:inline-block;margin-right:6px;padding:2px 6px;border-radius:10px;" +
      "background:#ffe9b3;color:#5b3a00;font-size:12px;line-height:16px;";
    node.prepend(badge);
  }
}

window.addEventListener('load', function () {
  const feedConfigs = [
    {
      url: "https://www.zhihu.com/",
      initialSelector: ".Card.TopstoryItem.TopstoryItem-isRecommend",
      containerSelector: ".Topstory-recommend",//".css-1fsnuue",
      platform: 1,
      getTitleForItem: getZhihuTitleFromCard,
      reorderKey: "zhihu",
    },
    {
      url: "https://www.bilibili.com/",
      initialSelector: ".feed-card",
      containerSelector: ".recommended-container_floor-aside",
      platform: 2,
      getTitleForItem: getBilibiliTitleFromCard,
      reorderKey: "bilibili",
    },
    {
      url: "https://www.toutiao.com/",
      initialSelector: ".feed-card-wrapper.feed-card-article-wrapper",
      containerSelector: ".ttp-feed-module > div:not(.main-nav-wrapper)",
      platform: 0,
      getTitleForItem: getToutiaoTitleFromCard,
      reorderKey: "toutiao",
    },
  ];

  feedConfigs.forEach(setupFeedObserver);
});

/* 中文说明（内容脚本整体逻辑）
1) 基本配置
   - backendUrl：后端接口地址，收集 /browse 与 /click 事件。
   - userPid：用户标识，随事件上报。
   - getIsOpen：读取 chrome.storage.sync 中的 isOpen，决定是否过滤卡片与添加标记。

2) 点击事件上报
   - 知乎首页：监听 .css-1fsnuue 容器的点击，捕获推荐卡片标题或摘要，POST {pid, platform:0, title} 到 /click。
   - B站首页：监听 .recommended-container_floor-aside 的点击，捕获标题，POST {pid, platform:1, title} 到 /click。

3) processElement（处理单个卡片）
   - platform=0：抓取标题（.ContentItem-title）、摘要（.css-376mun）、链接（标题 a），POST /browse。
   - platform=1：抓取标题属性（.bili-video-card__info--tit），POST /browse。
   - /browse 返回 data.data===true 时移除元素；isOpen 为 true 时在标题处添加“处理完了”标签。

4) 推荐流初始化与新增监听
   - 页面加载后：
       * 知乎：处理现有 .Card.TopstoryItem.TopstoryItem-isRecommend，再用 MutationObserver 监听 .css-1fsnuue 的新增节点并处理。
       * B站：处理现有 .feed-card，再监听 .recommended-container_floor-aside 的新增节点。

5) 其他
   - platform：0=知乎，1=B站。
   - 所有上报直接使用 fetch，不依赖 web_accessible_resources。
*/
