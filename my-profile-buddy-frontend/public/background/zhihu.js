const backendUrl = "http://localhost:8000" //客户端后端 (用户数据的处理分析)

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.type === 'build_request_browse') {
        const jsonData = request.data;
        fetch(`${backendUrl}/browse`, { method: 'POST', body: jsonData })
        .then(response => response.json())
        .then(data => {
            console.log(data);
            sendResponse(data);
        })
        .catch((err) => {
            console.warn("browse request failed", err);
            sendResponse({ error: true, message: String(err) });
        });
        return true;
    }
    if (request.type === 'build_request_reorder') {
        const jsonData = request.data;
        fetch(`${backendUrl}/reorder`, { method: 'POST', body: jsonData })
        .then(response => response.json())
        .then(data => {
            sendResponse(data);
        })
        .catch((err) => {
            console.warn("reorder request failed", err);
            sendResponse({ error: true, message: String(err) });
        });
        return true;
    }
    if (request.type === "build_request_click") {
        const jsonData = request.data;
        fetch(`${backendUrl}/click`, { method: 'POST', body: jsonData });
        return;
    }
    if (request.url) {
        chrome.tabs.create({ url: request.url, active: false }, function (tab) {
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === tab.id && info.status === 'complete') {
                    chrome.tabs.remove(tabId);
                    chrome.tabs.onUpdated.removeListener(listener);
                }
            });
        });
    }
});

/* 中文说明
1) backendUrl：后端服务地址，接收浏览/点击数据并返回过滤结果。
2) 消息监听：
   - build_request_browse：内容脚本上传推荐流卡片数据，后台转发到 /browse，收到响应后通过 sendResponse 回传。
   - build_request_click：内容脚本上传点击事件，后台转发到 /click，无需回传。
   - request.url：静默打开指定 URL（新标签），加载完成后立即关闭，用于触发站点动作（如搜索）。
*/
