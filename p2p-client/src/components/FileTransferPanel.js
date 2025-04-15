import React, { useState, useEffect, useRef } from 'react';
import { Form, Button, ProgressBar, Alert } from 'react-bootstrap';
import SignalRService from '../services/SignalRService';

// 辅助函数：将ArrayBuffer转换为Base64字符串
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// 辅助函数：将Base64字符串转换回ArrayBuffer
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
  
  // For incoming transfers
  const [incomingFiles, setIncomingFiles] = useState({});
  const [completedFiles, setCompletedFiles] = useState([]);
  const processedFileIdsRef = useRef(new Set());

  // Constants for file transfer
  const CHUNK_SIZE = 50 * 1024; // 50 KB chunks

  useEffect(() => {
    // 在 useEffect 内部定义事件处理函数，避免依赖项问题
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
          sender: message.senderDeviceId
        }
      }));
    };

    const processCompletedFile = (fileId) => {
      setIncomingFiles(prev => {
        if (!prev[fileId]) return prev;
    
        const file = prev[fileId];
        
        // 组装文件块并创建下载URL
        setCompletedFiles(prevCompleted => {
          // 检查文件是否已存在于完成列表中
          const exists = prevCompleted.some(f => f.fileId === fileId);
          if (exists) {
            console.log('File already in completed list, skipping duplicate:', fileId);
            return prevCompleted;
          }
          
          // 组装文件块
          const chunks = Object.entries(file.receivedChunks)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([_, chunk]) => chunk);
          
          // 创建Blob
          const blob = new Blob(chunks, { type: file.contentType || 'application/octet-stream' });
          
          // 创建下载URL
          const url = URL.createObjectURL(blob);
          
          // 添加到已完成文件列表
          return [...prevCompleted, {
            fileId,
            fileName: file.fileName,
            url,
            size: file.fileSize,
            sender: file.sender
          }];
        });
        
        // 从传输中文件移除
        const newIncomingFiles = { ...prev };
        delete newIncomingFiles[fileId];
        return newIncomingFiles;
      });
    };

    const handleReceiveFileChunk = (senderDeviceId, fileChunk) => {
      const { fileId, chunkIndex, totalChunks, data } = fileChunk;
      
      // 如果数据是Base64字符串，转换回二进制格式
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
      // 直接检查 ref 中的值
      if (processedFileIdsRef.current.has(fileId)) {
        console.log('File already processed, skipping:', fileId);
        return; // 如果已处理过，直接返回
      }
      
      // 直接修改 ref 中的 Set
      processedFileIdsRef.current.add(fileId);
      console.log('Processing completed file:', fileId);
      
      // 现在处理文件
      processCompletedFile(fileId);
    };



    // Register event handlers for file transfer
    SignalRService.on('onReceiveFileMetadata', handleReceiveFileMetadata);
    SignalRService.on('onReceiveFileChunk', handleReceiveFileChunk);
    SignalRService.on('onFileTransferComplete', handleFileTransferComplete);

    return () => {
      // Clean up event handlers
      SignalRService.on('onReceiveFileMetadata', null);
      SignalRService.on('onReceiveFileChunk', null);
      SignalRService.on('onFileTransferComplete', null);
    };
  }, []); // 依赖项为空数组，只在组件挂载时执行一次

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  function generateUUID() {
    // 如果支持原生方法就使用它
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    
    // 备选实现
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
        
        // 将ArrayBuffer转换为Base64字符串，以避免二进制传输问题
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
      <h4>File Transfer</h4>
      
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
          <p>Uploading: {selectedFile.name}</p>
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
              <p className="mb-1">Receiving: {file.fileName}</p>
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
              <p className="mb-1">{file.fileName} ({formatFileSize(file.size)})</p>
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