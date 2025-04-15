using Microsoft.AspNetCore.Mvc;

namespace P2P.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ConnectionDiagnosticController : ControllerBase
    {
        [HttpGet("ping")]
        public IActionResult Ping()
        {
            return Ok(new { message = "pong", timestamp = DateTime.UtcNow });
        }

        [HttpGet("cors-test")]
        public IActionResult CorsTest()
        {
            // 使用推荐的方式设置响应头部
            Response.Headers["Access-Control-Allow-Origin"] = "http://localhost:3000";
            Response.Headers["Access-Control-Allow-Credentials"] = "true";
            Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS";
            Response.Headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization";

            return Ok(new { 
                message = "CORS headers set", 
                timestamp = DateTime.UtcNow,
                headers = Request.Headers.ToDictionary(h => h.Key, h => h.Value.ToString())
            });
        }
    }
}