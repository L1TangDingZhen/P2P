import React, { useState, useEffect, useRef } from 'react';
import { Form, Button, ProgressBar, Alert, Badge } from 'react-bootstrap';
import SignalRService from '../services/SignalRService';
import WebRTCService from '../services/WebRTCService';

// Helper function: Convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper function: Convert Base64 string back to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

const FileTransferPanel = ({ userId, deviceId }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [transferType, setTransferType] = useState('server'); // 'server' or 'p2p'
  
  // For incoming transfers
  const [incomingFiles, setIncomingFiles] = useState({});
  const [completedFiles, setCompletedFiles] = useState([]);
  const processedFileIdsRef = useRef(new Set());

  // Constants for file transfer
  const CHUNK_SIZE = 50 * 1024; // 50 KB chunks

  useEffect(() => {
    // Get current WebRTC connection status and update transfer type
    const updateTransferType = () => {
      try {
        const connectionStatus = WebRTCService.getConnectionStatus();
        if (connectionStatus.transferMode !== transferType) {
          setTransferType(connectionStatus.transferMode);
          console.log(`Transfer type updated to: ${connectionStatus.transferMode}`);
        }
      } catch (error) {
        console.error('Error getting WebRTC status:', error);
      }
    };

    // Listen for WebRTC transfer mode changes
    WebRTCService.on('onTransferModeChanged', (mode) => {
      setTransferType(mode);
      console.log(`Transfer type changed to: ${mode}`);
    });

    // Initial transfer type retrieval
    updateTransferType();
    
    // Periodically update transfer type
    const interval = setInterval(updateTransferType, 5000);
    
    // Define event handlers inside useEffect to avoid dependency issues
    const handleReceiveFileMetadata = (message) => {
      const { fileMetadata } = message;
      
      // Initialize data structures for the incoming file
      setIncomingFiles(prev => ({
        ...prev,
        [fileMetadata.fileId]: {
          ...fileMetadata,
          receivedChunks: {},
          totalChunks: 0,
          receivedSize: 0,
          progress: 0,
          sender: message.senderDeviceId,
          transferType: 'server' // Mark as server relay transfer
        }
      }));
    };

    const processCompletedFile = (fileId) => {
      setIncomingFiles(prev => {
        if (!prev[fileId]) return prev;
    
        const file = prev[fileId];
        
        // Assemble file chunks and create download URL
        setCompletedFiles(prevCompleted => {
          // Check if file already exists in completed list
          const exists = prevCompleted.some(f => f.fileId === fileId);
          if (exists) {
            console.log('File already in completed list, skipping duplicate:', fileId);
            return prevCompleted;
          }
          
          // Assemble file chunks
          const chunks = Object.entries(file.receivedChunks)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([_, chunk]) => chunk);
          
          // Create Blob
          const blob = new Blob(chunks, { type: file.contentType || 'application/octet-stream' });
          
          // Create download URL
          const url = URL.createObjectURL(blob);
          
          // Add to completed files list
          return [...prevCompleted, {
            fileId,
            fileName: file.fileName,
            url,
            size: file.fileSize,
            sender: file.sender,
            transferType: file.transferType || 'server' // Transfer type
          }];
        });
        
        // Remove from incoming files
        const newIncomingFiles = { ...prev };
        delete newIncomingFiles[fileId];
        return newIncomingFiles;
      });
    };

    const handleReceiveFileChunk = (senderDeviceId, fileChunk) => {
      const { fileId, chunkIndex, totalChunks, data } = fileChunk;
      
      // If data is Base64 string, convert back to binary format
      const binaryData = typeof data === 'string' ? 
        new Uint8Array(base64ToArrayBuffer(data)) : 
        data;
      
      setIncomingFiles(prev => {
        // If we don't have this file initialized, ignore the chunk
        if (!prev[fileId]) return prev;

        // Store the chunk
        const file = prev[fileId];
        const newReceivedChunks = { ...file.receivedChunks, [chunkIndex]: binaryData };
        const receivedChunksCount = Object.keys(newReceivedChunks).length;
        const progress = Math.round((receivedChunksCount / totalChunks) * 100);
        
        // Calculate received size
        let receivedSize = 0;
        Object.values(newReceivedChunks).forEach(chunk => {
          receivedSize += chunk.length;
        });

        return {
          ...prev,
          [fileId]: {
            ...file,
            receivedChunks: newReceivedChunks,
            totalChunks,
            receivedSize,
            progress
          }
        };
      });
    };

    const handleFileTransferComplete = (fileId) => {
      // Check value directly in ref
      if (processedFileIdsRef.current.has(fileId)) {
        console.log('File already processed, skipping:', fileId);
        return; // If already processed, return directly
      }
      
      // Directly modify the Set in ref
      processedFileIdsRef.current.add(fileId);
      console.log('Processing completed file:', fileId);
      
      // Now process the file
      processCompletedFile(fileId);
    };

    // WebRTC P2P file reception handling
    WebRTCService.on('onFileReceived', (fileInfo) => {
      console.log('WebRTC P2P file received:', fileInfo);
      setCompletedFiles(prev => [
        ...prev, 
        {
          ...fileInfo,
          transferType: 'p2p' // Mark as P2P direct transfer
        }
      ]);
    });

    WebRTCService.on('onFileTransferProgress', (fileId, progress) => {
      console.log(`WebRTC file transfer progress: ${fileId} - ${progress}%`);
      // Could update P2P transfer progress here, but simplified version doesn't implement this
    });

    // Register event handlers for file transfer
    SignalRService.on('onReceiveFileMetadata', handleReceiveFileMetadata);
    SignalRService.on('onReceiveFileChunk', handleReceiveFileChunk);
    SignalRService.on('onFileTransferComplete', handleFileTransferComplete);

    return () => {
      // Clean up event handlers
      SignalRService.on('onReceiveFileMetadata', null);
      SignalRService.on('onReceiveFileChunk', null);
      SignalRService.on('onFileTransferComplete', null);
      WebRTCService.on('onFileReceived', null);
      WebRTCService.on('onFileTransferProgress', null);
      WebRTCService.on('onTransferModeChanged', null);
      
      clearInterval(interval);
    };
  }, [transferType]); // Add transferType as dependency

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  function generateUUID() {
    // Use native method if available
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    
    // Fallback implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }

  const handleSendFile = async () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      // Try to use WebRTC P2P transfer
      if (transferType === 'p2p') {
        try {
          console.log('Trying to send file via WebRTC P2P');
          // This part should actually implement WebRTC file sending
          // For now, for demonstration, we just log and use server relay
          console.log('WebRTC P2P file transfer not fully implemented, falling back to server relay');
        } catch (p2pError) {
          console.error('WebRTC file transfer failed, falling back to server relay:', p2pError);
        }
      }
      
      // If P2P not available or not fully implemented, use server relay
      console.log('Using server relay for file transfer');
      
      // Send file metadata
      const fileId = generateUUID();

      const fileMetadata = {
        fileId,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        contentType: selectedFile.type
      };

      await SignalRService.sendFileMetadata(userId, deviceId, fileMetadata);

      // Split file into chunks and send each chunk
      const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, selectedFile.size);
        const chunk = selectedFile.slice(start, end);
        
        // Convert the chunk to an array buffer
        const arrayBuffer = await chunk.arrayBuffer();
        
        // Convert ArrayBuffer to Base64 string to avoid binary transmission issues
        const base64Data = arrayBufferToBase64(arrayBuffer);
        
        // Send the chunk
        await SignalRService.sendFileChunk(
          userId, 
          deviceId, 
          fileId, 
          base64Data, 
          i, 
          totalChunks
        );
        
        // Update progress
        const progress = Math.round(((i + 1) / totalChunks) * 100);
        setUploadProgress(progress);
      }

      setSelectedFile(null);
      setUploadProgress(0);
      document.getElementById('file-input').value = null;
    } catch (error) {
      console.error('Error sending file:', error);
      setError('Error sending file: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>File Transfer</h4>
        <Badge bg={transferType === 'p2p' ? 'primary' : 'secondary'}>
          {transferType === 'p2p' ? 'P2P Mode' : 'Server Relay Mode'}
        </Badge>
      </div>
      
      {error && (
        <Alert variant="danger" onClose={() => setError('')} dismissible>
          {error}
        </Alert>
      )}
      
      <Form.Group className="mb-3">
        <Form.Label>Select File</Form.Label>
        <Form.Control
          id="file-input"
          type="file"
          onChange={handleFileChange}
          disabled={isUploading}
        />
      </Form.Group>
      
      <Button 
        variant="primary" 
        onClick={handleSendFile} 
        disabled={!selectedFile || isUploading}
        className="mb-3"
      >
        {isUploading ? 'Sending...' : 'Send File'}
      </Button>
      
      {isUploading && (
        <div className="mb-3">
          <p>
            Uploading: {selectedFile.name}
            <Badge bg={transferType === 'p2p' ? 'primary' : 'secondary'} className="ms-2">
              {transferType === 'p2p' ? 'P2P' : 'Server Relay'}
            </Badge>
          </p>
          <ProgressBar now={uploadProgress} label={`${uploadProgress}%`} />
          <p className="small mt-1">
            {formatFileSize(Math.floor(selectedFile.size * uploadProgress / 100))} of {formatFileSize(selectedFile.size)}
          </p>
        </div>
      )}
      
      {/* Incoming file transfers */}
      {Object.entries(incomingFiles).length > 0 && (
        <div className="mt-4">
          <h5>Incoming Files</h5>
          {Object.entries(incomingFiles).map(([fileId, file]) => (
            <div key={fileId} className="border rounded p-2 mb-2">
              <div className="d-flex justify-content-between">
                <p className="mb-1">Receiving: {file.fileName}</p>
                <Badge bg={file.transferType === 'p2p' ? 'primary' : 'secondary'}>
                  {file.transferType === 'p2p' ? 'P2P' : 'Server Relay'}
                </Badge>
              </div>
              <ProgressBar now={file.progress} label={`${file.progress}%`} />
              <p className="small mt-1">
                {formatFileSize(file.receivedSize)} of {formatFileSize(file.fileSize)}
              </p>
            </div>
          ))}
        </div>
      )}
      
      {/* Completed file transfers */}
      {completedFiles.length > 0 && (
        <div className="mt-4">
          <h5>Completed Transfers</h5>
          {completedFiles.map((file) => (
            <div key={file.fileId} className="border rounded p-2 mb-2">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <p className="mb-0">{file.fileName} ({formatFileSize(file.size)})</p>
                <Badge bg={file.transferType === 'p2p' ? 'primary' : 'secondary'}>
                  {file.transferType === 'p2p' ? 'P2P' : 'Server Relay'}
                </Badge>
              </div>
              <a 
                href={file.url} 
                download={file.fileName}
                className="btn btn-sm btn-success"
              >
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileTransferPanel;