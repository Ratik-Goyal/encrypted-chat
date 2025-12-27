import io from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(url = process.env.REACT_APP_API_URL || 'http://localhost:3000') {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(url, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 10000
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return this.socket;
  }

  on(event, callback) {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }
    this.socket.on(event, callback);
    
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }
    this.socket.emit(event, data);
  }

  off(event, callback) {
    if (!this.socket) return;
    this.socket.off(event, callback);
  }

  disconnect() {
    if (this.socket) {
      this.listeners.forEach((callbacks, event) => {
        callbacks.forEach(callback => this.socket.off(event, callback));
      });
      this.listeners.clear();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected() {
    return this.socket?.connected || false;
  }
}

export default new SocketService();
