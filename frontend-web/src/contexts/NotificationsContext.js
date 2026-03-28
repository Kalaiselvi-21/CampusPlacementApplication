import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import axios from "axios";
import socketService from "../services/socketService";
import { useAuth } from "./AuthContext";

const API_BASE = process.env.REACT_APP_API_BASE;

const NotificationsContext = createContext(null);

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
};

export const NotificationsProvider = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isPR = user?.role === "placement_representative" || user?.role === "pr";
  const isPO = user?.role === "po" || user?.role === "placement_officer" || user?.role === "admin";

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API_BASE}/api/notifications?limit=50&offset=0`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch (err) {
      console.error("Failed to fetch notifications:", err?.response?.data || err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const markRead = useCallback(async (id) => {
    if (!id) return;
    try {
      const token = localStorage.getItem("token");
      await axios.patch(
        `${API_BASE}/api/notifications/${id}/read`,
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );
      setNotifications((prev) =>
        prev.map((n) => (String(n.id) === String(id) ? { ...n, is_read: true, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error("Failed to mark notification read:", err?.response?.data || err?.message || err);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      await axios.patch(
        `${API_BASE}/api/notifications/read-all`,
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all notifications read:", err?.response?.data || err?.message || err);
    }
  }, []);

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    fetchNotifications();
  }, [user, fetchNotifications]);

  useEffect(() => {
    if (panelOpen) fetchNotifications();
  }, [panelOpen, fetchNotifications]);

  // Realtime: ensure the socket joins user/department rooms and refetch on new notifications.
  useEffect(() => {
    if (!user) return;

    if (!socketService.isConnected()) {
      socketService.connect(user);
    }

    socketService.emit("join-room", {
      role: user.role,
      userId: user.id || user._id || user.userId,
      department: user.profile?.department,
    });

    const handler = () => {
      fetchNotifications();
    };

    socketService.on("notification:new", handler);
    return () => {
      socketService.off("notification:new", handler);
    };
  }, [user, fetchNotifications]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      panelOpen,
      loading,
      isPR,
      isPO,
      fetchNotifications,
      markRead,
      markAllRead,
      openPanel,
      closePanel,
    }),
    [
      notifications,
      unreadCount,
      panelOpen,
      loading,
      isPR,
      isPO,
      fetchNotifications,
      markRead,
      markAllRead,
      openPanel,
      closePanel,
    ]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};
