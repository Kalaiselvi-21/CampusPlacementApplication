import React, { useState, useEffect } from 'react';

const NotificationToast = ({ notification, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for animation to complete
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const getIcon = (type) => {
    switch (type) {
      case 'test:published':
        return '📝';
      case 'test:updated':
        return '✏️';
      case 'test:deleted':
        return '🗑️';
      case 'test:completed':
        return '✅';
      case 'resource:added':
        return '📚';
      default:
        return '🔔';
    }
  };

  const getColor = (type) => {
    switch (type) {
      case 'test:published':
        return 'bg-green-500';
      case 'test:updated':
        return 'bg-blue-500';
      case 'test:deleted':
        return 'bg-red-500';
      case 'test:completed':
        return 'bg-purple-500';
      case 'resource:added':
        return 'bg-indigo-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-sm w-full bg-white rounded-lg shadow-lg border-l-4 ${getColor(notification.type)} transform transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-2xl">{getIcon(notification.type)}</span>
          </div>
          <div className="ml-3 flex-1">
            <h4 className="text-sm font-medium text-gray-900">
              {notification.title}
            </h4>
            <p className="mt-1 text-sm text-gray-600">
              {notification.message}
            </p>
            {notification.data && (
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
              onClick={() => {
                setIsVisible(false);
                setTimeout(onClose, 300);
              }}
              className="inline-flex text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              <span className="sr-only">Close</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationToast;




