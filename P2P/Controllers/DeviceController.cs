using Microsoft.AspNetCore.Mvc;
using P2P.Models;
using P2P.Services;

namespace P2P.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class DeviceController : ControllerBase
    {
        private readonly UserService _userService;

        public DeviceController(UserService userService)
        {
            _userService = userService;
        }

        // 测试用的API，用于清除所有设备连接
        [HttpGet("clear/{invitationCode}")]
        public ActionResult ClearDevices(string invitationCode)
        {
            var userId = _userService.GetUserIdByInvitationCode(invitationCode);
            if (string.IsNullOrEmpty(userId))
            {
                return NotFound("Invalid invitation code");
            }

            var user = _userService.GetUser(userId);
            if (user == null)
            {
                return NotFound("User not found");
            }

            user.ConnectedDevices.Clear();
            return Ok(new { message = "All devices cleared", userId });
        }
    }
}