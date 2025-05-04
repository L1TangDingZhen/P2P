// Web Worker for handling file processing
// This worker handles file chunking, encoding/decoding and other CPU-intensive operations

// Helper function: Convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return self.btoa(binary);
}

// Helper function: Convert Base64 string back to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binaryString = self.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Process a file chunk for sending
async function processChunkForSending(fileChunk, useBase64) {
  try {
    const arrayBuffer = await fileChunk.arrayBuffer();
    if (useBase64) {
      // Convert to base64 for server relay mode
      return arrayBufferToBase64(arrayBuffer);
    } else {
      // Return raw buffer for WebRTC
      return arrayBuffer;
    }
  } catch (error) {
    throw new Error(`Error processing chunk: ${error.message}`);
  }
}

// Handle incoming messages from main thread
self.onmessage = async function(e) {
  const { action, data } = e.data;
  
  try {
    switch (action) {
      case 'process_chunk_for_sending':
        const { chunk, index, useBase64 } = data;
        const processedChunk = await processChunkForSending(chunk, useBase64);
        self.postMessage({
          action: 'chunk_processed',
          data: {
            processedChunk,
            index,
            useBase64
          }
        });
        break;
        
      case 'process_incoming_chunk':
        const { receivedChunk, chunkIndex, isBase64 } = data;
        let binaryData;
        
        if (isBase64) {
          binaryData = new Uint8Array(base64ToArrayBuffer(receivedChunk));
        } else {
          binaryData = receivedChunk;
        }
        
        self.postMessage({
          action: 'incoming_chunk_processed',
          data: {
            processedChunk: binaryData,
            chunkIndex
          }
        });
        break;
      
      case 'prepare_file_chunks':
        const { file, chunkSize, useBase64 } = data;
        const totalChunks = Math.ceil(file.size / chunkSize);
        
        // Send back metadata before processing chunks
        self.postMessage({
          action: 'file_metadata',
          data: {
            totalChunks,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type
          }
        });
        
        // Process chunks in small batches to avoid memory issues
        const BATCH_SIZE = 5; // Process 5 chunks at a time
        for (let batchStart = 0; batchStart < totalChunks; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, totalChunks);
          
          for (let i = batchStart; i < batchEnd; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunk = file.slice(start, end);
            
            const arrayBuffer = await chunk.arrayBuffer();
            const processedChunk = useBase64 ? arrayBufferToBase64(arrayBuffer) : arrayBuffer;
            
            self.postMessage({
              action: 'chunk_ready',
              data: {
                chunkIndex: i,
                chunk: processedChunk,
                isFinal: i === totalChunks - 1
              }
            });
            
            // Report progress
            const progress = Math.round(((i + 1) / totalChunks) * 100);
            self.postMessage({
              action: 'progress_update',
              data: { progress }
            });
          }
        }
        
        self.postMessage({
          action: 'all_chunks_processed'
        });
        break;
        
      default:
        self.postMessage({
          action: 'error',
          data: { message: `Unknown action: ${action}` }
        });
    }
  } catch (error) {
    self.postMessage({
      action: 'error',
      data: { message: error.message }
    });
  }
};