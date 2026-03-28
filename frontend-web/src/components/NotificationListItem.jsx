import React, { useMemo } from "react";
import {
  AlertCircle,
  ArrowRightCircle,
  Bell,
  BellRing,
  Briefcase,
  CheckCircle,
  Folder,
  Trophy,
} from "lucide-react";

const toRelativeTime = (dateValue) => {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const iconForType = (type) => {
  switch (String(type || "")) {
    case "drive_created":
      return Briefcase;
    case "round_selected":
      return ArrowRightCircle;
    case "final_round_cleared":
      return CheckCircle;
    case "placement_success":
      return Trophy;
    case "resource_uploaded":
      return Folder;
    case "spoc_assignment":
      return BellRing;
    case "file_submitted":
      return CheckCircle;
    case "file_not_submitted":
      return AlertCircle;
    case "file_upload_deadline":
    case "file_upload_reminder":
      return BellRing;
    case "file_upload_closed":
      return AlertCircle;
    case "box_upload_enabled":
      return BellRing;
    case "box_upload_closed":
    case "box_resubmission_required":
      return AlertCircle;
    // Legacy
    case "placed":
      return Trophy;
    case "spoc_department":
      return BellRing;
    default:
      return Bell;
  }
};

const accentForType = (type) => {
  switch (String(type || "")) {
    case "placement_success":
    case "placed":
      return "text-green-700 bg-green-50";
    case "drive_created":
      return "text-blue-700 bg-blue-50";
    case "round_selected":
      return "text-orange-700 bg-orange-50";
    case "final_round_cleared":
      return "text-emerald-700 bg-emerald-50";
    case "resource_uploaded":
      return "text-purple-700 bg-purple-50";
    case "spoc_assignment":
    case "spoc_department":
      return "text-rose-700 bg-rose-50";
    case "file_submitted":
      return "text-green-700 bg-green-50";
    case "file_not_submitted":
      return "text-red-700 bg-red-50";
    case "file_upload_deadline":
    case "file_upload_reminder":
      return "text-amber-700 bg-amber-50";
    case "file_upload_closed":
      return "text-red-700 bg-red-50";
    case "box_upload_enabled":
      return "text-indigo-700 bg-indigo-50";
    case "box_upload_closed":
    case "box_resubmission_required":
      return "text-red-700 bg-red-50";
    default:
      return "text-gray-700 bg-gray-50";
  }
};

const parseMeta = (notification) => {
  const raw = notification?.metadata ?? notification?.meta;
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

const prettifyFileType = (fileType) => {
  const normalized = String(fileType || "").toLowerCase();
  if (normalized === "spoc") return "SPOC";
  if (normalized === "expenditure") return "Expenditure";
  if (normalized === "box") return "BOX";
  return "File";
};

const getDisplayTitle = (notification) => {
  const type = String(notification?.type || "").toLowerCase();
  const title = String(notification?.title || "").trim();
  const meta = parseMeta(notification);
  const department = meta?.department ? String(meta.department).trim() : "";
  const fileType = prettifyFileType(meta?.fileType || meta?.file_type);

  if (type === "file_submitted") {
    const status = meta?.withinDeadline === false ? "(Late)" : "(Within Deadline)";
    return `${department || "Department"} - ${fileType} Submitted ${status}`;
  }

  if (type === "file_not_submitted") {
    return `${department || "Department"} - ${fileType} Not Submitted`;
  }

  if (type === "box_resubmission_required") {
    return `${department || "Department"} - BOX Resubmission Required`;
  }

  return title || "Notification";
};

const getAccent = (notification) => {
  const type = String(notification?.type || "");
  if (type === "file_submitted") {
    const meta = parseMeta(notification);
    if (meta?.withinDeadline === false) return "text-orange-700 bg-orange-50";
    return "text-green-700 bg-green-50";
  }
  return accentForType(type);
};

const NotificationListItem = ({ notification, onClick }) => {
  const isRead = Boolean(notification.is_read ?? notification.isRead);
  const createdAt = notification.created_at || notification.createdAt;

  const Icon = useMemo(() => iconForType(notification.type), [notification.type]);
  const accent = useMemo(() => getAccent(notification), [notification]);
  const displayTitle = useMemo(() => getDisplayTitle(notification), [notification]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-colors ${
        isRead ? "bg-white border-gray-100" : "bg-violet-50/40 border-violet-200"
      } hover:bg-gray-50`}
    >
      <div className="flex gap-3 items-start">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent} shrink-0`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {displayTitle}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {toRelativeTime(createdAt)}
              </div>
            </div>

            {!isRead && (
              <span
                className="mt-1 inline-flex w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0"
                aria-label="Unread"
              />
            )}
          </div>
        </div>
      </div>
    </button>
  );
};

export default NotificationListItem;
