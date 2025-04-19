using Microsoft.AspNetCore.Mvc;
using P2P.Models;

namespace P2P.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ConnectionDiagnosticController : ControllerBase
    {
        private readonly ILogger<ConnectionDiagnosticController> _logger;

        public ConnectionDiagnosticController(ILogger<ConnectionDiagnosticController> logger)
        {
            _logger = logger;
        }

        [HttpGet("ice-servers")]
        public IActionResult GetIceServers()
        {
            // Return STUN and TURN servers configuration
            var iceServers = new List<object>
            {
                new { urls = "stun:stun.l.google.com:19302" },
                new { urls = "stun:stun1.l.google.com:19302" },
                new { urls = "stun:stun2.l.google.com:19302" }
                // Add TURN servers for production deployment
                // Example: new { urls = "turn:turn.example.com", username = "username", credential = "password" }
            };

            return Ok(new { iceServers });
        }

        [HttpPost("report")]
        public IActionResult SubmitDiagnostic([FromBody] ConnectionDiagnostic diagnostic)
        {
            if (diagnostic == null)
            {
                return BadRequest("Invalid diagnostic report");
            }

            _logger.LogInformation(
                "Connection diagnostic from device {DeviceId} (User: {UserId}):\n" +
                "STUN: {HasStun}, TURN: {HasTurn}, Peer connections: {PeerCount}",
                diagnostic.DeviceId, 
                diagnostic.UserId,
                diagnostic.HasStunConnectivity ? "Available" : "Not available",
                diagnostic.HasTurnConnectivity ? "Available" : "Not available",
                diagnostic.PeerConnections.Count
            );

            foreach (var peer in diagnostic.PeerConnections)
            {
                _logger.LogInformation(
                    "- Peer {PeerId}: {IsConnected} ({ConnectionType})",
                    peer.PeerId,
                    peer.IsConnected ? "Connected" : "Not connected",
                    peer.ConnectionType
                );
            }

            return Ok(new { success = true, message = "Diagnostic report received" });
        }
    }
}