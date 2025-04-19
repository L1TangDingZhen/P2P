using P2P.Hubs;
using P2P.Services;
using P2P.Models;

namespace P2P
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // comment out when publishing
            builder.WebHost.ConfigureKestrel(serverOptions =>
            {
                serverOptions.ListenAnyIP(5235); // 监听所有网络接口的5235端口
            });
            // Add services to the container.
            builder.Services.AddSingleton<UserService>();
            
            // 添加邀请码过期后台服务
            builder.Services.AddHostedService<InvitationExpirationService>();
            
            // 增强的CORS配置，解决SignalR跨域问题
            builder.Services.AddCors(options => {
                options.AddPolicy("CorsPolicy", policy => 
                    policy.SetIsOriginAllowed(_ => true) // 允许任何来源
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

            // 打印启动确认
            Console.WriteLine("\n============================");
            Console.WriteLine("P2P Application started!");
            Console.WriteLine($"Server IP: {GetLocalIPAddress()}");
            Console.WriteLine("API available at: http://localhost:5235/api");
            Console.WriteLine("SignalR hub available at: http://localhost:5235/p2phub");
            Console.WriteLine("============================\n");

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
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting IP address: {ex.Message}");
            }
            return "localhost";
        }
    }
}