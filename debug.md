# 调试指南

## 多设备访问指南

要从其他设备通过网络访问应用，需要进行以下配置：

### 1. 检查本地IP地址

在主机上运行以下命令查看IP地址：

```bash
# Windows
ipconfig

# Linux/macOS
ifconfig
```

记下你的IP地址，例如`192.168.0.100`

### 2. 配置CORS设置

如果使用Docker部署，在`docker-compose.yml`中设置CORS允许的源：

```yaml
environment:
  - ALLOWED_ORIGINS=http://localhost:3000,http://192.168.0.100:3000
```

如果是直接运行后端，修改`Program.cs`中的CORS配置，添加你的IP地址。

### 3. 修改前端API访问

创建或修改`.env.local`文件（在p2p-client目录下）：

```
REACT_APP_API_URL=http://192.168.0.100:5235
```

### 4. 网络访问说明

- 主机上的React应用：http://localhost:3000
- 其他设备访问：http://192.168.0.100:3000

### 5. 热点分享注意事项

- 确保设备在同一网络
- 禁用防火墙或添加例外规则
- 检查热点IP可能与预期不同

### 6. 解决CORS问题的其他方法

当在不同设备上访问应用时，可能会遇到CORS（跨源资源共享）问题。以下是几种解决方案：

1. **使用开发代理**：
   - 在`setupProxy.js`文件中已配置了开发代理
   - 这将自动处理前端与后端之间的请求转发

2. **浏览器扩展**：
   - 在Chrome上安装"CORS Unblock"或"Allow CORS"扩展
   - 这些扩展可以临时禁用浏览器的同源策略

3. **使用CORS桥接页面**：
   - 项目中包含了`cors_bridge.html`文件
   - 可以将此文件放在同源服务器上作为中转

4. **使用反向代理服务器**：
   - 设置Nginx作为反向代理
   - 将前端和后端服务放在同一域名下，避免CORS问题

## CSP问题解决方案

如果遇到内容安全策略(CSP)错误，浏览器可能会阻止连接。目前已在前端index.html中添加了必要的CSP头部。如果仍然遇到问题，请尝试：

1. 在Chrome中：
   - 地址栏输入 `chrome://flags/#block-insecure-private-network-requests`
   - 将此选项设为Disabled
   - 重启浏览器

2. 确认前端index.html中的CSP设置允许localhost连接：
   ```html
   <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' http://localhost:5235 ws://localhost:5235;">
   ```

如果尝试后仍有问题，可以考虑src/alternatives.js中的备用方案。

如果遇到问题，请按照以下步骤进行调试：

## 前端连接问题

1. 在开发工具控制台中检查错误
2. 确保后端正常运行
3. 确保CORS配置正确

## 最大设备数问题

如果收到"Maximum number of devices already connected to this account"错误，可以通过以下API清除设备：

```
http://localhost:5235/api/device/clear/{你的邀请码}
```

## 常见问题解决

### SignalR连接失败

确保：
1. 浏览器控制台中查看错误
2. 后端CORS配置正确
3. SignalR连接使用了正确的URL

### 无法生成邀请码

检查：
1. API调用是否正确
2. 后端服务是否正在运行
3. 查看后端控制台日志

### 设备离线问题

如果设备显示为离线：
1. 检查SignalR连接状态
2. 尝试重新登录
3. 使用清除设备API后重试

## 日志记录

要启用详细日志记录，在前端控制台查看网络请求和响应。