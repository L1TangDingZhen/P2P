import * as signalR from '@microsoft/signalr';
import { getApiBaseUrl } from './ConfigService';

class SignalRService {
  constructor() {
    this.connection = null;
    this.connectionPromise = null;
    this.reconnectAttempts = 0;
    this.eventHandlers = {
      onReceiveMessage: null,
      onReceiveFileMetadata: null,
      onReceiveFileChunk: null,
      onFileTransferComplete: null,
      onDeviceStatusChanged: null,
      onOnlineDevices: null,
      onError: null,
      onConnectionClosed: null,
      onConnectionEstablished: null
    };
  }

  startConnection(userId, deviceId) {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    console.log('Starting SignalR connection for user:', userId);
    
    try {
      const apiUrl = getApiBaseUrl();
      console.log(`Using SignalR hub URL: ${apiUrl}/p2phub`);
      
      // 使用长轮询作为备选方案
      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(`${apiUrl}/p2phub`, {
          skipNegotiation: false,
          // 启用所有传输类型，优先WebSockets，备选长轮询
          transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
        })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.Information)
        .build();
        
      console.log('SignalR connection object built');
      
      this.setupEventHandlers();
    } catch (error) {
      console.error('Error building SignalR connection:', error);
      throw error;
    }

    this.connectionPromise = this.connection.start()
      .then(() => {
        console.log('SignalR connected!');
        this.connection.onclose(error => {
          console.log('SignalR connection closed', error);
          this.connectionPromise = null;
          // 当连接关闭时，触发事件
          if (this.eventHandlers.onConnectionClosed) {
            this.eventHandlers.onConnectionClosed(error);
          }
        });
        return this.registerConnection(userId, deviceId);
      })
      .catch(err => {
        console.error('SignalR connection error:', err);
        this.connectionPromise = null;
        // 尝试最多重连3次
        if (this.reconnectAttempts < 3) {
          this.reconnectAttempts++;
          console.log(`Reconnection attempt ${this.reconnectAttempts}/3...`);
          return new Promise(resolve => {
            setTimeout(() => {
              resolve(this.startConnection(userId, deviceId));
            }, 2000);
          });
        }
        throw err;
      });

    return this.connectionPromise;
  }

  setupEventHandlers() {
    this.connection.on('ReceiveMessage', message => {
      if (this.eventHandlers.onReceiveMessage) {
        this.eventHandlers.onReceiveMessage(message);
      }
    });

    this.connection.on('ReceiveFileMetadata', message => {
      if (this.eventHandlers.onReceiveFileMetadata) {
        this.eventHandlers.onReceiveFileMetadata(message);
      }
    });

    this.connection.on('ReceiveFileChunk', (senderDeviceId, fileChunk) => {
      if (this.eventHandlers.onReceiveFileChunk) {
        this.eventHandlers.onReceiveFileChunk(senderDeviceId, fileChunk);
      }
    });

    this.connection.on('FileTransferComplete', fileId => {
      if (this.eventHandlers.onFileTransferComplete) {
        this.eventHandlers.onFileTransferComplete(fileId);
      }
    });

    this.connection.on('DeviceStatusChanged', (deviceId, isOnline) => {
      if (this.eventHandlers.onDeviceStatusChanged) {
        this.eventHandlers.onDeviceStatusChanged(deviceId, isOnline);
      }
    });

    this.connection.on('OnlineDevices', devices => {
      if (this.eventHandlers.onOnlineDevices) {
        this.eventHandlers.onOnlineDevices(devices);
      }
    });

    this.connection.on('Error', message => {
      console.error('Hub error:', message);
      if (this.eventHandlers.onError) {
        this.eventHandlers.onError(message);
      }
    });
  }

  async registerConnection(userId, deviceId) {
    console.log('Registering connection for userId:', userId, 'deviceId:', deviceId);
    try {
      await this.connection.invoke('RegisterConnection', userId, deviceId);
      console.log('Connection registered successfully');
    } catch (error) {
      console.error('Error registering connection:', error);
      throw error;
    }
  }

  async sendMessage(userId, deviceId, messageContent) {
    await this.ensureConnection();
    return this.connection.invoke('SendMessage', userId, deviceId, messageContent);
  }

  async sendFileMetadata(userId, deviceId, fileMetadata) {
    await this.ensureConnection();
    return this.connection.invoke('SendFileMetadata', userId, deviceId, fileMetadata);
  }

  async sendFileChunk(userId, deviceId, fileId, chunk, chunkIndex, totalChunks) {
    await this.ensureConnection();
    return this.connection.invoke('SendFileChunk', userId, deviceId, fileId, chunk, chunkIndex, totalChunks);
  }

  async ensureConnection() {
    if (!this.connection || this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error('SignalR connection not established. Call startConnection first.');
    }
  }

  on(eventName, callback) {
    if (this.eventHandlers.hasOwnProperty(eventName)) {
      this.eventHandlers[eventName] = callback;
    } else {
      console.warn(`Unknown event name: ${eventName}`);
    }
  }

  stopConnection() {
    if (this.connection) {
      this.connection.stop();
      this.connection = null;
      this.connectionPromise = null;
    }
  }
}

// 创建实例并导出，避免匿名默认导出
const signalRService = new SignalRService();
export default signalRService;