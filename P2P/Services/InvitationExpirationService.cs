using P2P.Models;

namespace P2P.Services
{
    public class InvitationExpirationService : BackgroundService
    {
        private readonly ILogger<InvitationExpirationService> _logger;
        private readonly UserService _userService;
        private readonly TimeSpan _expirationTime = TimeSpan.FromMinutes(2); // 2 minutes expiration time

        public InvitationExpirationService(
            ILogger<InvitationExpirationService> logger,
            UserService userService)
        {
            _logger = logger;
            _userService = userService;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Invitation Expiration Service is starting");

            // Check every 30 seconds
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    CheckAndExpireInvitations();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred while checking invitation expirations");
                }

                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }

        private void CheckAndExpireInvitations()
        {
            var users = _userService.GetAllUsers();
            var now = DateTime.UtcNow;
            
            foreach (var user in users)
            {
                // If user has no connections and was created more than 2 minutes ago
                if (!user.HasConnections && (now - user.CreatedAt) > _expirationTime)
                {
                    _logger.LogInformation(
                        "Expiring invitation code {InvitationCode} for user {UserId} after {Minutes} minutes with no connections",
                        user.InvitationCode, user.Id, _expirationTime.TotalMinutes);
                    
                    _userService.ExpireInvitationCode(user.Id);
                }
            }
        }
    }
}