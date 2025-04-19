using Microsoft.AspNetCore.SignalR;
using P2P.Models;
using P2P.Services;
using System.Collections.Concurrent;

namespace P2P.Hubs
{
    public class P2PHub : Hub
    {
        private readonly UserService _userService;
        // Track WebRTC connection states between devices
        private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, WebRTCConnectionState>> _webRTCStates = 
            new ConcurrentDictionary<string, ConcurrentDictionary<string, WebRTCConnectionState>>();
        // Store ice servers for WebRTC
        private readonly List<object> _iceServers = new List<object>
        {
            new { urls = "stun:stun.l.google.com:19302" },
            new { urls = "stun:stun1.l.google.com:19302" },
            new { urls = "stun:stun2.l.google.com:19302" }
            // You would add TURN servers here for production
            // Example: new { urls = "turn:turn.example.com", username = "username", credential = "password" }
        };

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
            Console.WriteLine($"Device {deviceId} is now connected with connection ID {Context.ConnectionId}");

            // Add to group
            await Groups.AddToGroupAsync(Context.ConnectionId, userId);

            // Notify other devices about online status
            await NotifyDeviceStatusChange(userId, deviceId, true);
            
            // Send current online devices to all clients in the group (including the caller)
            await SendOnlineDevices(userId);

            // Send ICE servers configuration
            await Clients.Caller.SendAsync("IceServers", _iceServers);
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
            // Notify all devices in the group about the status change
            // Note: We're now sending to ALL clients in the group, not excluding the sender
            await Clients.Group(userId).SendAsync("DeviceStatusChanged", deviceId, isOnline);
            
            // Log the notification for debugging
            Console.WriteLine($"Notifying all devices in group {userId} that device {deviceId} is now {(isOnline ? "online" : "offline")}");
        }

