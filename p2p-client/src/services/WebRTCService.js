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
    this.connectionTimeouts = {}; // Track connection timeouts
    this.fileTransfers = {}; // Track ongoing file transfers
    this.connectionQualityData = {}; // Track connection quality metrics
    
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
      // Create RTCPeerConnection with enhanced configuration
      const peerConnection = new RTCPeerConnection({
        iceServers: this.iceServers,
        iceTransportPolicy: 'all',  // Try all possible transport methods
        iceCandidatePoolSize: 10,   // Increase ICE candidate pool size
        rtcpMuxPolicy: 'require'    // Reduce number of required ports
      });
      
      console.log('RTCPeerConnection created successfully');
      
      // Store the connection
      this.connections[targetDeviceId] = peerConnection;
      
      // Add connection timeout and fallback mechanism
      this.connectionTimeouts[targetDeviceId] = setTimeout(() => {
        if (peerConnection.iceConnectionState !== 'connected' &&
            peerConnection.iceConnectionState !== 'completed') {
          console.log('P2P connection timeout, switching to server relay');
          this.updateTransferMode(false);
        }
      }, 15000); // 15 seconds timeout
      
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
        
        // Implement ICE restart when connection fails
        if (peerConnection.iceConnectionState === 'failed') {
          console.log('ICE connection failed, attempting restart');
          try {
            peerConnection.restartIce();
          } catch (err) {
            console.error('Error restarting ICE:', err);
          }
        }
      };
      
      peerConnection.onconnectionstatechange = () => {
        console.log(`P2P connection state changed to: ${peerConnection.connectionState} for peer ${targetDeviceId}`);
        
        // Report connection state to server
        if (peerConnection.connectionState === 'connected') {
          console.log('=== P2P CONNECTION ESTABLISHED SUCCESSFULLY ===');
          this.reportConnectionState(targetDeviceId, true);
          this.updateTransferMode(true);
          
          // Clear connection timeout
          if (this.connectionTimeouts[targetDeviceId]) {
            clearTimeout(this.connectionTimeouts[targetDeviceId]);
            delete this.connectionTimeouts[targetDeviceId];
          }
          
          // Start monitoring connection quality
          this.startConnectionQualityMonitoring(targetDeviceId);
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
      
      // Add ICE gathering state change monitoring
      peerConnection.onicegatheringstatechange = () => {
        console.log(`ICE gathering state: ${peerConnection.iceGatheringState}`);
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
          iceServers: this.iceServers,
          iceTransportPolicy: 'all',  // Try all possible transport methods
          iceCandidatePoolSize: 10,   // Increase ICE candidate pool size
          rtcpMuxPolicy: 'require'    // Reduce number of required ports
        });
        
        console.log('RTCPeerConnection created successfully');
        this.connections[senderDeviceId] = peerConnection;
        
        // Add connection timeout and fallback mechanism
        this.connectionTimeouts[senderDeviceId] = setTimeout(() => {
          if (peerConnection.iceConnectionState !== 'connected' &&
              peerConnection.iceConnectionState !== 'completed') {
            console.log('P2P connection timeout (receiver), switching to server relay');
            this.updateTransferMode(false);
          }
        }, 15000); // 15 seconds timeout
        
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
          
          // Implement ICE restart when connection fails (receiver side)
          if (peerConnection.iceConnectionState === 'failed') {
            console.log('ICE connection failed (receiver), attempting restart');
            try {
              peerConnection.restartIce();
            } catch (err) {
              console.error('Error restarting ICE (receiver):', err);
            }
          }
        };
        
        peerConnection.onconnectionstatechange = () => {
          console.log(`P2P connection state changed to: ${peerConnection.connectionState} for peer ${senderDeviceId} (receiver)`);
          
          // Report connection state to server
          if (peerConnection.connectionState === 'connected') {
            console.log('=== P2P CONNECTION ESTABLISHED SUCCESSFULLY (RECEIVER) ===');
            this.reportConnectionState(senderDeviceId, true);
            this.updateTransferMode(true);
            
            // Clear connection timeout
            if (this.connectionTimeouts[senderDeviceId]) {
              clearTimeout(this.connectionTimeouts[senderDeviceId]);
              delete this.connectionTimeouts[senderDeviceId];
            }
            
            // Start monitoring connection quality
            this.startConnectionQualityMonitoring(senderDeviceId);
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
        
        // Add ICE gathering state change monitoring (receiver side)
        peerConnection.onicegatheringstatechange = () => {
          console.log(`ICE gathering state (receiver): ${peerConnection.iceGatheringState}`);
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
    // Clear connection timeout if exists
    if (this.connectionTimeouts[peerId]) {
      clearTimeout(this.connectionTimeouts[peerId]);
      delete this.connectionTimeouts[peerId];
    }
    
    // Clean up connection quality monitoring
    if (this.connectionQualityData[peerId]) {
      delete this.connectionQualityData[peerId];
    }
    
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
    
    if (this.fileTransfers[peerId]) {
      delete this.fileTransfers[peerId];
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
    
    // Clear all connection quality monitoring
    Object.keys(this.connectionQualityData).forEach(peerId => {
      if (this.connectionQualityData[peerId] && this.connectionQualityData[peerId].monitorInterval) {
        clearInterval(this.connectionQualityData[peerId].monitorInterval);
      }
      delete this.connectionQualityData[peerId];
    });
    
    // Clear all connection timeouts
    Object.keys(this.connectionTimeouts).forEach(peerId => {
      clearTimeout(this.connectionTimeouts[peerId]);
      delete this.connectionTimeouts[peerId];
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

  // Diagnose network capabilities
  async diagnoseConnection() {
    console.log('Running network diagnostics...');
    
    // Simple STUN connectivity test
    const stunSuccess = await this.testStunConnectivity();
    console.log(`STUN connectivity: ${stunSuccess ? 'Available' : 'Not available'}`);
    
    // Test TURN connectivity if configured
    if (this.iceServers && this.iceServers.some(server => 
        typeof server.urls === 'string' ? server.urls.startsWith('turn:') : 
        server.urls.some(url => url.startsWith('turn:')))) {
      const turnSuccess = await this.testTurnConnectivity();
      console.log(`TURN connectivity: ${turnSuccess ? 'Available' : 'Not available'}`);
    }
    
    return {
      stunConnectivity: stunSuccess,
      turnConnectivity: this.iceServers.some(server => 
        typeof server.urls === 'string' ? server.urls.startsWith('turn:') : 
        server.urls.some(url => url.startsWith('turn:')))
    };
  }
  
  // Test STUN connectivity
  async testStunConnectivity() {
    return new Promise(resolve => {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        let stunDetected = false;
        
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            if (event.candidate.candidate.indexOf('srflx') !== -1) {
              stunDetected = true;
            }
          } else {
            // ICE gathering complete
            resolve(stunDetected);
            pc.close();
          }
        };
        
        // Create data channel to trigger ICE gathering
        pc.createDataChannel('stun-test');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        
        // Timeout after 5 seconds
        setTimeout(() => {
          if (pc.iceGatheringState !== 'complete') {
            resolve(false);
            pc.close();
          }
        }, 5000);
        
      } catch (error) {
        console.error('STUN test error:', error);
        resolve(false);
      }
    });
  }
  
  // Test TURN connectivity
  async testTurnConnectivity() {
    return new Promise(resolve => {
      try {
        // Find a TURN server in our configuration
        const turnServer = this.iceServers.find(server => 
          typeof server.urls === 'string' ? server.urls.startsWith('turn:') : 
          server.urls.some(url => url.startsWith('turn:')));
          
        if (!turnServer) {
          resolve(false);
          return;
        }
        
        const pc = new RTCPeerConnection({
          iceServers: [turnServer]
        });
        
        let turnDetected = false;
        
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            if (event.candidate.candidate.indexOf('relay') !== -1) {
              turnDetected = true;
            }
          } else {
            // ICE gathering complete
            resolve(turnDetected);
            pc.close();
          }
        };
        
        // Create data channel to trigger ICE gathering
        pc.createDataChannel('turn-test');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        
        // Timeout after 5 seconds
        setTimeout(() => {
          if (pc.iceGatheringState !== 'complete') {
            resolve(false);
            pc.close();
          }
        }, 5000);
        
      } catch (error) {
        console.error('TURN test error:', error);
        resolve(false);
      }
    });
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
        iceConnectionState: connection.iceConnectionState,
        dataChannelState: this.dataChannels[peerId]?.readyState || 'closed',
        quality: this.connectionQualityData[peerId] || null
      }))
    };
  }
  
  // Monitor connection quality
  startConnectionQualityMonitoring(peerId) {
    const peerConnection = this.connections[peerId];
    if (!peerConnection) return;
    
    const monitorInterval = setInterval(() => {
      if (peerConnection.connectionState === 'connected') {
        peerConnection.getStats(null).then(stats => {
          let quality = {
            timestamp: Date.now(),
            rtt: null,
            bytesSent: 0,
            bytesReceived: 0
          };
          
          stats.forEach(report => {
            if (report.type === 'transport') {
              if (report.currentRoundTripTime) {
                quality.rtt = report.currentRoundTripTime * 1000; // Convert to ms
                console.log(`Connection quality for ${peerId} - RTT: ${quality.rtt}ms`);
              }
              
              if (report.bytesSent) quality.bytesSent = report.bytesSent;
              if (report.bytesReceived) quality.bytesReceived = report.bytesReceived;
            }
          });
          
          this.connectionQualityData[peerId] = quality;
          
          // Adapt to network conditions if needed
          if (quality.rtt && quality.rtt > 500) {
            console.log('High latency detected, adapting transmission rate');
            // Implementation would adjust chunk size or transmission rate
          }
        });
      } else {
        clearInterval(monitorInterval);
      }
    }, 5000);
    
    // Store the interval ID for cleanup
    this.connectionQualityData[peerId] = { monitorInterval };
  }
}

