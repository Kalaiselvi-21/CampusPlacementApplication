import { io } from "socket.io-client";
import { SERVER_URL } from "../config/api";

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.joinPayload = null;
    this.serverUrl = null;
  }

  normalizeJoinPayload(userOrRole) {
    if (!userOrRole) return null;

    if (typeof userOrRole === "string") {
      return { role: userOrRole };
    }

    const role = userOrRole.role;
    const userId =
      userOrRole.id || userOrRole._id || userOrRole.userId || userOrRole.user_id;
    const department =
      userOrRole.department || userOrRole.profile?.department || userOrRole.profile_department;

    const payload = {};
    if (role) payload.role = role;
    if (userId) payload.userId = userId;
    if (department) payload.department = department;
    return Object.keys(payload).length ? payload : null;
  }

  mergeJoinPayload(nextPayload) {
    if (!nextPayload) return;
    const current = this.joinPayload || {};
    this.joinPayload = {
      ...current,
      ...Object.fromEntries(
        Object.entries(nextPayload).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== ""),
      ),
    };
  }

  connect(userOrRole) {
    const nextPayload = this.normalizeJoinPayload(userOrRole);
    this.mergeJoinPayload(nextPayload);

    const serverUrl = SERVER_URL;

    // If already connected to same server, just refresh room membership.
    if (this.socket && this.serverUrl === serverUrl) {
      if (this.isConnected() && this.joinPayload) {
        this.socket.emit("join-room", this.joinPayload);
      }
      return this.socket;
    }

    // Server changed or new socket: reset and connect.
    if (this.socket) this.disconnect();
    this.serverUrl = serverUrl;

    this.socket = io(serverUrl, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    this.socket.on("connect", () => {
      console.log("Connected to server:", this.socket.id);
      this.connected = true;

      // Join role/user/department rooms (backward compatible)
      if (this.joinPayload) {
        this.socket.emit("join-room", this.joinPayload);
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