        private async Task SendOnlineDevices(string userId)
        {
            try
            {
                // Get a list of all online devices for this user
                var devices = _userService.GetConnectedDevices(userId)
                    .Where(d => d.IsOnline)
                    .Select(d => new { d.Id, d.LastActivity })
                    .ToList();
                
                Console.WriteLine($"Sending {devices.Count} online devices to user {userId}");
                foreach (var device in devices)
                {
                    Console.WriteLine($"  - Device {device.Id}");
                }
                
                // Make sure each client gets the complete list of ALL online devices
                // including itself (not just other devices)
                foreach (var connectionId in _userService.GetDeviceConnectionIds(userId))
                {
                    if (!string.IsNullOrEmpty(connectionId))
                    {
                        Console.WriteLine($"Sending device list to connection {connectionId}");
                        await Clients.Client(connectionId).SendAsync("OnlineDevices", devices);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in SendOnlineDevices: {ex.Message}");
            }
        }
        
        // Method to allow clients to request online devices explicitly
        // The name must exactly match what the client is calling: GetOnlineDevices
        public async Task GetOnlineDevices()
        {
            try
            {
                // Find the user for this connection
                var allUsers = _userService.GetAllUsers();
                string? userId = null;
                
                foreach (var user in allUsers)
                {
                    var device = user.ConnectedDevices.FirstOrDefault(d => d.ConnectionId == Context.ConnectionId);
                    if (device != null)
                    {
                        userId = user.Id;
                        break;
                    }
                }
                
                if (userId != null)
                {
                    Console.WriteLine($"GetOnlineDevices requested by connection {Context.ConnectionId} (user {userId})");
                    await SendOnlineDevices(userId);
                }
                else
                {
                    Console.WriteLine($"GetOnlineDevices: No user found for connection {Context.ConnectionId}");
                    await Clients.Caller.SendAsync("Error", "User not found for this connection");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetOnlineDevices: {ex.Message}");
                await Clients.Caller.SendAsync("Error", "An error occurred while getting online devices");
            }
        }

        // WebRTC signaling - Send an offer or answer to a specific device
        public async Task SendWebRTCSignal(string userId, WebRTCSignalData signal)
        {
            var user = _userService.GetUser(userId);
            if (user == null)
            {
                await Clients.Caller.SendAsync("Error", "Invalid user ID.");
                return;
            }

            // Find the target device
            var targetDevice = user.ConnectedDevices.FirstOrDefault(d => d.Id == signal.TargetDeviceId);
            if (targetDevice == null || string.IsNullOrEmpty(targetDevice.ConnectionId))
            {
                await Clients.Caller.SendAsync("Error", "Target device not found or not connected.");
                return;
            }

            // Send the WebRTC signal directly to the target device
            await Clients.Client(targetDevice.ConnectionId).SendAsync("ReceiveWebRTCSignal", signal);
        }

        // Report WebRTC connection state (P2P or relay)
        public async Task ReportWebRTCConnectionState(string userId, string deviceId, string targetDeviceId, bool isDirectConnection)
        {
            var user = _userService.GetUser(userId);
            if (user == null)
            {
                await Clients.Caller.SendAsync("Error", "Invalid user ID.");
                return;
            }

            // Update the WebRTC connection state
            var deviceStates = _webRTCStates.GetOrAdd(deviceId, new ConcurrentDictionary<string, WebRTCConnectionState>());
            deviceStates[targetDeviceId] = new WebRTCConnectionState
            {
                DeviceId = targetDeviceId,
                HasDirectConnection = isDirectConnection,
                LastChecked = DateTime.UtcNow
            };

            // Log the connection state for debugging
            Console.WriteLine($"WebRTC connection between {deviceId} and {targetDeviceId} is {(isDirectConnection ? "direct P2P" : "relayed")}");
        }

        // Get WebRTC connection capabilities
        public Task<List<object>> GetIceServers()
        {
            return Task.FromResult(_iceServers);
        }

        // Submit connection diagnostic report
        public async Task SubmitConnectionDiagnostic(ConnectionDiagnostic diagnostic)
        {
            var user = _userService.GetUser(diagnostic.UserId);
            if (user == null)
            {
                await Clients.Caller.SendAsync("Error", "Invalid user ID.");
                return;
            }

            Console.WriteLine($"Connection diagnostic from device {diagnostic.DeviceId}:");
            Console.WriteLine($"  STUN: {(diagnostic.HasStunConnectivity ? "Available" : "Not available")}");
            Console.WriteLine($"  TURN: {(diagnostic.HasTurnConnectivity ? "Available" : "Not available")}");
            Console.WriteLine($"  Peer connections: {diagnostic.PeerConnections.Count}");
            
            foreach (var peer in diagnostic.PeerConnections)
            {
                Console.WriteLine($"  - Peer {peer.PeerId}: {(peer.IsConnected ? "Connected" : "Not connected")} ({peer.ConnectionType})");
            }
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
                    Console.WriteLine($"Device {deviceId} disconnected (connection {Context.ConnectionId})");
                    break;
                }
            }

            if (!string.IsNullOrEmpty(userId) && !string.IsNullOrEmpty(deviceId))
            {
                // Notify other devices that this device is offline
                await NotifyDeviceStatusChange(userId, deviceId, false);
                
                // Clean up WebRTC state tracking
                _webRTCStates.TryRemove(deviceId, out _);
                
                // Get updated list of online devices
                var devices = _userService.GetConnectedDevices(userId)
                    .Where(d => d.IsOnline && d.Id != deviceId) // Exclude the disconnected device
                    .Select(d => new { d.Id, d.LastActivity })
                    .ToList();
                
                Console.WriteLine($"Broadcasting updated device list after disconnect:");
                foreach (var d in devices)
                {
                    Console.WriteLine($"  - Device {d.Id}");
                }
                
                // Send updated list to all remaining devices
                await Clients.Group(userId).SendAsync("OnlineDevices", devices);
            }
            else
            {
                Console.WriteLine($"Disconnection for unknown device (connection {Context.ConnectionId})");
            }

            await base.OnDisconnectedAsync(exception);
        }
    }
}