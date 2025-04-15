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
    }
}