namespace P2P.Models
{
    public enum TransferType
    {
        Message,
        FileMetadata,
        FileChunk
    }

    public class TransferMessage
    {
        public string SenderDeviceId { get; set; } = string.Empty;
        public TransferType Type { get; set; }
        public string Content { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
        public FileMetadata? FileMetadata { get; set; }
    }

    public class FileMetadata
    {
        public string FileId { get; set; } = Guid.NewGuid().ToString();
        public string FileName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public string ContentType { get; set; } = string.Empty;
    }

    public class FileChunk
    {
        public string FileId { get; set; } = string.Empty;
        public int ChunkIndex { get; set; }
        public int TotalChunks { get; set; }
        public string Data { get; set; } = string.Empty; // Changed from byte[] to string to use Base64
    }
}