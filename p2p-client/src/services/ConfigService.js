/**
 * 获取API基础URL
 * 开发环境使用环境变量指定的URL
 * 生产环境使用当前页面的origin
 */
export function getApiBaseUrl() {
    // 如果环境变量有值，使用它
    if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL;
    }
    
    // 否则使用当前页面的origin
    return window.location.origin;
}