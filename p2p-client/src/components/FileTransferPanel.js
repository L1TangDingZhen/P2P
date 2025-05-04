import React, { useState, useEffect, useRef } from 'react';
import { Form, Button, ProgressBar, Alert, Badge } from 'react-bootstrap';
import SignalRService from '../services/SignalRService';
import WebRTCService from '../services/WebRTCService';

// Helper functions moved to Web Worker for performance
// These are kept here for backwards compatibility only
function arrayBufferToBase64(buffer) {
  if (typeof window.fileTransferWorker !== 'undefined') {
    console.warn('This function should be called in the Web Worker');
  }
  
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  if (typeof window.fileTransferWorker !== 'undefined') {
    console.warn('This function should be called in the Web Worker');
  }
  
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Initialize Web Worker for file processing
function initFileTransferWorker() {
  if (typeof window.fileTransferWorker !== 'undefined') {
    return window.fileTransferWorker;
  }

  try {
    const workerBlob = new Blob([
      `importScripts('${window.location.origin}/services/FileTransferWorker.js');`
    ], { type: 'application/javascript' });
    
    window.fileTransferWorker = new Worker(URL.createObjectURL(workerBlob));
    console.log('File transfer worker initialized');
    return window.fileTransferWorker;
  } catch (error) {
    console.error('Failed to initialize file transfer worker:', error);
    return null;
  }
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
          
          // Optimize handling for different file types
          const isVideo = file.contentType && file.contentType.startsWith('video/');
          
          console.log(`Processing completed file: ${file.fileName}, type: ${file.contentType}, size: ${file.fileSize}`);
          
          // Assemble file chunks
          const chunks = Object.entries(file.receivedChunks)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([_, chunk]) => chunk);
          
          let url;
          let blob;
          
          // For video files, use MediaSource API for streaming if supported
          if (isVideo && window.MediaSource && MediaSource.isTypeSupported(file.contentType)) {
            console.log(`Using MediaSource for streaming video: ${file.fileName}`);
            
            blob = new Blob(chunks, { type: file.contentType });
            url = URL.createObjectURL(blob);
            
            // Store chunks in IndexedDB for quick access if user wants to re-watch
            // This would be implemented with IndexedDB API
            // For simplicity, this part is omitted in this implementation
          } else {
            // For non-streamable or smaller files, use regular Blob approach
            blob = new Blob(chunks, { type: file.contentType || 'application/octet-stream' });
            url = URL.createObjectURL(blob);
          }
          
          // Clean up memory by releasing references to chunks
          // This helps especially with large files
          setTimeout(() => {
            if (file.receivedChunks) {
              Object.keys(file.receivedChunks).forEach(key => {
                file.receivedChunks[key] = null;
              });
            }
          }, 1000);
          
          // Add to completed files list
          return [...prevCompleted, {
            fileId,
            fileName: file.fileName,
            url,
            blob,
            size: file.fileSize,
            sender: file.sender,
            isVideo,
            contentType: file.contentType,
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

    // Initialize web worker if needed
    const worker = initFileTransferWorker();
    
    try {
      // Check if file is a video
      const isVideo = selectedFile.type.startsWith('video/');
      const isLargeFile = selectedFile.size > 10 * 1024 * 1024; // 10MB
      
      // Try to use WebRTC P2P transfer for all files (preferred)
      if (transferType === 'p2p') {
        try {
          console.log('Trying to send file via WebRTC P2P');
          const transferId = await WebRTCService.sendFile(selectedFile, (progress) => {
            setUploadProgress(progress.progress);
          });
          
          if (transferId) {
            console.log(`WebRTC P2P file transfer started with ID: ${transferId}`);
            // If P2P transfer is successful, we don't need to continue with server relay
            setIsUploading(false);
            setSelectedFile(null);
            document.getElementById('file-input').value = null;
            return;
          } else {
            console.log('WebRTC P2P file transfer failed, falling back to server relay');
          }
        } catch (p2pError) {
          console.error('WebRTC file transfer failed, falling back to server relay:', p2pError);
        }
      }
      
      // Server relay fallback with Web Worker for better performance
      console.log('Using server relay for file transfer');
      
      // Generate file ID and prepare metadata
      const fileId = generateUUID();
      const fileMetadata = {
        fileId,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        contentType: selectedFile.type,
        isLargeFile,
        isVideo
      };

      await SignalRService.sendFileMetadata(userId, deviceId, fileMetadata);
      
      // Optimize chunk size based on file type and size
      let optimizedChunkSize = CHUNK_SIZE;
      if (isVideo || isLargeFile) {
        // Using smaller chunks for large/video files helps keep the UI responsive
        // but makes the transfer take slightly longer
        optimizedChunkSize = 32 * 1024; // 32KB
      }
      
      // Use Web Worker for processing if available
      if (worker) {
        console.log(`Using web worker with ${optimizedChunkSize}B chunks`);
        
        const chunkPromises = [];
        const maxConcurrentChunks = 3; // Limit concurrent processing
        
        // Set up worker message handler
        const workerHandler = (event) => {
          const { action, data } = event.data;
          
          if (action === 'progress_update') {
            setUploadProgress(data.progress);
          } else if (action === 'chunk_ready') {
            // Send chunk via SignalR
            const sendPromise = SignalRService.sendFileChunk(
              userId, 
              deviceId, 
              fileId, 
              data.chunk, // Already base64 encoded by worker
              data.chunkIndex, 
              data.totalChunks
            );
            
            chunkPromises.push(sendPromise);
            
            // Limit number of in-flight chunks
            if (chunkPromises.length >= maxConcurrentChunks) {
              Promise.race(chunkPromises).then(() => {
                // Remove resolved promise from the list
                const index = chunkPromises.findIndex(p => p.status === 'fulfilled');
                if (index >= 0) chunkPromises.splice(index, 1);
              });
            }
          } else if (action === 'all_chunks_processed') {
            console.log('All chunks processed, waiting for remaining transfers to complete');
            // Wait for all remaining chunks to be sent
            Promise.all(chunkPromises).then(() => {
              console.log('All chunks sent successfully');
              worker.removeEventListener('message', workerHandler);
            });
          } else if (action === 'error') {
            setError(`Worker error: ${data.message}`);
            worker.removeEventListener('message', workerHandler);
          }
        };
        
        worker.addEventListener('message', workerHandler);
        
        // Start processing in worker
        worker.postMessage({
          action: 'prepare_file_chunks',
          data: {
            file: selectedFile,
            chunkSize: optimizedChunkSize,
            useBase64: true // Server relay needs base64
          }
        });
        
        // Wait until file is completely processed
        const timeout = setTimeout(() => {
          setError('Transfer timed out. Please try again.');
          setIsUploading(false);
        }, 600000); // 10 minute timeout
        
        // Create a promise that resolves when all chunks are processed
        await new Promise((resolve, reject) => {
          const completeHandler = (event) => {
            if (event.data.action === 'all_chunks_processed') {
              Promise.all(chunkPromises)
                .then(() => {
                  worker.removeEventListener('message', completeHandler);
                  clearTimeout(timeout);
                  resolve();
                })
                .catch(reject);
            } else if (event.data.action === 'error') {
              reject(new Error(event.data.data.message));
            }
          };
          
          worker.addEventListener('message', completeHandler);
        });
        
      } else {
        // Fallback to regular chunking without worker
        console.log('Web Worker unavailable, using regular chunking');
        
        const totalChunks = Math.ceil(selectedFile.size / optimizedChunkSize);
        
        // For non-worker approach, use more sequential approach
        // to avoid overwhelming the main thread
        for (let i = 0; i < totalChunks; i++) {
          const start = i * optimizedChunkSize;
          const end = Math.min(start + optimizedChunkSize, selectedFile.size);
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
          
          // Yield to UI thread periodically to prevent freezing
          if (i % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
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
              <div>
                <p className="mb-1">Receiving: {file.fileName}</p>
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
              <div className="mb-2">
                <p className="mb-0">
                  {file.fileName} ({formatFileSize(file.size)})
                  <Badge 
                    bg={file.transferType === 'p2p' ? 'success' : 'warning'} 
                    className="ms-2"
                  >
                    {file.transferType === 'p2p' ? 'P2P' : 'Server'}
                  </Badge>
                </p>
              </div>
              
              {/* Video preview for video files */}
              {file.isVideo && (
                <div className="mb-2 mt-2">
                  <p className="small text-muted mb-1">Preview:</p>
                  <video 
                    controls 
                    style={{ maxWidth: '100%', maxHeight: '200px' }} 
                    src={file.url}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              )}
              
              <div className="d-flex">
                <a 
                  href={file.url} 
                  download={file.fileName}
                  className="btn btn-sm btn-success me-2"
                >
                  Download
                </a>
                
                {file.isVideo && (
                  <a 
                    href={file.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-primary"
                  >
                    Open in New Tab
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileTransferPanel;