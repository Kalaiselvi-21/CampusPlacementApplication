import React, { useMemo } from "react";
import {
  ArrowLeft,
  ArrowRightCircle,
  Bell,
  BellRing,
  Briefcase,
  CheckCircle,
  Folder,
  Trophy,
} from "lucide-react";

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
    // Legacy
    case "placed":
      return Trophy;
    case "spoc_department":
      return BellRing;
    default:
      return Bell;
  }
};

const safeJson = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
};

const formatDateTime = (dateValue) => {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const Field = ({ label, value }) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="text-sm text-gray-900 text-right whitespace-pre-line break-words">
        {String(value)}
      </div>
    </div>
  );
};

const NotificationDetails = ({ notification, onBack, onMarkRead }) => {
  const isRead = Boolean(notification?.is_read ?? notification?.isRead);
  const createdAt = notification?.created_at || notification?.createdAt;
  const meta = useMemo(
    () => safeJson(notification?.metadata) || safeJson(notification?.meta) || {},
    [notification?.metadata, notification?.meta]
  );

  const Icon = useMemo(() => iconForType(notification?.type), [notification?.type]);

  const company = meta.company || meta.companyName || meta.company_name;
  const role = meta.role || meta.jobRole || meta.job_role;
  const driveName = meta.drive_name || meta.driveName;
  const pkg = meta.package || meta.ctc;
  const joiningDetails = meta.joining_details || meta.joiningDetails;
  const nextRoundDeadline = meta.next_round_deadline || meta.nextRoundDeadline;
  const round = meta.round;
  const instructions = meta.round_instructions || meta.instructions || meta.details;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back
        </button>

        {!isRead && (
          <button
            type="button"
            onClick={() => onMarkRead(notification.id)}
            className="text-xs px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200"
          >
            Mark as read
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex gap-3 items-start">
          <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-gray-700" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold text-gray-900 break-words">{notification.title}</div>
            <div className="mt-1 text-xs text-gray-500">{formatDateTime(createdAt)}</div>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-xl bg-white border border-gray-100">
          <div className="text-xs font-medium text-gray-500">Message</div>
          <div className="mt-1 text-sm text-gray-900 whitespace-pre-line break-words">
            {notification.message}
          </div>
        </div>

        <div className="mt-4 p-3 rounded-xl bg-white border border-gray-100">
          <div className="text-xs font-medium text-gray-500">Details</div>
          <div className="mt-2">
            <Field label="Company" value={company} />
            <Field label="Job Role" value={role} />
            <Field label="Drive Name" value={driveName} />
            <Field label="Package" value={pkg} />
            <Field label="Round" value={round} />
            <Field label="Next Round Deadline" value={nextRoundDeadline} />
            <Field label="Round Instructions" value={instructions} />
            <Field label="Joining Details" value={joiningDetails} />
          </div>
        </div>

      </div>
    </div>
  );
};

export default NotificationDetails;
