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

    // 每个加载的卡片都上报浏览记录
    if (title) {
      const jsonData = JSON.stringify({
        pid: userPid,
        platform: platform,
        title: title,
        content: content,
        url: url,
        is_filter: false,
      });
      chrome.runtime.sendMessage({ type: "build_request_browse", data: jsonData });
    }
}


async function requestReorder(platform, items, experiment) { //向后端请求重排
  try {
    const jsonData = JSON.stringify({ pid: userPid, platform: platform, items: items, experiment: !!experiment });
    const data = await sendBackgroundRequest("build_request_reorder", jsonData);
    return data?.data?.order || [];
  } catch (err) {
    console.warn("reorder request failed", err);
    return [];
  }
}

// 从后端获取重排配置参数(top_n)，实验模式时传 experiment=true
async function fetchReorderConfig(experiment) {
  try {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "get_reorder_config", experiment: !!experiment }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(resp?.data?.top_n || 20);
      });
    });
  } catch (err) {
    console.warn("[MPB] fetchReorderConfig failed, fallback to 20", err);
    return 20;
  }
}

// 读取实验模式开关
async function getExperimentMode() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("experimentMode", (result) => {
      resolve(!!result.experimentMode);
    });
  });
}

// 在页面上注入实验模式切换按钮
function injectExperimentButton() {
  if (document.getElementById("mpb-experiment-btn")) return;
  const btn = document.createElement("button");
  btn.id = "mpb-experiment-btn";
  btn.style.cssText =
    "position:fixed;top:10px;right:10px;z-index:99999;padding:6px 14px;" +
    "border:2px solid #1890ff;border-radius:6px;font-size:13px;cursor:pointer;" +
    "background:#fff;color:#1890ff;font-weight:bold;box-shadow:0 2px 8px rgba(0,0,0,0.15);";
  // 初始化按钮文字
  chrome.storage.sync.get("experimentMode", (result) => {
    const on = !!result.experimentMode;
    btn.textContent = on ? "实验模式: ON" : "实验模式: OFF";
    btn.style.background = on ? "#1890ff" : "#fff";
    btn.style.color = on ? "#fff" : "#1890ff";
  });
  btn.addEventListener("click", () => {
    chrome.storage.sync.get("experimentMode", (result) => {
      const newVal = !result.experimentMode;
      chrome.storage.sync.set({ experimentMode: newVal }, () => {
        btn.textContent = newVal ? "实验模式: ON" : "实验模式: OFF";
        btn.style.background = newVal ? "#1890ff" : "#fff";
        btn.style.color = newVal ? "#fff" : "#1890ff";
        console.log("[MPB] 实验模式切换为", newVal, "，刷新页面生效");
      });
    });
  });
  document.body.appendChild(btn);
}

// 注入实时状态徽章到页面左上角
function injectStatusBadge() {
  if (document.getElementById("mpb-status-badge")) return;
  const badge = document.createElement("div");
  badge.id = "mpb-status-badge";
  badge.style.cssText =
    "position:fixed;top:10px;left:10px;z-index:99999;padding:6px 14px;" +
    "border-radius:6px;font-size:13px;font-weight:bold;" +
    "background:#f0f0f0;color:#666;border:2px solid #d9d9d9;" +
    "box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:all 0.3s;";
  badge.textContent = "等待抓取中";
  document.body.appendChild(badge);
  return badge;
}

// 更新状态徽章文字和颜色
function updateStatusBadge(text, color) {
  const badge = document.getElementById("mpb-status-badge");
  if (!badge) return;
  badge.textContent = text;
  const colors = {
    gray: { bg: "#f0f0f0", fg: "#666", border: "#d9d9d9" },
    blue: { bg: "#e6f7ff", fg: "#1890ff", border: "#91d5ff" },
    orange: { bg: "#fff7e6", fg: "#fa8c16", border: "#ffd591" },
    green: { bg: "#f6ffed", fg: "#52c41a", border: "#b7eb8f" },
  };
  const c = colors[color] || colors.gray;
  badge.style.background = c.bg;
  badge.style.color = c.fg;
  badge.style.borderColor = c.border;
}

