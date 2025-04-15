using Microsoft.AspNetCore.Mvc;
using P2P.Models;
using P2P.Services;

namespace P2P.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ConnectionController : ControllerBase
    {
        private readonly UserService _userService;

        public ConnectionController(UserService userService)
        {
            _userService = userService;
        }

        [HttpGet("devices/{userId}")]
        public ActionResult<List<ConnectedDevice>> GetConnectedDevices(string userId)
        {
            var user = _userService.GetUser(userId);
            if (user == null)
            {
                return NotFound("User not found");
            }

            return Ok(user.ConnectedDevices);
        }

        [HttpPost("disconnect")]
        public ActionResult DisconnectDevice(DisconnectRequest request)
        {
            var success = _userService.DisconnectDevice(request.UserId, request.DeviceId);
            if (!success)
            {
                return NotFound("User or device not found");
            }

            return Ok();
        }
    }

    public class DisconnectRequest
    {
        public string UserId { get; set; } = string.Empty;
        public string DeviceId { get; set; } = string.Empty;
    }
}