// Create instance and export
const webRTCService = new WebRTCService();

// Add file and message sending methods
webRTCService.sendMessage = function(message) {
  if (!this.isInitialized) {
    console.error('WebRTC service not initialized');
    return false;
  }
  
  const activeDataChannels = Object.values(this.dataChannels)
    .filter(channel => channel.readyState === 'open');
  
  if (activeDataChannels.length === 0) {
    console.error('No active data channels available for message sending');
    return false;
  }
  
  try {
    const messageData = {
      type: 'text',
      content: message,
      timestamp: new Date().toISOString()
    };
    
    const messageString = JSON.stringify(messageData);
    
    // Send to all connected peers
    let success = false;
    for (const channel of activeDataChannels) {
      try {
        channel.send(messageString);
        success = true;
        console.log('Message sent successfully via P2P data channel');
      } catch (err) {
        console.error('Error sending message via data channel:', err);
      }
    }
    
    return success;
  } catch (error) {
    console.error('Error preparing message for sending:', error);
    return false;
  }
};

webRTCService.sendFile = function(file, onProgress) {
  if (!this.isInitialized) {
    console.error('WebRTC service not initialized');
    return false;
  }
  
  const activeDataChannels = Object.values(this.dataChannels)
    .filter(channel => channel.readyState === 'open');
  
  if (activeDataChannels.length === 0) {
    console.error('No active data channels available for file sending');
    return false;
  }
  
  // Only send to the first available channel for now
  const dataChannel = activeDataChannels[0];
  const peerId = Object.keys(this.dataChannels).find(
    key => this.dataChannels[key] === dataChannel
  );
  
  try {
    // Create file transfer ID
    const transferId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Send file metadata
    const metadataPacket = {
      type: 'file-metadata',
      transferId: transferId,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      timestamp: new Date().toISOString()
    };
    
    console.log(`Starting file transfer: ${file.name} (${file.size} bytes)`);
    dataChannel.send(JSON.stringify(metadataPacket));
    
    // Initialize file reader
    const chunkSize = 16384; // 16 KB chunks
    let offset = 0;
    const reader = new FileReader();
    
    // Store file transfer state
    this.fileTransfers[transferId] = {
      file: file,
      progress: 0,
      startTime: Date.now(),
      peerId: peerId,
      canceled: false
    };
    
    // Handle chunk reading and sending
    reader.onload = (event) => {
      if (this.fileTransfers[transferId].canceled) {
        console.log(`File transfer ${transferId} canceled`);
        return;
      }
      
      // Send binary chunk
      dataChannel.send(event.target.result);
      
      // Update progress
      offset += event.target.result.byteLength;
      const progress = Math.min(100, Math.floor((offset / file.size) * 100));
      this.fileTransfers[transferId].progress = progress;
      
      if (onProgress) {
        onProgress({
          transferId,
          fileName: file.name,
          progress,
          sent: offset,
          total: file.size
        });
      }
      
      // Read next chunk or finish
      if (offset < file.size) {
        readNextChunk();
      } else {
        // Send transfer complete notification
        const completePacket = {
          type: 'file-complete',
          transferId: transferId,
          fileName: file.name
        };
        dataChannel.send(JSON.stringify(completePacket));
        
        console.log(`File transfer complete: ${file.name}`);
        delete this.fileTransfers[transferId];
      }
    };
    
    reader.onerror = (error) => {
      console.error('Error reading file:', error);
      delete this.fileTransfers[transferId];
    };
    
    // Function to read the next chunk
    const readNextChunk = () => {
      const slice = file.slice(offset, offset + chunkSize);
      reader.readAsArrayBuffer(slice);
    };
    
    // Start reading the first chunk
    readNextChunk();
    return transferId;
    
  } catch (error) {
    console.error('Error sending file:', error);
    return false;
  }
};

webRTCService.cancelFileTransfer = function(transferId) {
  if (this.fileTransfers[transferId]) {
    this.fileTransfers[transferId].canceled = true;
    
    // Send cancel message if we can
    const peerId = this.fileTransfers[transferId].peerId;
    const dataChannel = this.dataChannels[peerId];
    
    if (dataChannel && dataChannel.readyState === 'open') {
      const cancelPacket = {
        type: 'file-cancel',
        transferId: transferId
      };
      dataChannel.send(JSON.stringify(cancelPacket));
    }
    
    delete this.fileTransfers[transferId];
    return true;
  }
  return false;
};

export default webRTCService;