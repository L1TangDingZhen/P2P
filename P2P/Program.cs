using P2P.Hubs;
using P2P.Services;

namespace P2P
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.
            builder.Services.AddSingleton<UserService>();
            
            // 使用更灵活的CORS配置，适应不同环境下的访问
            builder.Services.AddCors(options => {
                options.AddPolicy("CorsPolicy", policy => 
                    policy.SetIsOriginAllowed(_ => true)
                          .AllowAnyMethod()
                          .AllowAnyHeader()
                          .AllowCredentials());
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
            
            // 映射SignalR集线器
            app.MapHub<P2PHub>("/p2phub");

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