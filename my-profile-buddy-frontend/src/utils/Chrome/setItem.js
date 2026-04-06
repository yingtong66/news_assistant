
const setItem = (k,v)=>{
    // 非插件环境降级到 localStorage
    if (typeof chrome === 'undefined' || !chrome.storage) {
        localStorage.setItem(k, JSON.stringify(v));
        return Promise.resolve(true);
    }
    return new Promise((resolve, reject) => {
        chrome.storage.sync.set({[k]: v}, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError));
            } else {
                resolve(true);
            }
        });
    });
}

export {setItem};