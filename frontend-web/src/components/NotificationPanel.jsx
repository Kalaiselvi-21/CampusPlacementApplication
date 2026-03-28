import React, { useEffect, useMemo, useState } from "react";
import { useNotifications } from "../contexts/NotificationsContext";
import { useAuth } from "../contexts/AuthContext";
import NotificationListItem from "./NotificationListItem";
import NotificationTabs from "./NotificationTabs";
import NotificationDetails from "./NotificationDetails";

const NotificationPanel = () => {
  const { user } = useAuth();
  const { notifications, panelOpen, closePanel, markRead, markAllRead, loading, isPR, isPO } =
    useNotifications();

  const [activeTab, setActiveTab] = useState("drives");
  const [activeFileTab, setActiveFileTab] = useState("spoc");
  const [selected, setSelected] = useState(null);

  const fileFlowTypes = useMemo(
    () => new Set([
      "file_upload_deadline",
      "file_upload_reminder",
      "file_upload_closed",
      "file_submitted",
      "file_not_submitted",
      "box_upload_enabled",
      "box_upload_closed",
      "box_resubmission_required",
    ]),
    []
  );

  const poFileTabs = useMemo(
    () => [
      { key: "spoc", label: "SPOC" },
      { key: "expenditure", label: "Expenditure" },
      { key: "box", label: "BOX" },
    ],
    []
  );

  useEffect(() => {
    if (!panelOpen) {
      setActiveTab(isPO ? "po" : "drives");
      setActiveFileTab("spoc");
      setSelected(null);
    }
  }, [panelOpen, isPO]);

  useEffect(() => {
    if (!panelOpen) return;
    if (isPO) {
      setActiveTab("po");
      return;
    }
    setActiveTab("drives");
  }, [panelOpen, isPO]);

  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panelOpen, closePanel]);

  useEffect(() => {
    if (!selected?.id) return;
    const next = notifications.find((n) => String(n.id) === String(selected.id));
    if (next) setSelected(next);
  }, [notifications, selected?.id]);

  const filtered = useMemo(() => {
    const parseMeta = (n) => {
      const raw = n?.metadata ?? n?.meta;
      if (!raw) return {};
      if (typeof raw === "object") return raw;
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw);
        } catch {
          return {};
        }
      }
      return {};
    };

    const detectFileType = (n) => {
      const type = String(n?.type || "").toLowerCase();
      const title = String(n?.title || "").toLowerCase();
      const meta = parseMeta(n);
      const metaFileType = String(meta?.fileType || meta?.file_type || "").toLowerCase();

      if (["spoc", "expenditure", "box"].includes(metaFileType)) return metaFileType;
      if (type.includes("box") || title.includes("box")) return "box";
      if (title.includes("expenditure")) return "expenditure";
      if (title.includes("spoc")) return "spoc";
      return "";
    };

    const isPOMessage = (n) => {
      const type = String(n?.type || "");
      return fileFlowTypes.has(type) || ["spoc_assignment", "spoc_department"].includes(type);
    };

    if (isPO) {
      const poItems = notifications.filter(isPOMessage);
      return poItems.filter((n) => {
        const fileType = detectFileType(n);
        if (!fileType) return false;
        return fileType === activeFileTab;
      });
    }

    if (isPR) {
      if (activeTab === "po") {
        return notifications.filter(isPOMessage);
      }
      return notifications.filter((n) => !isPOMessage(n));
    }

    return notifications;
  }, [notifications, isPR, isPO, activeTab, activeFileTab, fileFlowTypes]);

  const topTabs = useMemo(
    () => [
      { key: "drives", label: "Drives" },
      { key: "po", label: "PO Messages" },
    ],
    []
  );

  const backdropClass =
    "fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm transition-opacity duration-300 " +
    (panelOpen ? "opacity-100" : "opacity-0 pointer-events-none");
  const panelClass =
    "fixed top-0 right-0 z-[70] h-full w-[360px] max-w-[92vw] bg-white shadow-2xl border-l border-gray-200 transform transition-transform duration-300 " +
    (panelOpen ? "translate-x-0" : "translate-x-full pointer-events-none");

  return (
    <>
      <div className={backdropClass} onClick={panelOpen ? closePanel : undefined} />

      <aside className={panelClass} aria-hidden={!panelOpen}>
        <div className="h-full flex flex-col">
          <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-lg font-bold text-gray-900">Notifications</div>
              <div className="text-xs text-gray-500 truncate">
                {user?.profile?.name || user?.email || ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200"
              >
                Mark all read
              </button>
              <button
                type="button"
                onClick={closePanel}
                className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600"
                aria-label="Close notifications"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {panelOpen && (isPR || isPO) && !selected && (
            <div className="px-4 pt-3">
              {isPR && (
                <NotificationTabs activeTab={activeTab} onChange={setActiveTab} tabs={topTabs} />
              )}

              {isPO && (
                <div className="mt-2">
                  <NotificationTabs
                    activeTab={activeFileTab}
                    onChange={setActiveFileTab}
                    tabs={poFileTabs}
                  />
                </div>
              )}
            </div>
          )}

          {!selected ? (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {loading && <div className="text-sm text-gray-500">Loading notifications...</div>}

              {!loading && filtered.length === 0 && (
                <div className="text-sm text-gray-500">No notifications yet.</div>
              )}

              {filtered.map((n) => (
                <NotificationListItem
                  key={n.id}
                  notification={n}
                  onClick={() => {
                    const isRead = Boolean(n.is_read ?? n.isRead);
                    if (!isRead) {
                      // Mark as read on view so unread dot disappears after opening details.
                      markRead(n.id);
                      setSelected({ ...n, is_read: true, isRead: true });
                      return;
                    }
                    setSelected(n);
                  }}
                />
              ))}
            </div>
          ) : (
            <NotificationDetails
              notification={selected}
              onBack={() => setSelected(null)}
              onMarkRead={markRead}
            />
          )}
        </div>
      </aside>
    </>
  );
};

export default NotificationPanel;
