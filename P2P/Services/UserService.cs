using P2P.Models;

namespace P2P.Services
{
    public class UserService
    {
        // 保存用户信息，键为用户ID
        private static readonly Dictionary<string, User> _users = new();
        
        // 保存邀请码映射，键为邀请码，值为用户ID
        private static readonly Dictionary<string, string> _invitationCodes = new();
        
        // 最近生成的邀请码，用于调试
        private string _lastGeneratedCode = string.Empty;
        
        // 锁对象，用于线程安全操作
        private readonly object _lock = new();

        public List<User> GetAllUsers()
        {
            return _users.Values.ToList();
        }

        public GenerateInvitationCodeResponse GenerateInvitationCode()
        {
            var user = new User
            {
                InvitationCode = GenerateUniqueCode()
            };

            _users[user.Id] = user;
            _invitationCodes[user.InvitationCode] = user.Id;
            
            // 保存最后生成的邀请码，用于调试
            _lastGeneratedCode = user.InvitationCode;
            
            Console.WriteLine($"Generated new invitation code: {user.InvitationCode} for user: {user.Id}");
            Console.WriteLine($"Current invitation codes: {string.Join(", ", _invitationCodes.Keys)}");

            return new GenerateInvitationCodeResponse
            {
                InvitationCode = user.InvitationCode,
                UserId = user.Id
            };
        }

        public AuthenticationResponse AuthenticateWithInvitationCode(string invitationCode)
        {
            if (string.IsNullOrWhiteSpace(invitationCode))
            {
                Console.WriteLine("Authentication attempt with empty code");
                return new AuthenticationResponse
                {
                    Success = false,
                    Message = "Invitation code is required."
                };
            }
            
            // 规范化邀请码，去除空白字符
            string normalizedCode = invitationCode.Trim();
            
            Console.WriteLine($"Authenticating with code: '{normalizedCode}'");
            Console.WriteLine($"Available codes: {string.Join(", ", _invitationCodes.Keys)}");
            Console.WriteLine($"Last generated code: '{_lastGeneratedCode}'");
            
            // 检查邀请码是否存在
            if (!_invitationCodes.TryGetValue(normalizedCode, out var userId))
            {
                Console.WriteLine($"Code not found: '{normalizedCode}'");
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
                Console.WriteLine($"Maximum devices for user: {userId}, current count: {user.ConnectedDevices.Count}");
                return new AuthenticationResponse
                {
                    Success = false,
                    Message = "Maximum number of devices already connected to this account."
                };
            }

            var device = new ConnectedDevice();
            user.ConnectedDevices.Add(device);
            
            Console.WriteLine($"Authentication successful for user: {userId}, new device: {device.Id}");
            Console.WriteLine($"User now has {user.ConnectedDevices.Count} connected devices");

            return new AuthenticationResponse
            {
                Success = true,
                UserId = userId,
                DeviceId = device.Id,
                Message = "Authentication successful."
            };
        }

        public bool DisconnectDevice(string userId, string deviceId)
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

        public User? GetUser(string userId)
        {
            return _users.TryGetValue(userId, out var user) ? user : null;
        }
        
        public string GetUserIdByInvitationCode(string invitationCode)
        {
            return _invitationCodes.TryGetValue(invitationCode.Trim(), out var userId) ? userId : string.Empty;
        }

        public List<ConnectedDevice> GetConnectedDevices(string userId)
        {
            return _users.TryGetValue(userId, out var user) ? user.ConnectedDevices : new List<ConnectedDevice>();
        }
        
        public List<string> GetDeviceConnectionIds(string userId)
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

        public bool UpdateDeviceConnectionId(string userId, string deviceId, string connectionId)
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

        private string GenerateUniqueCode(int length = 8)
        {
            const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            var random = new Random();
            string code;

            do
            {
                code = new string(Enumerable.Repeat(chars, length)
                    .Select(s => s[random.Next(s.Length)]).ToArray());
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
                
                Console.WriteLine($"Invitation code {user.InvitationCode} for user {userId} has expired after 2 minutes with no connections");
                
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
                
                foreach (var user in GetAllUsers())
                {
                    var staleDevices = user.ConnectedDevices
                        .Where(d => DateTime.UtcNow.Subtract(d.LastActivity).TotalMinutes > 2)
                        .ToList();
                    
                    if (staleDevices.Count > 0)
                    {
                        Console.WriteLine($"Cleaning up {staleDevices.Count} stale device(s) for user {user.Id}");
                        
                        foreach (var device in staleDevices)
                        {
                            Console.WriteLine($"  - Removing stale device {device.Id} (last activity: {device.LastActivity})");
                            user.ConnectedDevices.Remove(device);
                            totalCleaned++;
                        }
                    }
                }
                
                if (totalCleaned > 0)
                {
                    Console.WriteLine($"Cleaned up a total of {totalCleaned} stale connections");
                }
            }
        }
    }
}