import { io } from "socket.io-client";

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
  }

  connect(userRole) {
    if (this.socket) {
      this.disconnect();
    }

    const serverUrl =
      process.env.REACT_APP_SERVER_URL;

    this.socket = io(serverUrl, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    this.socket.on("connect", () => {
      console.log("Connected to server:", this.socket.id);
      this.connected = true;

      // Join role-specific room
      if (userRole) {
        this.socket.emit("join-room", { role: userRole });
      }
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from server");
      this.connected = false;
    });

    this.socket.on("connect_error", (error) => {
      console.error("Connection error:", error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  isConnected() {
    return this.connected && this.socket && this.socket.connected;
  }

  // Event subscription methods
  onJobDriveUpdate(callback) {
    if (this.socket) {
      this.socket.on("jobDriveUpdate", callback);
    }
  }

  onDeletionRequestUpdate(callback) {
    if (this.socket) {
      this.socket.on("deletionRequestUpdate", callback);
    }
  }

  onPlacementUpdate(callback) {
    if (this.socket) {
      this.socket.on("placementUpdate", callback);
    }
  }

  onAnalyticsUpdate(callback) {
    if (this.socket) {
      this.socket.on("analyticsUpdate", callback);
    }
  }

  onApplicationUpdate(callback) {
    if (this.socket) {
      this.socket.on("applicationUpdate", callback);
    }
  }

  onPlacementDataUpdate(callback) {
    if (this.socket) {
      this.socket.on("placementDataUpdate", callback);
    }
  }

  onProfileUpdate(callback) {
    if (this.socket) {
      this.socket.on("profileUpdate", callback);
    }
  }

  onCGPAUpdate(callback) {
    if (this.socket) {
      this.socket.on("cgpaUpdate", callback);
    }
  }

  // Event unsubscription methods
  offJobDriveUpdate(callback) {
    if (this.socket) {
      this.socket.off("jobDriveUpdate", callback);
    }
  }

  offDeletionRequestUpdate(callback) {
    if (this.socket) {
      this.socket.off("deletionRequestUpdate", callback);
    }
  }

  offPlacementUpdate(callback) {
    if (this.socket) {
      this.socket.off("placementUpdate", callback);
    }
  }

  offAnalyticsUpdate(callback) {
    if (this.socket) {
      this.socket.off("analyticsUpdate", callback);
    }
  }

  offApplicationUpdate(callback) {
    if (this.socket) {
      this.socket.off("applicationUpdate", callback);
    }
  }

  offPlacementDataUpdate(callback) {
    if (this.socket) {
      this.socket.off("placementDataUpdate", callback);
    }
  }

  offProfileUpdate(callback) {
    if (this.socket) {
      this.socket.off("profileUpdate", callback);
    }
  }

  offCGPAUpdate(callback) {
    if (this.socket) {
      this.socket.off("cgpaUpdate", callback);
    }
  }

  // Generic event methods
  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }
}

// Create a singleton instance
const socketService = new SocketService();

export default socketService;
