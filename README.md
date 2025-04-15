# P2P File Transfer

一个端对端的文件传输应用，允许同一账户下的设备之间轻松传输文件和文本。

## 项目结构

- **P2P/**：ASP.NET Core 后端
  - **Controllers/**：API 控制器
  - **Models/**：数据模型
  - **Services/**：业务逻辑
  - **Hubs/**：SignalR 实时通信

- **p2p-client/**：React 前端
  - **src/components/**：UI组件
  - **src/pages/**：页面
  - **src/services/**：服务层

## 功能

- 邀请码登录系统
- 每个账户最多2个设备同时在线
- 同一账户下设备间实时文本消息传输
- 同一账户下设备间文件传输
- 设备在线状态监控

## 本地运行

### 后端 (ASP.NET Core)

```bash
cd P2P
dotnet run
```

后端将运行在 http://localhost:5235

### 前端 (React)

```bash
cd p2p-client
npm install
npm start
```

前端将运行在 http://localhost:3000

## Docker部署

项目提供了Docker支持，可以使用以下命令启动：

```bash
# 在项目根目录下
docker-compose up -d
```

Docker部署后的访问地址：
- 前端：http://localhost:3000
- 后端：http://localhost:5235

## 网络访问配置

如果需要从其他设备访问该应用（如通过热点共享），有以下两种方法：

### 1. 本地开发模式

修改`docker-compose.yml`中的`ALLOWED_ORIGINS`环境变量，添加允许访问的源地址：

```yaml
environment:
  - ALLOWED_ORIGINS=http://localhost:3000,http://192.168.0.X:3000
```

其中`192.168.0.X`替换为你的本地IP地址。

### 2. 生产部署

在生产环境中，建议使用反向代理（如Nginx）来处理CORS和安全问题。

## 使用方法

1. 在一个设备上生成邀请码
2. 使用该邀请码在另一个设备上登录
3. 在登录设备之间传输文本消息和文件

## 技术栈

- **后端**：ASP.NET Core，SignalR
- **前端**：React，Bootstrap，SignalR 客户端
- **部署**：Docker，Docker Compose，Nginx

## 故障排除

如果遇到连接问题：

1. 确保后端服务正在运行
2. 查看浏览器控制台是否有错误消息
3. 检查`/api/connectionstatus/health`确认服务状态
4. 如果遇到"最大设备数"错误，请访问`/api/device/clear/{邀请码}`清除设备
5. 对于跨域(CORS)错误，确保已在后端配置允许访问的源地址

详细的故障排除指南请参考`debug.md`文件。