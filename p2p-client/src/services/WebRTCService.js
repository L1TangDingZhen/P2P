import SignalRService from './SignalRService';

class WebRTCService {
  constructor() {
    this.connections = {}; // Map of peer connections by device ID
    this.dataChannels = {}; // Map of data channels by device ID
    this.userId = null;
    this.deviceId = null;
    this.iceServers = null;
    this.isInitialized = false;
    this.pendingIceCandidates = {};
    this.transferMode = 'server'; // Default to server relay
    
    // Event handler callbacks
    this.eventHandlers = {
      onConnectionStateChanged: null,
      onDataChannelOpen: null,
      onDataChannelClose: null,
      onDataChannelError: null,
      onTransferModeChanged: null,
      // Add these to support component event names
      onDataChannelMessage: null,
      onDataChannelFile: null,
      onDataChannelFileProgress: null
    };
  }

  // Get current transfer mode
  getTransferMode() {
    return this.transferMode;
  }

  // Initialize WebRTC service
  async initialize(userId, deviceId) {
    if (this.isInitialized) return;
    
    this.userId = userId;
    this.deviceId = deviceId;
    this.isInitialized = true;
    
    console.log('WebRTC service initializing: user:', userId, 'device:', deviceId);
    
    // Get ICE server configuration from server API
    try {
      const response = await fetch('/api/connectiondiagnostic/ice-servers');
      const data = await response.json();
      this.iceServers = data.iceServers;
      console.log('Loaded WebRTC ICE servers:', this.iceServers);
    } catch (error) {
      console.error('Failed to get ICE server configuration:', error);
      // Use public STUN servers as fallback
      this.iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ];
    }
    
    // Set up SignalR event listeners for WebRTC signaling
    SignalRService.on('ReceiveWebRTCSignal', this.handleWebRTCSignal.bind(this));
    SignalRService.on('IceServers', (iceServers) => {
      this.iceServers = iceServers;
      console.log('Received WebRTC ICE servers from hub:', this.iceServers);
    });
    
