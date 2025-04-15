using Microsoft.AspNetCore.Mvc;
using P2P.Models;
using P2P.Services;

namespace P2P.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class InvitationController : ControllerBase
    {
        private readonly UserService _userService;
        private readonly ILogger<InvitationController> _logger;

        public InvitationController(UserService userService, ILogger<InvitationController> logger)
        {
            _userService = userService;
            _logger = logger;
        }

        [HttpPost("generate")]
        public ActionResult<GenerateInvitationCodeResponse> GenerateInvitationCode()
        {
            var response = _userService.GenerateInvitationCode();
            _logger.LogInformation($"Generated invitation code: {response.InvitationCode} for user: {response.UserId}");
            return Ok(response);
        }

        [HttpPost("authenticate")]
        public ActionResult<AuthenticationResponse> AuthenticateWithInvitationCode(InvitationCodeRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.InvitationCode))
            {
                _logger.LogWarning("Authentication attempt with empty invitation code");
                return BadRequest(new AuthenticationResponse
                {
                    Success = false,
                    Message = "Invitation code is required."
                });
            }

            _logger.LogInformation($"Authentication attempt with code: {request.InvitationCode}");
            var response = _userService.AuthenticateWithInvitationCode(request.InvitationCode);
            
            if (!response.Success)
            {
                _logger.LogWarning($"Authentication failed: {response.Message}");
                return BadRequest(response);
            }

            _logger.LogInformation($"Authentication successful for user: {response.UserId}, device: {response.DeviceId}");
            return Ok(response);
        }
    }
}