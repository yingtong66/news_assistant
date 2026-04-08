const backendUrl = "http://localhost:8000" //客户端后端 (用户数据的处理分析)
let userPid = ""; // 从 chrome.storage 异步加载
chrome.storage.sync.get("userPid", (result) => {
  userPid = result.userPid || "";
});
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

    // 浏览记录由 /reorder 后端批量写入，此处不单独请求
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

  // 请求后端返回新的顺序（被过滤的条目不在 order 中）
  const order = await requestReorder(platform, items);
  if (!order || order.length === 0) return liveNodes;

  // 建立 id 到节点的映射，方便按新顺序取回节点
  const idToNode = {};
  liveNodes.forEach((node, index) => {
    idToNode[String(index + 1)] = node;
  });

  // 区分保留和被过滤的节点
  const orderSet = new Set(order.map(String));
  const removedNodes = liveNodes.filter((_, index) => !orderSet.has(String(index + 1)));

  // 找到这批节点在容器中的最小位置作为插入起点
  const firstPos = Math.min(
    ...liveNodes.map(n => Array.prototype.indexOf.call(container.children, n)).filter(i => i >= 0)
  );

  // 移除所有参与的节点
  liveNodes.forEach((node) => {
    if (node.parentNode) node.parentNode.removeChild(node);
  });

  // 被过滤的节点隐藏
  removedNodes.forEach((node) => {
    node.style.display = "none";
    container.appendChild(node);
  });

  // 按后端顺序从 firstPos 位置开始依次插入保留的节点
  let insertIdx = firstPos;
  order.forEach((id) => {
    const node = idToNode[String(id)];
    if (!node) return;
    node.dataset.mpbInserted = "1";
    const refNode = container.children[insertIdx] || null;
    container.insertBefore(node, refNode);
    insertIdx++;
  });

  const keptNodes = order.map(id => idToNode[String(id)]).filter(Boolean);
  return keptNodes;
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
// 清理头条页面中非图文类元素（banner、导航、安全课堂、右侧栏、视频等）
function cleanToutiaoNonArticles() {
  // 删除右侧栏整体（热搜榜、安全课堂、热门视频等）
  document.querySelectorAll('.right-container').forEach(el => el.remove());
  // 删除顶部要闻 banner
  document.querySelectorAll('.home-banner-wrapper').forEach(el => el.remove());
  // 删除顶部导航栏（关注/推荐/视频/...）
  document.querySelectorAll('.main-nav-wrapper').forEach(el => el.remove());
  // 删除五条推荐区块
  document.querySelectorAll('.feed-five-wrapper').forEach(el => el.remove());
  // 删除固定顶栏
  document.querySelectorAll('.fix-header').forEach(el => el.remove());
  // 删除顶部搜索/header 区域
  document.querySelectorAll('.header-right').forEach(el => el.remove());
  document.querySelectorAll('.search-container').forEach(el => el.remove());
  // 删除顶部整行（下载头条APP、添加到桌面、关于头条、反馈、侵权投诉）
  document.querySelectorAll('.toutiao-header .header-left').forEach(el => el.remove());
  // 删除视频类卡片（小视频）
  document.querySelectorAll('.feed-card-video-wrapper').forEach(el => el.remove());
  // 删除微头条/动态类卡片
  document.querySelectorAll('.feed-card-wtt-wrapper').forEach(el => el.remove());
  // 兜底：删除所有非图文的 feed-card-wrapper
  document.querySelectorAll('.feed-card-wrapper:not(.feed-card-article-wrapper)').forEach(el => el.remove());
  // 右侧栏删除后，让列表居中
  const style = document.getElementById('mpb-center-style');
  if (!style) {
    const s = document.createElement('style');
    s.id = 'mpb-center-style';
    s.textContent = '.main-content { display: flex; justify-content: center; } .left-container { margin: 0 auto; }';
    document.head.appendChild(s);
  }
}

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
        // 头条平台：重排后清理非图文元素
        if (platform === 0) cleanToutiaoNonArticles();
      }

      reorderState.running = false;
    }, 300);
  };

  tryReorderCurrentBatch();

  // 头条平台：初始加载时立即清理非图文元素
  if (platform === 0) cleanToutiaoNonArticles();

  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (addedNode) {
        if (!addedNode?.matches) return;
        // 头条平台：新插入的非图文卡片直接删除
        if (platform === 0 && addedNode.matches('.feed-card-wrapper:not(.feed-card-article-wrapper)')) {
          addedNode.remove();
          return;
        }
        if (addedNode.matches(initialSelector)) {
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
