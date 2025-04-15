using Microsoft.AspNetCore.Mvc;
using P2P.Models;
using P2P.Services;
using System.Collections.Generic;

namespace P2P.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TestController : ControllerBase
    {
        private readonly UserService _userService;

        public TestController(UserService userService)
        {
            _userService = userService;
        }

        [HttpGet("echo")]
        public ActionResult Echo()
        {
            return Ok(new { message = "API is working!", timestamp = DateTime.UtcNow });
        }

        [HttpGet("users")]
        public ActionResult<List<User>> GetAllUsers()
        {
            return Ok(_userService.GetAllUsers());
        }

        [HttpGet("device-status/{userId}")]
        public ActionResult GetDeviceStatus(string userId)
        {
            var user = _userService.GetUser(userId);
            if (user == null)
            {
                return NotFound("User not found");
            }

            return Ok(new
            {
                userId = user.Id,
                devices = user.ConnectedDevices.Select(d => new
                {
                    d.Id,
                    d.ConnectionId,
                    d.LastActivity,
                    d.IsOnline
                })
            });
        }

        [HttpPost("test-message/{userId}")]
        public ActionResult SendTestMessage(string userId, [FromBody] TestMessageRequest request)
        {
            var user = _userService.GetUser(userId);
            if (user == null)
            {
                return NotFound("User not found");
            }

            return Ok(new { 
                success = true, 
                message = $"Test message would be sent to {user.ConnectedDevices.Count} devices", 
                content = request.Content
            });
        }
    }

    public class TestMessageRequest
    {
        public string Content { get; set; } = string.Empty;
    }
}