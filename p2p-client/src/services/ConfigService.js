/**
 * 获取API基础URL
 * 开发环境使用环境变量指定的URL
 * 生产环境使用当前页面的origin，但替换localhost为实际服务器IP
 */
export function getApiBaseUrl() {
    // 显式设置了环境变量（包括空字符串=用相对路径走 nginx 反代）
    if (process.env.REACT_APP_API_URL !== undefined) {
        return process.env.REACT_APP_API_URL;
    }

    // 未设置时的本地开发回退
    const currentHost = window.location.hostname;
    if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
        return `${window.location.protocol}//${currentHost}:5235`;
    }
    return 'http://localhost:5235';
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