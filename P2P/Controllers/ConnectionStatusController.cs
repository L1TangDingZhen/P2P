using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;

namespace P2P.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ConnectionStatusController : ControllerBase
    {
        [HttpGet("health")]
        public IActionResult HealthCheck()
        {
            var process = Process.GetCurrentProcess();
            
            return Ok(new { 
                status = "ok",
                uptime = (DateTime.Now - process.StartTime).ToString(),
                memory = process.WorkingSet64 / (1024 * 1024) + " MB",
                timestamp = DateTime.UtcNow
            });
        }
        
        [HttpGet("signalr-status")]
        public IActionResult SignalRStatus()
        {
            return Ok(new {
                status = "operational",
                websocketSupport = true,
                serverTime = DateTime.UtcNow
            });
        }
    }
}