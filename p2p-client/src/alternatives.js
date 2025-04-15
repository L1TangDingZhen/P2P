/**
 * 如果您无法使用WebSocket，这里提供一个备用的轮询方式实现
 * 
 * 使用方法：
 * 1. 将SignalRService.js修改为使用轮询方式
 * 2. 修改后端P2PHub.cs支持轮询
 */

// 替代方案 1: 使用长轮询而非WebSocket
const usePollingConfig = () => {
  // 在SignalRService.js中:
  this.connection = new signalR.HubConnectionBuilder()
    .withUrl('http://localhost:5235/p2phub', {
      skipNegotiation: false,
      transport: signalR.HttpTransportType.LongPolling
    })
    .withAutomaticReconnect()
    .build();
};

// 替代方案 2: 尝试在单独的浏览器标签页打开
const openInNewTab = () => {
  window.open('http://localhost:3000', '_blank');
};

// 替代方案 3: 如果完全无法使用SignalR，可以使用API轮询
const createPollingFallback = () => {
  // 需要在后端创建相应的API
  const pollMessages = () => {
    fetch('http://localhost:5235/api/messages/poll')
      .then(r => r.json())
      .then(messages => {
        // 处理消息
      });
  };
  
  // 每2秒轮询一次
  setInterval(pollMessages, 2000);
};

export { usePollingConfig, openInNewTab, createPollingFallback };