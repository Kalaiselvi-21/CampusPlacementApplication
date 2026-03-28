import React, { useMemo, useEffect, useState } from "react";
import { Bell, CheckCircle, FileText, FolderPlus, Pencil, Trash2, X } from "lucide-react";

const NotificationToast = ({ notification, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const Icon = useMemo(() => {
    switch (notification?.type) {
      case "test:published":
        return FileText;
      case "test:updated":
        return Pencil;
      case "test:deleted":
        return Trash2;
      case "test:completed":
        return CheckCircle;
      case "resource:added":
        return FolderPlus;
      default:
        return Bell;
    }
  }, [notification?.type]);

  const getColor = (type) => {
    switch (type) {
      case "test:published":
        return "bg-green-500";
      case "test:updated":
        return "bg-blue-500";
      case "test:deleted":
        return "bg-red-500";
      case "test:completed":
        return "bg-purple-500";
      case "resource:added":
        return "bg-indigo-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-sm w-full bg-white rounded-lg shadow-lg border-l-4 ${getColor(
        notification?.type
      )} transform transition-all duration-300 ${
        isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      }`}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <Icon className="w-6 h-6 text-gray-900" aria-hidden="true" />
          </div>
          <div className="ml-3 flex-1">
            <h4 className="text-sm font-medium text-gray-900">{notification?.title}</h4>
            <p className="mt-1 text-sm text-gray-600">{notification?.message}</p>
            {notification?.data && (
              <div className="mt-2 text-xs text-gray-500">
                {notification.data.department && (
                  <span className="inline-block bg-gray-100 px-2 py-1 rounded mr-2">
                    {notification.data.department}
                  </span>
                )}
                {notification.data.durationMins && (
                  <span className="inline-block bg-gray-100 px-2 py-1 rounded">
                    {notification.data.durationMins} mins
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="ml-4 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsVisible(false);
                setTimeout(onClose, 300);
              }}
              className="inline-flex text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              <span className="sr-only">Close</span>
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationToast;
