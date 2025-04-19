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

## Amazon Linux 部署说明

### 准备工作

1. 确保服务器已安装 Docker 和 Docker Compose
```bash
sudo yum update -y
sudo yum install -y docker
sudo service docker start
sudo usermod -a -G docker ec2-user
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 部署步骤

1. 克隆仓库
```bash
git clone <仓库地址>
cd P2P
```

2. 前端构建
```bash
# 进入前端目录
cd p2p-client

# 修改环境变量
echo "REACT_APP_API_URL=http://你的域名" > .env.production

# 构建前端
docker build -t p2p-frontend-builder .
docker run --rm -v $(pwd):/app -w /app p2p-frontend-builder npm run build

# 回到项目根目录
cd ..
```

3. 启动服务
```bash
docker-compose up -d
```

4. 检查服务状态
```bash
docker-compose ps
```

## 配置说明

### docker-compose.yml
- 后端使用构建镜像方式部署
- 前端使用静态文件挂载方式部署
- Nginx 用于反向代理

### 自定义域名
1. 修改 nginx/nginx.conf 中的 server_name
2. 更新前端和后端环境变量中的域名
3. 修改 docker-compose.yml 中的 ALLOWED_ORIGINS 环境变量

### 故障排查
- 检查日志: `docker-compose logs -f`
- 检查网络: `docker network inspect p2p-network`
- 检查容器: `docker-compose ps`

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





  1. 首先生成了一个邀请码：
    - "Generated new invitation code: GRO4UL2G for user: 6fdb03f6-df62-43ae-8887-54f8a66811f6"
    - 这表示系统为用户ID 6fdb...创建了邀请码GRO4UL2G
  2. 然后有设备用这个邀请码进行认证：
    - "Authentication attempt with code: GRO4UL2G"
    - "Authentication successful for user: 6fdb..., new device: e25d7..."
    - 表示一个设备使用邀请码成功连接，系统为其分配了设备ID e25d...
  3. 设备连接到SignalR Hub：
    - "Device e25d... is now connected with connection ID HblPbkwv7QwhBtqbP7FM7w"
    - 表示设备通过SignalR连接成功，获得连接ID
  4. 系统广播设备在线状态：
    - "Notifying all devices... that device e25d... is now online"
    - "Sending 1 online devices to user 6fdb..."
    - 告知用户群组中的设备有新设备上线
  5. 设备请求获取在线设备列表：
    - "GetOnlineDevices requested by connection..."
    - 表示设备主动请求获取当前在线设备列表
  6. 后面可以看到设备重新连接（可能是刷新页面）：
    - "Device e25d... is now connected with connection ID fvbfHEMu..."
    - 相同设备ID但连接ID变化，表示重新建立了连接

  这显示了用户账户创建、设备认证和在线状态通知的完整流程。