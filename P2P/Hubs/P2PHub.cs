using Microsoft.AspNetCore.SignalR;
using P2P.Models;
using P2P.Services;

namespace P2P.Hubs
{
    public class P2PHub : Hub
    {
        private readonly UserService _userService;

        public P2PHub(UserService userService)
        {
            _userService = userService;
        }

        public async Task RegisterConnection(string userId, string deviceId)
        {
            var user = _userService.GetUser(userId);
            if (user == null)
            {
                await Clients.Caller.SendAsync("Error", "Invalid user ID.");
                return;
            }

            var device = user.ConnectedDevices.FirstOrDefault(d => d.Id == deviceId);
            if (device == null)
            {
                await Clients.Caller.SendAsync("Error", "Invalid device ID.");
                return;
            }

            // Update connection ID
            _userService.UpdateDeviceConnectionId(userId, deviceId, Context.ConnectionId);

            // Add to group
            await Groups.AddToGroupAsync(Context.ConnectionId, userId);

            // Notify other devices about online status
            await NotifyDeviceStatusChange(userId, deviceId, true);
            
            // Send current online devices
            await SendOnlineDevices(userId);
        }

        public async Task SendMessage(string userId, string deviceId, string messageContent)
        {
            var user = _userService.GetUser(userId);
            if (user == null || !user.ConnectedDevices.Any(d => d.Id == deviceId))
            {
                await Clients.Caller.SendAsync("Error", "Invalid user or device ID.");
                return;
            }

            var message = new TransferMessage
            {
                Content = messageContent,
                SenderDeviceId = deviceId,
                Type = TransferType.Message,
                Timestamp = DateTime.UtcNow
            };

            // Send to all connections in the same user group except sender
            await Clients.GroupExcept(userId, Context.ConnectionId).SendAsync("ReceiveMessage", message);
        }

        public async Task SendFileMetadata(string userId, string deviceId, FileMetadata fileMetadata)
        {
            var user = _userService.GetUser(userId);
            if (user == null || !user.ConnectedDevices.Any(d => d.Id == deviceId))
            {
                await Clients.Caller.SendAsync("Error", "Invalid user or device ID.");
                return;
            }

            var message = new TransferMessage
            {
                SenderDeviceId = deviceId,
                Type = TransferType.FileMetadata,
                Timestamp = DateTime.UtcNow,
                FileMetadata = fileMetadata
            };

            // Send to all connections in the same user group except sender
            await Clients.GroupExcept(userId, Context.ConnectionId).SendAsync("ReceiveFileMetadata", message);
        }

        public async Task SendFileChunk(string userId, string deviceId, string fileId, string chunk, int chunkIndex, int totalChunks)
        {
            var user = _userService.GetUser(userId);
            if (user == null || !user.ConnectedDevices.Any(d => d.Id == deviceId))
            {
                await Clients.Caller.SendAsync("Error", "Invalid user or device ID.");
                return;
            }

            var fileChunk = new FileChunk
            {
                FileId = fileId,
                ChunkIndex = chunkIndex,
                TotalChunks = totalChunks,
                Data = chunk
            };

            // Send to all connections in the same user group except sender
            await Clients.GroupExcept(userId, Context.ConnectionId).SendAsync("ReceiveFileChunk", deviceId, fileChunk);
            
            // If last chunk, notify completion
            if (chunkIndex == totalChunks - 1)
            {
                await Clients.GroupExcept(userId, Context.ConnectionId).SendAsync("FileTransferComplete", fileId);
            }
        }

        private async Task NotifyDeviceStatusChange(string userId, string deviceId, bool isOnline)
        {
            await Clients.GroupExcept(userId, Context.ConnectionId).SendAsync("DeviceStatusChanged", deviceId, isOnline);
        }

        private async Task SendOnlineDevices(string userId)
        {
            var devices = _userService.GetConnectedDevices(userId)
                .Where(d => d.IsOnline)
                .Select(d => new { d.Id, d.LastActivity })
                .ToList();
            
            await Clients.Caller.SendAsync("OnlineDevices", devices);
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            // Find the user and device for this connection
            var userId = "";
            var deviceId = "";
            var allUsers = _userService.GetAllUsers();
            
            foreach (var user in allUsers)
            {
                var device = user.ConnectedDevices.FirstOrDefault(d => d.ConnectionId == Context.ConnectionId);
                if (device != null)
                {
                    userId = user.Id;
                    deviceId = device.Id;
                    device.IsOnline = false;
                    break;
                }
            }

            if (!string.IsNullOrEmpty(userId) && !string.IsNullOrEmpty(deviceId))
            {
                await NotifyDeviceStatusChange(userId, deviceId, false);
            }

            await base.OnDisconnectedAsync(exception);
        }
    }
}