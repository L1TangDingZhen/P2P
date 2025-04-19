using System.Text.Json.Serialization;

namespace P2P.Models
{
    public class WebRTCSignalData
    {
        public string Type { get; set; } = string.Empty;
        public string SenderDeviceId { get; set; } = string.Empty;
        public string TargetDeviceId { get; set; } = string.Empty;
        public string Payload { get; set; } = string.Empty;
    }

    public class WebRTCConnectionState
    {
        public string DeviceId { get; set; } = string.Empty;
        public bool HasDirectConnection { get; set; } = false;
        public DateTime LastChecked { get; set; } = DateTime.UtcNow;
    }

    public class PeerConnectionReport
    {
        public string PeerId { get; set; } = string.Empty;
        public bool IsConnected { get; set; } = false;
        public string ConnectionType { get; set; } = string.Empty; // "p2p" or "relay"
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    public class ConnectionDiagnostic
    {
        public string UserId { get; set; } = string.Empty;
        public string DeviceId { get; set; } = string.Empty;
        public bool HasStunConnectivity { get; set; } = false;
        public bool HasTurnConnectivity { get; set; } = false;
        public List<PeerConnectionReport> PeerConnections { get; set; } = new List<PeerConnectionReport>();
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}