namespace P2P.Models
{
    public class InvitationCodeRequest
    {
        public string InvitationCode { get; set; } = string.Empty;
    }

    public class GenerateInvitationCodeResponse
    {
        public string InvitationCode { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
    }

    public class AuthenticationResponse
    {
        public string UserId { get; set; } = string.Empty;
        public string DeviceId { get; set; } = string.Empty;
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
    }
}