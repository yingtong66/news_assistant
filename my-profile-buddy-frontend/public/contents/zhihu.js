const backendUrl = "http://localhost:8000" //客户端后端 (用户数据的处理分析)
// const userPid = "大梦想家豪哥" //用户的id
const userPid = "Hsyy04" //用户的id
// const userPid = "DST" //用户的id

/**
 * 异步获取Chrome扩展存储中的开关状态
 * 该函数用于检查内容过滤功能是否开启
 * @returns {Promise<boolean>} 返回一个Promise，解析为布尔值表示开关状态
 * @throws {Error} 如果Chrome运行时出现错误则抛出异常
 */
async function getIsOpen() {
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

  targetNode.addEventListener('click', async function (event) {
    const title = getTitle(event);
    if (!title) return;
    const jsonData = JSON.stringify({ pid: userPid, platform: platform, title: title});
    fetch(`${backendUrl}/click`, { method: 'POST', body: jsonData });
    console.log('click data:', jsonData);
  }, true);
}

/* 记录用户在推荐列表页的点击事件 */
window.addEventListener('load', function () {
  //知乎
  setupClickListener({
    host: "www.zhihu.com",
    containerSelector: ".Topstory-recommend", //".css-1fsnuue",
    platform: 0,
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
    platform: 1,
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
    platform: 2,
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

    let title = undefined
    let content = undefined
    let url = undefined

    if(platform === 0){ //知乎
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

    else if(platform ===1){ //B站
      const title_tag = element.querySelector(".bili-video-card__info--tit")
      title = title_tag.getAttribute("title")
    }

    else if(platform === 2){ //头条
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

    // 上下文过滤
    const isOpen = await getIsOpen();
    const jsonData = JSON.stringify({ pid: userPid, platform: platform, title: title, content: content, url: url, is_filter: isOpen});
    fetch(`${backendUrl}/browse`, { method: 'POST', body: jsonData })
        .then(response => response.json())
        .then(data => {
            if (data['data'] === true) {
                // element.style.backgroundColor = '#d3d3d3';
                element.remove(); 
                console.log("remove:"+title)
            }
            console.log("processing one:"+title)
            if(isOpen === true){
              var add_label_div = element.querySelector('.ContentItem-title').firstChild
              var label = document.createElement('label'); 
              label.classList.add("FEfUrdfMIKpQDJDqkjte")
              label.innerHTML = '处理完了';
              label.style.backgroundColor = 'rgb(146, 207, 191)';
              add_label_div.insertAdjacentElement('beforeend', label); 
            }
        });
}




/* 页面加载完成后，处理初始已存在的元素、处理新添加元素 */
function setupFeedObserver(options) {
  const {
    url,
    initialSelector, //具体内容的选择器
    containerSelector, //所有内容外侧大框的选择器
    platform,
    isMatch,
  } = options;
  if (this.window.location.href !== url) return;

  const initialElements = document.querySelectorAll(initialSelector);
  initialElements.forEach((value, key)=>processElement(value, platform));

  const targetNode = document.querySelector(containerSelector);
  if (!targetNode) return;

  const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (addedNode) {
              if (isMatch(addedNode)) {
                  processElement(addedNode, platform);
              }
          })
      });
  });
  const config = { childList: true, subtree: false };
  observer.observe(targetNode, config);
}

window.addEventListener('load', function () {
  setupFeedObserver({
    url: "https://www.zhihu.com/",
    initialSelector: ".Card.TopstoryItem.TopstoryItem-isRecommend",
    containerSelector: ".Topstory-recommend",//".css-1fsnuue",
    platform: 0,
    isMatch: (node) => node.className === "Card TopstoryItem TopstoryItem-isRecommend",
  });

  setupFeedObserver({
    url: "https://www.bilibili.com/",
    initialSelector: ".feed-card",
    containerSelector: ".recommended-container_floor-aside",
    platform: 1,
    isMatch: (node) => node.className === ".feed-card",
  });

  setupFeedObserver({
    url: "https://www.toutiao.com/",
    initialSelector: ".feed-card-wrapper.feed-card-article-wrapper",
    containerSelector: ".ttp-feed-module",
    platform: 2,
    isMatch: (node) => node.matches?.(".feed-card-wrapper.feed-card-article-wrapper"),
  });
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