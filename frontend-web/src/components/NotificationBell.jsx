import React from "react";
import { useNotifications } from "../contexts/NotificationsContext";
import { Bell } from "lucide-react";

const NotificationBell = () => {
  const { unreadCount, openPanel } = useNotifications();

  return (
    <button
      type="button"
      onClick={openPanel}
      className="relative w-10 h-10 rounded-full flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-colors duration-200"
      aria-label="Open notifications"
    >
      <Bell className="w-5 h-5" aria-hidden="true" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] leading-[18px] text-center font-semibold shadow">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
};

export default NotificationBell;
