FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
USER app
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["P2P/P2P.csproj", "P2P/"]
RUN dotnet restore "P2P/P2P.csproj"
COPY . .
WORKDIR "/src/P2P"
RUN dotnet build "P2P.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "P2P.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .

# 添加CORS环境变量，可以在运行容器时覆盖
ENV ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080

# 默认使用非开发环境
ENV ASPNETCORE_ENVIRONMENT=Production

# 设置网络
ENV ASPNETCORE_URLS=http://+:8080

# 入口点
ENTRYPOINT ["dotnet", "P2P.dll"]