    // Listen for online devices to initialize connections
    SignalRService.on('onDeviceStatusChanged', this.handleDeviceStatusChange.bind(this));
    SignalRService.on('onOnlineDevices', this.handleOnlineDevices.bind(this));
  }

  // Handle online devices list
  handleOnlineDevices(devices) {
    console.log('Online devices:', devices);
    // Try to connect to all online devices
    devices.forEach(device => {
      if (device.id !== this.deviceId) {
        this.initiateConnection(device.id);
      }
    });
  }

  // Handle device status changes
  handleDeviceStatusChange(deviceId, isOnline) {
    console.log('Device status changed:', deviceId, isOnline);
    if (isOnline && deviceId !== this.deviceId) {
      // New device online, initialize connection
      this.initiateConnection(deviceId);
    } else if (!isOnline) {
      // Device offline, clean up existing connection
      this.closeConnection(deviceId);
    }
  }

  // Initialize WebRTC connection with another device
  async initiateConnection(targetDeviceId) {
    // Skip if connection already established or in progress
    if (this.connections[targetDeviceId]) {
      const connectionState = this.connections[targetDeviceId].connectionState;
      if (connectionState === 'connected' || connectionState === 'connecting') {
        console.log('Device already has a connection:', targetDeviceId);
        return;
      }
    }
    
    console.log('=== P2P CONNECTION ATTEMPT ===');
    console.log(`Initializing WebRTC P2P connection with device: ${targetDeviceId}`);
    console.log('Using ICE servers:', this.iceServers);
    
    try {
      // Create RTCPeerConnection with ICE servers
      const peerConnection = new RTCPeerConnection({
        iceServers: this.iceServers
      });
      
      console.log('RTCPeerConnection created successfully');
      
      // Store the connection
      this.connections[targetDeviceId] = peerConnection;
      
      // Create data channel
      const dataChannel = peerConnection.createDataChannel('p2pDataChannel');
      console.log('Data channel created:', dataChannel.label);
      this.setupDataChannel(dataChannel, targetDeviceId);
      
      // Set up event listeners
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('New ICE candidate generated:', event.candidate.candidate);
          this.sendSignal(targetDeviceId, {
            type: 'ice-candidate',
            payload: JSON.stringify(event.candidate)
          });
        } else {
          console.log('ICE candidate gathering complete');
        }
      };
      
      peerConnection.onicecandidateerror = (event) => {
        console.error('ICE candidate error:', event);
      };
      
      peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state changed to: ${peerConnection.iceConnectionState}`);
      };
      
      peerConnection.onconnectionstatechange = () => {
        console.log(`P2P connection state changed to: ${peerConnection.connectionState} for peer ${targetDeviceId}`);
        
        // Report connection state to server
        if (peerConnection.connectionState === 'connected') {
          console.log('=== P2P CONNECTION ESTABLISHED SUCCESSFULLY ===');
          this.reportConnectionState(targetDeviceId, true);
          this.updateTransferMode(true);
        } else if (['disconnected', 'failed', 'closed'].includes(peerConnection.connectionState)) {
          console.log(`P2P connection ${peerConnection.connectionState}: ${targetDeviceId}`);
          this.reportConnectionState(targetDeviceId, false);
          this.updateTransferMode(false);
        }
        
        if (this.eventHandlers.onConnectionStateChanged) {
          this.eventHandlers.onConnectionStateChanged(targetDeviceId, peerConnection.connectionState);
        }
      };
      
      peerConnection.ondatachannel = (event) => {
        console.log('Received data channel from peer:', targetDeviceId, event.channel.label);
        this.setupDataChannel(event.channel, targetDeviceId);
      };
      
      peerConnection.onsignalingstatechange = () => {
        console.log(`Signaling state changed to: ${peerConnection.signalingState}`);
      };
      
      // Store any pending ICE candidates
      this.pendingIceCandidates[targetDeviceId] = [];
      
      // Create and send offer
      console.log('Creating WebRTC offer...');
      const offer = await peerConnection.createOffer();
      console.log('WebRTC offer created:', offer.sdp.substring(0, 100) + '...');
      
      await peerConnection.setLocalDescription(offer);
      console.log('Local description set successfully');
      
      this.sendSignal(targetDeviceId, {
        type: 'offer',
        payload: JSON.stringify(peerConnection.localDescription)
      });
      
      console.log('WebRTC offer sent to device:', targetDeviceId);
    } catch (error) {
      console.error('Error creating WebRTC connection:', error);
      this.closeConnection(targetDeviceId);
    }
  }

  // Set up data channel
  setupDataChannel(dataChannel, peerId) {
    this.dataChannels[peerId] = dataChannel;
    
    dataChannel.binaryType = 'arraybuffer';
    
    dataChannel.onopen = () => {
      console.log('=== DATA CHANNEL OPENED ===');
      console.log('Data channel opened with peer:', peerId);
      console.log('Channel label:', dataChannel.label);
      console.log('Channel state:', dataChannel.readyState);
      this.updateTransferMode(true);
      if (this.eventHandlers.onDataChannelOpen) {
        this.eventHandlers.onDataChannelOpen(peerId);
      }
    };
    
    dataChannel.onclose = () => {
      console.log('Data channel closed with peer:', peerId);
      this.updateTransferMode(false);
      if (this.eventHandlers.onDataChannelClose) {
        this.eventHandlers.onDataChannelClose(peerId);
      }
    };
    
    dataChannel.onerror = (error) => {
      console.error('Data channel error with peer:', peerId, error);
      if (this.eventHandlers.onDataChannelError) {
        this.eventHandlers.onDataChannelError(peerId, error);
      }
    };
    
    dataChannel.onmessage = (event) => {
      console.log('Received message from peer:', peerId);
      
      try {
        // Messages could be text or binary data
        if (typeof event.data === 'string') {
          console.log('Text message received:', event.data.substring(0, 50) + (event.data.length > 50 ? '...' : ''));
          
          try {
            // Try to parse as JSON to check if it's a structured message
            const jsonData = JSON.parse(event.data);
            
            // Check message type
            if (jsonData.type === 'text') {
              // Regular text message
              if (this.eventHandlers.onDataChannelMessage) {
                this.eventHandlers.onDataChannelMessage({
                  content: jsonData.content,
                  senderDeviceId: peerId,
                  timestamp: new Date(),
                });
              }
            } else if (jsonData.type === 'file-metadata') {
              // Handle file metadata
              console.log('File metadata received:', jsonData.fileName);
              // Create file transfer state
              // Further implementation would handle this
            }
          } catch (e) {
            // Not JSON, treat as plain text
            if (this.eventHandlers.onDataChannelMessage) {
              this.eventHandlers.onDataChannelMessage({
                content: event.data,
                senderDeviceId: peerId,
                timestamp: new Date(),
              });
            }
          }
        } else {
          // Binary message - likely file data
          console.log('Binary data received, length:', event.data.byteLength);
          // Implementation would handle file chunks
        }
      } catch (error) {
        console.error('Error processing received message:', error);
      }
    };
  }

  // Handle WebRTC signaling
  async handleWebRTCSignal(signal) {
    if (!this.isInitialized) {
      console.error('WebRTC service not initialized');
      return;
    }
    
    const { type, senderDeviceId, payload } = signal;
    console.log(`=== RECEIVED WEBRTC SIGNAL: ${type} ===`);
    console.log(`From device: ${senderDeviceId}`);
    
    // Ignore signals from self
    if (senderDeviceId === this.deviceId) {
      console.log('Ignoring signal from self');
      return;
    }
    
    try {
      // Create peer connection if it doesn't exist
      if (!this.connections[senderDeviceId]) {
        console.log('Creating new peer connection in response to signal');
        console.log('Using ICE servers:', this.iceServers);
        
        const peerConnection = new RTCPeerConnection({
          iceServers: this.iceServers
        });
        
        console.log('RTCPeerConnection created successfully');
        this.connections[senderDeviceId] = peerConnection;
        
        // Set up event listeners
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('New ICE candidate generated (receiver):', event.candidate.candidate);
            this.sendSignal(senderDeviceId, {
              type: 'ice-candidate',
              payload: JSON.stringify(event.candidate)
            });
          } else {
            console.log('ICE candidate gathering complete (receiver)');
          }
        };
        
        peerConnection.onicecandidateerror = (event) => {
          console.error('ICE candidate error (receiver):', event);
        };
        
        peerConnection.oniceconnectionstatechange = () => {
          console.log(`ICE connection state changed to: ${peerConnection.iceConnectionState} (receiver)`);
        };
        
        peerConnection.onconnectionstatechange = () => {
          console.log(`P2P connection state changed to: ${peerConnection.connectionState} for peer ${senderDeviceId} (receiver)`);
          
          // Report connection state to server
          if (peerConnection.connectionState === 'connected') {
            console.log('=== P2P CONNECTION ESTABLISHED SUCCESSFULLY (RECEIVER) ===');
            this.reportConnectionState(senderDeviceId, true);
            this.updateTransferMode(true);
          } else if (['disconnected', 'failed', 'closed'].includes(peerConnection.connectionState)) {
            console.log(`P2P connection ${peerConnection.connectionState}: ${senderDeviceId} (receiver)`);
            this.reportConnectionState(senderDeviceId, false);
            this.updateTransferMode(false);
          }
          
          if (this.eventHandlers.onConnectionStateChanged) {
            this.eventHandlers.onConnectionStateChanged(senderDeviceId, peerConnection.connectionState);
          }
        };
        
        peerConnection.ondatachannel = (event) => {
          console.log('Received data channel from peer:', senderDeviceId, event.channel.label);
          this.setupDataChannel(event.channel, senderDeviceId);
        };
        
        peerConnection.onsignalingstatechange = () => {
          console.log(`Signaling state changed to: ${peerConnection.signalingState} (receiver)`);
        };
        
        // Initialize pending ICE candidates array
        this.pendingIceCandidates[senderDeviceId] = [];
      }
      
      const peerConnection = this.connections[senderDeviceId];
      
      if (type === 'offer') {
        // Set remote description from offer
        console.log('Processing WebRTC offer');
        const offerDesc = JSON.parse(payload);
        console.log('Offer SDP:', offerDesc.sdp.substring(0, 100) + '...');
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDesc));
        console.log('Remote description set successfully from offer');
        
        // Create and send answer
        console.log('Creating WebRTC answer...');
        const answer = await peerConnection.createAnswer();
        console.log('Answer created:', answer.sdp.substring(0, 100) + '...');
        
        await peerConnection.setLocalDescription(answer);
        console.log('Local description set successfully');
        
        this.sendSignal(senderDeviceId, {
          type: 'answer',
          payload: JSON.stringify(peerConnection.localDescription)
        });
        
        console.log('WebRTC answer sent to device:', senderDeviceId);
        
        // Apply any pending ICE candidates
        if (this.pendingIceCandidates[senderDeviceId]?.length > 0) {
          const candidates = this.pendingIceCandidates[senderDeviceId];
          console.log(`Applying ${candidates.length} pending ICE candidates for peer ${senderDeviceId}`);
          for (const candidate of candidates) {
            console.log('Applying stored ICE candidate:', candidate.candidate || candidate);
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          }
          this.pendingIceCandidates[senderDeviceId] = [];
        }
      } else if (type === 'answer') {
        // Set remote description from answer
        console.log('Processing WebRTC answer');
        const answerDesc = JSON.parse(payload);
        console.log('Answer SDP:', answerDesc.sdp.substring(0, 100) + '...');
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answerDesc));
        console.log('Remote description set successfully from answer');
        
        // Apply any pending ICE candidates
        if (this.pendingIceCandidates[senderDeviceId]?.length > 0) {
          const candidates = this.pendingIceCandidates[senderDeviceId];
          console.log(`Applying ${candidates.length} pending ICE candidates for peer ${senderDeviceId}`);
          for (const candidate of candidates) {
            console.log('Applying stored ICE candidate:', candidate.candidate || candidate);
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          }
          this.pendingIceCandidates[senderDeviceId] = [];
        }
      } else if (type === 'ice-candidate') {
        // Add ICE candidate
        console.log('Processing ICE candidate');
        const candidate = JSON.parse(payload);
        console.log('ICE candidate data:', candidate.candidate || candidate);
        
        // If we have a connection with remote description set, add candidate immediately
        if (peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('Added ICE candidate for device:', senderDeviceId);
        } else {
          // Otherwise, store it to apply later
          if (!this.pendingIceCandidates[senderDeviceId]) {
            this.pendingIceCandidates[senderDeviceId] = [];
          }
          this.pendingIceCandidates[senderDeviceId].push(candidate);
          console.log('Stored ICE candidate for later application for device:', senderDeviceId);
        }
      }
    } catch (error) {
      console.error('Error handling WebRTC signal:', error);
    }
  }

  // Send WebRTC signal
  sendSignal(targetDeviceId, signal) {
    if (!this.isInitialized) {
      console.error('WebRTC service not initialized');
      return;
    }
    
    const signalData = {
      type: signal.type,
      senderDeviceId: this.deviceId,
      targetDeviceId: targetDeviceId,
      payload: signal.payload
    };
    
    // Send signal via SignalR
    SignalRService.connection.invoke('SendWebRTCSignal', this.userId, signalData)
      .catch(err => console.error('Error sending WebRTC signal:', err));
  }

  // Report connection state to server
  reportConnectionState(targetDeviceId, isDirectConnection) {
    if (!this.isInitialized) {
      console.error('WebRTC service not initialized');
      return;
    }
    
    // Report connection state to server for analytics
    SignalRService.connection.invoke(
      'ReportWebRTCConnectionState',
      this.userId,
      this.deviceId,
      targetDeviceId,
      isDirectConnection
    ).catch(err => console.error('Error reporting WebRTC connection state:', err));
  }

  // Update transfer mode
  updateTransferMode(isP2PConnected) {
    const hasAnyP2PConnection = isP2PConnected || 
      Object.values(this.dataChannels).some(channel => channel.readyState === 'open');
    
    const newMode = hasAnyP2PConnection ? 'p2p' : 'server';
    
    if (this.transferMode !== newMode) {
      this.transferMode = newMode;
      console.log(`Transfer mode changed to: ${newMode}`);
      
      if (this.eventHandlers.onTransferModeChanged) {
        this.eventHandlers.onTransferModeChanged(newMode);
      }
    }
  }

  // Close connection with specific peer
  closeConnection(peerId) {
    // Close and clean up peer connection
    if (this.dataChannels[peerId]) {
      try {
        this.dataChannels[peerId].close();
      } catch (error) {
        console.error('Error closing data channel:', error);
      }
      delete this.dataChannels[peerId];
    }
    
    if (this.connections[peerId]) {
      try {
        this.connections[peerId].close();
      } catch (error) {
        console.error('Error closing peer connection:', error);
      }
      delete this.connections[peerId];
    }
    
    if (this.pendingIceCandidates[peerId]) {
      delete this.pendingIceCandidates[peerId];
    }
    
    this.updateTransferMode(false);
    console.log('Closed WebRTC connection with peer:', peerId);
  }

  // Close all connections
  closeAllConnections() {
    // Close all peer connections
    Object.keys(this.connections).forEach(peerId => {
      this.closeConnection(peerId);
    });
    
    this.isInitialized = false;
    console.log('Closed all WebRTC connections');
  }

  // Register event handler
  on(eventName, callback) {
    // Map component-specific event names to internal event names
    const mappedEventName = eventName === 'onMessageReceived' ? 'onDataChannelMessage' :
                           eventName === 'onFileReceived' ? 'onDataChannelFile' :
                           eventName === 'onFileTransferProgress' ? 'onDataChannelFileProgress' :
                           eventName;
    
    if (this.eventHandlers.hasOwnProperty(mappedEventName)) {
      this.eventHandlers[mappedEventName] = callback;
    } else if (this.eventHandlers.hasOwnProperty(eventName)) {
      this.eventHandlers[eventName] = callback;
    } else {
      console.warn(`Unknown event name: ${eventName}`);
    }
  }

  // Get P2P connection status
  getConnectionStatus() {
    const connectedPeers = Object.entries(this.connections)
      .filter(([_, connection]) => connection.connectionState === 'connected')
      .map(([peerId]) => peerId);
    
    return {
      totalPeers: Object.keys(this.connections).length,
      connectedPeers: connectedPeers.length,
      transferMode: this.transferMode,
      peerDetails: Object.entries(this.connections).map(([peerId, connection]) => ({
        peerId,
        connectionState: connection.connectionState,
        dataChannelState: this.dataChannels[peerId]?.readyState || 'closed'
      }))
    };
  }
}

// Create instance and export
const webRTCService = new WebRTCService();
export default webRTCService;