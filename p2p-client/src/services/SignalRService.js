import * as signalR from '@microsoft/signalr';
import { getApiBaseUrl } from './ConfigService';

class SignalRService {
  constructor() {
    this.connection = null;
    this.connectionPromise = null;
    this.reconnectAttempts = 0;
    this.eventHandlers = {
      // Hub-side event names
      ReceiveMessage: null,
      ReceiveFileMetadata: null,
      ReceiveFileChunk: null,
      FileTransferComplete: null,
      DeviceStatusChanged: null,
      OnlineDevices: null,
      Error: null,
      ReceiveWebRTCSignal: null,
      IceServers: null,
      
      // Client-side event names
      onReceiveMessage: null,
      onReceiveFileMetadata: null,
      onReceiveFileChunk: null,
      onFileTransferComplete: null,
      onDeviceStatusChanged: null,
      onOnlineDevices: null,
      onError: null,
      onConnectionClosed: null,
      onConnectionEstablished: null,
      onReceiveWebRTCSignal: null,
      onIceServers: null
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
      
      // Use long polling as fallback
      // 修改SignalR连接配置以解决CORS问题
      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(`${apiUrl}/p2phub`, {
          skipNegotiation: false,
          // 使用WebSockets作为首选，仅在必要时回退到LongPolling
          transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
          // 添加额外的CORS相关配置
          headers: { "X-Requested-With": "XMLHttpRequest" },
          // 浏览器支持
          withCredentials: true
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
          // Trigger event when connection closes
          if (this.eventHandlers.onConnectionClosed) {
            this.eventHandlers.onConnectionClosed(error);
          }
        });
        return this.registerConnection(userId, deviceId);
      })
      .catch(err => {
        console.error('SignalR connection error:', err);
        this.connectionPromise = null;
        // Try to reconnect up to 3 times
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
    // Helper function to trigger both hub-side and client-side event handlers
    const triggerEvent = (hubEvent, clientEvent, ...args) => {
      console.log(`SignalR event received: ${hubEvent}`, ...args);
      
      // Call hub-side handler if exists
      if (this.eventHandlers[hubEvent]) {
        this.eventHandlers[hubEvent](...args);
      }
      
      // Call client-side handler if exists
      if (this.eventHandlers[clientEvent]) {
        this.eventHandlers[clientEvent](...args);
      }
    };
    
    this.connection.on('ReceiveMessage', message => {
      triggerEvent('ReceiveMessage', 'onReceiveMessage', message);
    });

    this.connection.on('ReceiveFileMetadata', message => {
      triggerEvent('ReceiveFileMetadata', 'onReceiveFileMetadata', message);
    });

    this.connection.on('ReceiveFileChunk', (senderDeviceId, fileChunk) => {
      triggerEvent('ReceiveFileChunk', 'onReceiveFileChunk', senderDeviceId, fileChunk);
    });

    this.connection.on('FileTransferComplete', fileId => {
      triggerEvent('FileTransferComplete', 'onFileTransferComplete', fileId);
    });

    this.connection.on('DeviceStatusChanged', (deviceId, isOnline) => {
      console.log('Device status changed event received:', deviceId, isOnline);
      triggerEvent('DeviceStatusChanged', 'onDeviceStatusChanged', deviceId, isOnline);
    });

    this.connection.on('OnlineDevices', devices => {
      console.log('Online devices event received:', devices);
      triggerEvent('OnlineDevices', 'onOnlineDevices', devices);
    });

    // WebRTC signaling events
    this.connection.on('ReceiveWebRTCSignal', signal => {
      triggerEvent('ReceiveWebRTCSignal', 'onReceiveWebRTCSignal', signal);
    });

    // ICE servers configuration events
    this.connection.on('IceServers', iceServers => {
      triggerEvent('IceServers', 'onIceServers', iceServers);
    });

    this.connection.on('Error', message => {
      console.error('Hub error:', message);
      triggerEvent('Error', 'onError', message);
    });
  }

  async registerConnection(userId, deviceId) {
    console.log('Registering connection for userId:', userId, 'deviceId:', deviceId);
    try {
      await this.connection.invoke('RegisterConnection', userId, deviceId);
      console.log('Connection registered successfully');
      
      // Don't try to explicitly request online devices - 
      // the server will broadcast them as part of RegisterConnection
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
    // Map component-specific event names to internal event names
    const mappedEventName = eventName === 'onReceiveMessage' ? 'ReceiveMessage' :
                           eventName === 'onReceiveFileMetadata' ? 'ReceiveFileMetadata' :
                           eventName === 'onReceiveFileChunk' ? 'ReceiveFileChunk' :
                           eventName === 'onFileTransferComplete' ? 'FileTransferComplete' :
                           eventName === 'onDeviceStatusChanged' ? 'DeviceStatusChanged' :
                           eventName === 'onOnlineDevices' ? 'OnlineDevices' :
                           eventName === 'onError' ? 'Error' :
                           eventName === 'onReceiveWebRTCSignal' ? 'ReceiveWebRTCSignal' :
                           eventName === 'onIceServers' ? 'IceServers' :
                           eventName;
    
    // Check both original and mapped event names
    if (this.eventHandlers.hasOwnProperty(mappedEventName)) {
      this.eventHandlers[mappedEventName] = callback;
    } else if (this.eventHandlers.hasOwnProperty(eventName)) {
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

// Create instance and export, avoiding anonymous default export
const signalRService = new SignalRService();
export default signalRService;