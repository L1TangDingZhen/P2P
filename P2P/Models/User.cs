namespace P2P.Models
{
    public class User
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string InvitationCode { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public List<ConnectedDevice> ConnectedDevices { get; set; } = new List<ConnectedDevice>();
        public bool CanAddDevice => ConnectedDevices.Count < 2;
        public bool HasConnections => ConnectedDevices.Count > 0;

        // 清理已断开连接的设备
        public void CleanDisconnectedDevices()
        {
            ConnectedDevices.RemoveAll(d => !d.IsOnline || DateTime.UtcNow.Subtract(d.LastActivity).TotalMinutes > 5);
        }
    }

    public class ConnectedDevice
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string ConnectionId { get; set; } = string.Empty;
        public DateTime LastActivity { get; set; } = DateTime.UtcNow;
        public bool IsOnline { get; set; } = true;
    }
}