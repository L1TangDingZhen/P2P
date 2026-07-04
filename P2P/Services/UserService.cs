using System.Security.Cryptography;
using P2P.Models;

namespace P2P.Services
{
    public class UserService
    {
        // 保存用户信息，键为用户ID
        private static readonly Dictionary<string, User> _users = new();

        // 保存邀请码映射，键为邀请码，值为用户ID
        private static readonly Dictionary<string, string> _invitationCodes = new();

        // 锁对象：所有对 _users / _invitationCodes / ConnectedDevices 的读写都必须持有此锁
        private static readonly object _lock = new();

        private readonly ILogger<UserService> _logger;

        public UserService(ILogger<UserService> logger)
        {
            _logger = logger;
        }

        public List<User> GetAllUsers()
        {
            lock (_lock)
            {
                return _users.Values.ToList();
            }
        }

        public GenerateInvitationCodeResponse GenerateInvitationCode()
        {
            lock (_lock)
            {
                var user = new User
                {
                    InvitationCode = GenerateUniqueCode()
                };

                _users[user.Id] = user;
                _invitationCodes[user.InvitationCode] = user.Id;

                // 邀请码属于凭证，仅 Debug 级别记录，生产默认不输出
                _logger.LogDebug("Generated invitation code {InvitationCode} for user {UserId}", user.InvitationCode, user.Id);
                _logger.LogInformation("Generated new invitation code for user {UserId}", user.Id);

                return new GenerateInvitationCodeResponse
                {
                    InvitationCode = user.InvitationCode,
                    UserId = user.Id
                };
            }
        }

        public AuthenticationResponse AuthenticateWithInvitationCode(string invitationCode)
        {
            if (string.IsNullOrWhiteSpace(invitationCode))
            {
                _logger.LogWarning("Authentication attempt with empty invitation code");
                return new AuthenticationResponse
                {
                    Success = false,
                    Message = "Invitation code is required."
                };
            }

            // 规范化邀请码，去除空白字符
            string normalizedCode = invitationCode.Trim();

            lock (_lock)
            {
                // 检查邀请码是否存在
                if (!_invitationCodes.TryGetValue(normalizedCode, out var userId))
                {
                    _logger.LogWarning("Authentication failed: invitation code not found");
                    return new AuthenticationResponse
                    {
                        Success = false,
                        Message = "Invalid invitation code."
                    };
                }

                var user = _users[userId];

                // 清理已断开连接的设备
                user.CleanDisconnectedDevices();

                if (!user.CanAddDevice)
                {
                    _logger.LogWarning("Authentication rejected for user {UserId}: maximum devices reached ({Count})",
                        userId, user.ConnectedDevices.Count);
                    return new AuthenticationResponse
                    {
                        Success = false,
                        Message = "Maximum number of devices already connected to this account."
                    };
                }

                var device = new ConnectedDevice();
                user.ConnectedDevices.Add(device);

                _logger.LogInformation("Authentication successful for user {UserId}, new device {DeviceId} ({Count} device(s) connected)",
                    userId, device.Id, user.ConnectedDevices.Count);

                return new AuthenticationResponse
                {
                    Success = true,
                    UserId = userId,
                    DeviceId = device.Id,
                    Message = "Authentication successful."
                };
            }
        }

        public bool DisconnectDevice(string userId, string deviceId)
        {
            lock (_lock)
            {
                if (!_users.TryGetValue(userId, out var user))
                {
                    return false;
                }

                var device = user.ConnectedDevices.FirstOrDefault(d => d.Id == deviceId);
                if (device == null)
                {
                    return false;
                }

                return user.ConnectedDevices.Remove(device);
            }
        }

        public User? GetUser(string userId)
        {
            lock (_lock)
            {
                return _users.TryGetValue(userId, out var user) ? user : null;
            }
        }

        public string GetUserIdByInvitationCode(string invitationCode)
        {
            lock (_lock)
            {
                return _invitationCodes.TryGetValue(invitationCode.Trim(), out var userId) ? userId : string.Empty;
            }
        }

        public List<ConnectedDevice> GetConnectedDevices(string userId)
        {
            lock (_lock)
            {
                // 返回快照副本，避免调用方遍历时集合被并发修改
                return _users.TryGetValue(userId, out var user)
                    ? new List<ConnectedDevice>(user.ConnectedDevices)
                    : new List<ConnectedDevice>();
            }
        }

        public List<string> GetDeviceConnectionIds(string userId)
        {
            lock (_lock)
            {
                if (!_users.TryGetValue(userId, out var user))
                {
                    return new List<string>();
                }

                // Return connection IDs for all online devices
                return user.ConnectedDevices
                    .Where(d => d.IsOnline && !string.IsNullOrEmpty(d.ConnectionId))
                    .Select(d => d.ConnectionId)
                    .ToList();
            }
        }

        public bool UpdateDeviceConnectionId(string userId, string deviceId, string connectionId)
        {
            lock (_lock)
            {
                if (!_users.TryGetValue(userId, out var user))
                {
                    return false;
                }

                var device = user.ConnectedDevices.FirstOrDefault(d => d.Id == deviceId);
                if (device == null)
                {
                    return false;
                }

                device.ConnectionId = connectionId;
                device.LastActivity = DateTime.UtcNow;
                device.IsOnline = true;
                return true;
            }
        }

        private static string GenerateUniqueCode(int length = 8)
        {
            // 注意：调用方必须已持有 _lock（目前仅 GenerateInvitationCode 调用）
            // 使用加密安全随机数：邀请码是唯一的连接凭证，需防猜测
            const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            string code;

            do
            {
                code = new string(RandomNumberGenerator.GetItems<char>(chars, length));
            } while (_invitationCodes.ContainsKey(code));

            return code;
        }

        /// <summary>
        /// 使未使用的邀请码过期
        /// </summary>
        /// <param name="userId">用户ID</param>
        /// <returns>是否成功过期该邀请码</returns>
        public bool ExpireInvitationCode(string userId)
        {
            lock (_lock)
            {
                if (!_users.TryGetValue(userId, out var user))
                {
                    return false;
                }

                // 只有当没有设备连接时才过期
                if (user.ConnectedDevices.Count > 0)
                {
                    return false;
                }

                // 移除邀请码映射
                _invitationCodes.Remove(user.InvitationCode);

                // 移除用户
                _users.Remove(userId);

                _logger.LogInformation("Invitation code for user {UserId} expired with no connections", userId);

                return true;
            }
        }

        /// <summary>
        /// 清理所有过期的连接
        /// </summary>
        public void CleanupStaleConnections()
        {
            lock (_lock)
            {
                int totalCleaned = 0;

                foreach (var user in _users.Values)
                {
                    var staleDevices = user.ConnectedDevices
                        .Where(d => DateTime.UtcNow.Subtract(d.LastActivity).TotalMinutes > 2)
                        .ToList();

                    foreach (var device in staleDevices)
                    {
                        _logger.LogInformation("Removing stale device {DeviceId} for user {UserId} (last activity: {LastActivity})",
                            device.Id, user.Id, device.LastActivity);
                        user.ConnectedDevices.Remove(device);
                        totalCleaned++;
                    }
                }

                if (totalCleaned > 0)
                {
                    _logger.LogInformation("Cleaned up {Count} stale connection(s)", totalCleaned);
                }
            }
        }
    }
}
