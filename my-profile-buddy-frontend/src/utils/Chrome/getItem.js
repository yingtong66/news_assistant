async function getItem(key, defaultValue = false){
    console.log(key);
    // 非插件环境降级到 localStorage
    if (typeof chrome === 'undefined' || !chrome.storage) {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : defaultValue;
    }
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(key, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError));
        } else {
          console.log(result);
          if (result[key] === undefined) {
            resolve(defaultValue);
          } else {
            resolve(result[key]);
          }
        }
      });
    });
  }


export{getItem};



/**
 * 从Chrome扩展的同步存储(sync storage)中异步获取指定键的值
 * 这是一个Promise封装的Chrome存储API工具函数
 * 
 * @async
 * @function getItem
 * @param {string} key - 要获取的存储键名
 * @param {*} [defaultValue=false] - 当键不存在时返回的默认值，默认为false
 * @returns {Promise<*>} 返回一个Promise，解析为存储的值或默认值
 * @throws {Error} 当Chrome存储API出现错误时抛出错误
 * 
 * @example
 * // 获取用户设置
 * try {
 *   const userSettings = await getItem('userSettings', { theme: 'light' });
 *   console.log(userSettings);
 * } catch (error) {
 *   console.error('获取存储失败:', error);
 * }
 */
// async function getItem(key, defaultValue = false){
//     // 调试日志：输出要获取的键名
//     console.log(key);
    
//     // 返回Promise对象，将回调式API转换为Promise形式
//     return new Promise((resolve, reject) => {
//       // 调用Chrome扩展的同步存储API获取数据
//       chrome.storage.sync.get(key, (result) => {
//         // 检查Chrome API是否出现错误
//         if (chrome.runtime.lastError) {
//           // 如果有错误，拒绝Promise并传递错误信息
//           reject(new Error(chrome.runtime.lastError));
//         } else {
//           // 调试日志：输出获取到的结果
//           console.log(result);
          
//           // 检查请求的键是否存在于结果中
//           if (result[key] === undefined) {
//             // 如果键不存在，返回默认值
//             resolve(defaultValue);
//           } else {
//             // 如果键存在，返回存储的值
//             resolve(result[key]);
//           }
//         }
//       });
//     });
//   }

// // 导出函数供其他模块使用
// export{getItem};
