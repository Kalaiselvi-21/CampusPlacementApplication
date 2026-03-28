import React from "react";

const tabBase =
  "px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200";

const NotificationTabs = ({ activeTab, onChange, tabs = [] }) => {
  const safeTabs = Array.isArray(tabs) && tabs.length > 0
    ? tabs
    : [
        { key: "drives", label: "Drives" },
        { key: "po", label: "PO Messages" },
      ];

  return (
    <div className="flex gap-2 bg-gray-50 p-1 rounded-lg border border-gray-100">
      {safeTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`${tabBase} ${
            activeTab === tab.key
              ? "bg-white text-gray-900 shadow-sm border border-gray-200"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default NotificationTabs;

