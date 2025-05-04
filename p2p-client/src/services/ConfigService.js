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

/**
 * 获取API路径前缀
 * 从环境变量中获取，默认为/api
 */
export function getApiPath() {
    return process.env.REACT_APP_API_PATH || '/api';
}

/**
 * 构建完整的API路径
 * @param {string} endpoint - 不包含前缀的API端点，例如 "invitation/generate"
 * @returns {string} 完整的API URL
 */
export function buildApiUrl(endpoint) {
    const baseUrl = getApiBaseUrl();
    const apiPath = getApiPath();
    
    // 确保endpoint不以/开头
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    
    return `${baseUrl}${apiPath}/${cleanEndpoint}`;
}