// 实验模式 AB 切换: 在原始前10和重排后10之间切换展示
function injectABToggle(container, insertPos, originalNodes, rerankedNodes) {
  if (document.getElementById("mpb-ab-toggle")) return;

  // 当前展示状态: "reranked" 或 "original"
  let currentView = "reranked";

  const btn = document.createElement("button");
  btn.id = "mpb-ab-toggle";
  btn.style.cssText =
    "position:fixed;top:46px;right:10px;z-index:99999;padding:6px 14px;" +
    "border:2px solid #722ed1;border-radius:6px;font-size:13px;cursor:pointer;" +
    "background:#f9f0ff;color:#722ed1;font-weight:bold;box-shadow:0 2px 8px rgba(0,0,0,0.15);";
  btn.textContent = "版本B (点击切换)";

  // 执行切换: 移除当前展示的节点，插入另一组
  const doSwitch = (toView) => {
    const showNodes = toView === "original" ? originalNodes : rerankedNodes;
    const hideNodes = toView === "original" ? rerankedNodes : originalNodes;

    // 隐藏当前组
    hideNodes.forEach(n => {
      if (n.parentNode) n.parentNode.removeChild(n);
    });

    // 插入目标组
    let idx = insertPos;
    showNodes.forEach(n => {
      const ref = container.children[idx] || null;
      container.insertBefore(n, ref);
      idx++;
    });

    currentView = toView;
    if (toView === "original") {
      btn.textContent = "版本A (点击切换)";
      btn.style.background = "#fff7e6";
      btn.style.color = "#fa8c16";
      btn.style.borderColor = "#fa8c16";
    } else {
      btn.textContent = "版本B (点击切换)";
      btn.style.background = "#f9f0ff";
      btn.style.color = "#722ed1";
      btn.style.borderColor = "#722ed1";
    }
  };

  btn.addEventListener("click", () => {
    doSwitch(currentView === "reranked" ? "original" : "reranked");
  });

  document.body.appendChild(btn);
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
  }, 0);
}

