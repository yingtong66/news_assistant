
const setItem = (k,v)=>{
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