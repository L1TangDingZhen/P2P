using P2P.Hubs;
using P2P.Services;
using P2P.Models;
using P2P.Extensions; // 添加扩展方法命名空间

namespace P2P
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // 仅开发环境监听所有网卡（方便局域网真机调试）；生产环境由 ASPNETCORE_URLS 环境变量控制
            if (builder.Environment.IsDevelopment())
            {
                builder.WebHost.ConfigureKestrel(serverOptions =>
                {
                    serverOptions.ListenAnyIP(5235);
                });
            }
            // Add services to the container.
            builder.Services.AddSingleton<UserService>();
            
            // 添加邀请码过期后台服务
            builder.Services.AddHostedService<InvitationExpirationService>();
            
            // CORS白名单：从环境变量 ALLOWED_ORIGINS 读取（逗号分隔），未设置时回退到本地开发地址
            var allowedOrigins = (Environment.GetEnvironmentVariable("ALLOWED_ORIGINS")
                    ?? "http://localhost:3000,http://localhost:8080")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            builder.Services.AddCors(options => {
                options.AddPolicy("CorsPolicy", policy =>
                    policy.WithOrigins(allowedOrigins)
                          .AllowAnyMethod()
                          .AllowAnyHeader()
                          .AllowCredentials() // 允许凭据
                          .WithExposedHeaders("X-Requested-With") // 暴露必要的头信息
                          .SetPreflightMaxAge(TimeSpan.FromSeconds(3600))); // 缓存预检请求结果1小时
            });
            
            // Add SignalR for real-time communication
            builder.Services.AddSignalR(options =>
            {
                options.MaximumReceiveMessageSize = 10 * 1024 * 1024; // 10 MB for file transfers
                options.EnableDetailedErrors = true; // 启用详细错误信息
            });

            builder.Services.AddControllers();
            // Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen();

            var app = builder.Build();

            // Configure the HTTP request pipeline.
            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
            }

            // 开发环境下禁用HTTPS重定向
            if (!app.Environment.IsDevelopment())
            {
                app.UseHttpsRedirection();
            }

            // 将CORS中间件提前应用，确保所有请求都受到处理
            app.UseCors("CorsPolicy");

            app.UseAuthorization();

            app.MapControllers();
            
            // 映射SignalR集线器并应用CORS策略
            app.MapHub<P2PHub>("/p2phub").RequireCors("CorsPolicy");

            // 启动信息
            app.Logger.LogInformation("Allowed CORS origins: {Origins}", string.Join(", ", allowedOrigins));
            app.Logger.LogInformation("P2P application started. Server IP: {ServerIp}. API: /api, SignalR hub: /p2phub",
                GetLocalIPAddress());

            app.Run();
        }

        private static string GetLocalIPAddress()
        {
            try
            {
                var hostEntry = System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName());
                foreach (var ip in hostEntry.AddressList)
                {
                    // 过滤IPv4地址
                    if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                    {
                        return ip.ToString();
                    }
                }
            }
            catch
            {
                // DNS 查询失败时回退到 localhost，无需记录
            }
            return "localhost";
        }
    }
}