async function reorderNewNodes(options, nodes) { //两阶段重排: 过滤 -> 重排, 实时更新状态徽章
  const { container, platform, getTitleForItem, getMetaForItem, experiment } = options;
  // 容器不存在时直接返回空列表
  if (!container) return [];

  // 读取插件开关，未开启则保持原顺序并返回
  const isOpen = await getIsOpen();
  if (!isOpen) return nodes;

  // 过滤出仍然存在于容器中的节点，避免对已被移除的卡片重排
  const liveNodes = nodes.filter((node) => container.contains(node));

  // 构造发送给后端的 items 列表（id 用索引表示，title/source/time 用于后端计算）
  const items = liveNodes.map((node, index) => {
    const meta = getMetaForItem ? getMetaForItem(node) : {};
    return {
      id: String(index + 1),
      title: getTitleForItem(node) || "",
      source: meta.source || "",
      time: meta.time || "",
    };
  });

  // 阶段1: 过滤
  updateStatusBadge("正在过滤 " + items.length + " 条...", "orange");
  let filteredItems = items;
  let removedList = [];
  try {
    const filterData = await sendBackgroundRequest("reorder_filter", JSON.stringify({
      pid: userPid, platform: platform, items: items,
    }));
    if (filterData?.data) {
      filteredItems = filterData.data.filtered_items || items;
      removedList = filterData.data.removed_list || [];
    }
  } catch (err) {
    console.warn("[MPB] reorder_filter failed, skip filtering", err);
  }
  updateStatusBadge("已过滤, 移除 " + removedList.length + " 条", "blue");

  // 阶段2: 重排
  updateStatusBadge("正在重排 " + filteredItems.length + " 条...", "orange");
  let order = [];
  try {
    const rerankData = await sendBackgroundRequest("reorder_rerank", JSON.stringify({
      pid: userPid, platform: platform, items: filteredItems,
      original_items: items,
      removed_list: removedList, experiment: !!experiment,
    }));
    order = rerankData?.data?.order || [];
  } catch (err) {
    console.warn("[MPB] reorder_rerank failed", err);
  }

  if (!order || order.length === 0) {
    updateStatusBadge("重排失败, 保持原序", "gray");
    return liveNodes;
  }

  updateStatusBadge("重排完成, 展示 " + order.length + " 条", "green");

  // 建立 id 到节点的映射，方便按新顺序取回节点
  const idToNode = {};
  liveNodes.forEach((node, index) => {
    idToNode[String(index + 1)] = node;
  });

  // 实验模式: 保存原始前10节点的克隆，用于 AB 切换
  const SHOW_N = experiment ? 10 : 0;
  let originalTopNodes = [];
  if (experiment && SHOW_N > 0) {
    originalTopNodes = liveNodes.slice(0, SHOW_N).map(n => n.cloneNode(true));
    // 给克隆节点加标记，避免被 observer 重复处理
    originalTopNodes.forEach(n => { n.dataset.mpbOriginalClone = "1"; });
  }

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

  // 实验模式: 注入 AB 切换按钮
  if (experiment && keptNodes.length > 0 && originalTopNodes.length > 0) {
    const rerankedNodes = keptNodes.slice(); // 重排后展示的节点
    injectABToggle(container, firstPos, originalTopNodes, rerankedNodes);
  }
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
  // 删除右下角浮动工具栏（刷新/反馈/下载）
  document.querySelectorAll('.ttp-toolbar').forEach(el => el.remove());
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
    getMetaForItem,
    reorderKey,
  } = options;

  // 检查当前页面是否为目标页面（支持正则和字符串）
  const currentHref = this.window.location.href;
  const urlMatched = (url instanceof RegExp) ? url.test(currentHref) : (currentHref === url);
  if (!urlMatched) return;

  // 获取目标容器元素
  const targetNode = document.querySelector(containerSelector);
  if (!targetNode) return;

  // 注入实验模式按钮和状态徽章
  injectExperimentButton();
  injectStatusBadge();

  // 读取实验模式状态
  const experiment = await getExperimentMode();
  // 从后端拿重排条数配置(实验模式时 top_n=50)
  const TOP_N = await fetchReorderConfig(experiment);
  console.log("[MPB] 重排配置: TOP_N=" + TOP_N + ", experiment=" + experiment);

  updateStatusBadge("等待抓取中", "gray");

  let originalIndex = 0;
  let reorderDone = false; // 只重排一次

  // 等待页面至少出现 1 个目标元素（SPA 异步渲染可能延迟）
  const MAX_WAIT_ROUNDS = 20;
  for (let w = 0; w < MAX_WAIT_ROUNDS; w++) {
    if (document.querySelectorAll(initialSelector).length > 0) break;
    console.log("[MPB] 等待页面渲染, 第" + (w + 1) + "轮");
    updateStatusBadge("等待页面加载...", "gray");
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 标记已有元素
  const initialElements = document.querySelectorAll(initialSelector);
  initialElements.forEach((value) => {
    markOriginalOrder(value, originalIndex, experiment);
    processElement(value, platform);
    originalIndex += 1;
  });

  // 头条平台：初始加载时立即清理非图文元素
  if (platform === 0) cleanToutiaoNonArticles();

  updateStatusBadge("已抓取 " + originalIndex + "/" + TOP_N + " 条", "blue");

  // 检查当前条目数是否够 TOP_N，够则触发重排
  const checkAndReorder = async () => {
    if (reorderDone) return;
    const allNodes = Array.from(targetNode.querySelectorAll(initialSelector));
    if (allNodes.length >= TOP_N) {
      reorderDone = true;
      const batch = allNodes.slice(0, TOP_N);
      // 实验模式: 隐藏 TOP_N 之后的多余节点
      if (experiment) {
        allNodes.slice(TOP_N).forEach(function(node) {
          node.style.display = "none";
        });
      }
      updateStatusBadge("已抓取 " + batch.length + " 条, 开始处理", "blue");
      await reorderNewNodes({
        container: targetNode,
        platform: platform,
        getTitleForItem: getTitleForItem,
        getMetaForItem: getMetaForItem,
        experiment: experiment,
      }, batch);
      if (platform === 0) cleanToutiaoNonArticles();
    }
  };

  // 自动滚动收集条目，持续滚动直到收集够 TOP_N 条图文
  const MAX_SCROLL_TIMES = 10; // 滚动次数上限
  const autoScrollAndCollect = async () => {
    let scrollCount = 0;
    while (scrollCount < MAX_SCROLL_TIMES) {
      const currentCount = targetNode.querySelectorAll(initialSelector).length;
      if (currentCount >= TOP_N) {
        console.log("[MPB] 已有 " + currentCount + " 条, 满足 TOP_N=" + TOP_N);
        break;
      }
      scrollCount++;
      updateStatusBadge("抓取中 " + currentCount + "/" + TOP_N + " (第" + scrollCount + "次滚动)", "blue");
      console.log("[MPB] 第 " + scrollCount + " 次自动滚动, 当前 " + currentCount + " 条");
      simulateSilentScrollToBottom();
      // 等待新条目加载
      await new Promise(resolve => setTimeout(resolve, 1200));
      // 标记新出现的元素
      const newElements = targetNode.querySelectorAll(initialSelector);
      newElements.forEach((el) => {
        if (!el.dataset.originalOrder) {
          markOriginalOrder(el, originalIndex, experiment);
          processElement(el, platform);
          originalIndex += 1;
        }
      });
      if (platform === 0) cleanToutiaoNonArticles();
    }
    // 滚动结束后检查并重排
    await checkAndReorder();
    // 如果滚动完仍不够 TOP_N，用已有的条目重排
    if (!reorderDone) {
      reorderDone = true;
      const allNodes = Array.from(targetNode.querySelectorAll(initialSelector));
      if (allNodes.length > 0) {
        updateStatusBadge("已抓取 " + allNodes.length + " 条(不足" + TOP_N + "), 开始处理", "blue");
        console.log("[MPB] 滚动结束仅 " + allNodes.length + " 条, 用已有条目重排");
        await reorderNewNodes({
          container: targetNode,
          platform: platform,
          getTitleForItem: getTitleForItem,
          getMetaForItem: getMetaForItem,
          experiment: experiment,
        }, allNodes);
        if (platform === 0) cleanToutiaoNonArticles();
      }
    }
  };

  // MutationObserver 只负责标记新节点，不再触发重排
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
          // 实验模式下重排已完成, 隐藏后续新加载的节点
          if (experiment && reorderDone) {
            addedNode.style.display = "none";
          }
          markOriginalOrder(addedNode, originalIndex, experiment);
          processElement(addedNode, platform);
          originalIndex += 1;
        }
      });
    });
  });

  const config = { childList: true, subtree: false };
  observer.observe(targetNode, config);

  // 启动自动滚动收集
  await autoScrollAndCollect();
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

// 从头条卡片中提取来源账号和发布时间
function getToutiaoMetaFromCard(node) {
  const authorEl = node.querySelector(".feed-card-footer-cmp-author a");
  const timeEl = node.querySelector(".feed-card-footer-time-cmp");
  return {
    source: authorEl ? authorEl.innerText.trim() : "",
    time: timeEl ? timeEl.innerText.trim() : "",
  };
}

function markOriginalOrder(node, orderIndex, experiment) {
  if (!node || node.dataset.originalOrder) return;
  node.dataset.originalOrder = String(orderIndex);
  if (!experiment && !node.querySelector(".mpb-original-order")) {
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
      url: /^https?:\/\/www\.toutiao\.com\//,
      initialSelector: ".feed-card-wrapper.feed-card-article-wrapper",
      containerSelector: ".ttp-feed-module > div:not(.main-nav-wrapper)",
      platform: 0,
      getTitleForItem: getToutiaoTitleFromCard,
      getMetaForItem: getToutiaoMetaFromCard,
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
