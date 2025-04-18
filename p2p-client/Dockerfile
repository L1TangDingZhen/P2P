FROM node:16-alpine AS build

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

# 环境变量
ENV REACT_APP_API_URL=http://thezbr.com

# 构建应用
RUN npm run build

# 不需要启动容器，这个镜像只用于构建
CMD ["echo", "Build completed"]