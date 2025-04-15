const { createProxyMiddleware } = require('http-proxy-middleware');

// 用于开发模式下的API代理配置
module.exports = function(app) {
  // 获取API URL，默认为localhost:5235
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5235';

  // 设置代理规则
  app.use(
    '/api',
    createProxyMiddleware({
      target: apiUrl,
      changeOrigin: true,
      secure: false
    })
  );

  app.use(
    '/p2phub',
    createProxyMiddleware({
      target: apiUrl,
      changeOrigin: true,
      secure: false,
      ws: true // 支持WebSocket
    })
  );
};