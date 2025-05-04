/**
 * 获取API基础URL
 * 开发环境使用环境变量指定的URL
 * 生产环境使用当前页面的origin，但替换localhost为实际服务器IP
 */
export function getApiBaseUrl() {
    // 如果环境变量有值，使用它
    if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL;
    }
    
    // 获取当前主机名
    const currentHost = window.location.hostname;
    
    // 如果是通过IP地址访问，使用相同IP但换成后端端口
    if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
        // 获取当前协议和主机名，保留原始访问方式，只替换端口
        return `${window.location.protocol}//${currentHost}:5235`;
    }
    
    // 本地开发默认
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