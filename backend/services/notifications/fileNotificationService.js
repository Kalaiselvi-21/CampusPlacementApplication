const neonService = require("../database/neonService");
const notificationService = require("./notificationService");

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_INTERVAL_DAYS = 5;
const DEFAULT_CHECK_INTERVAL_MS = Number(process.env.FILE_NOTIFICATION_CHECK_INTERVAL_MS || 60 * 60 * 1000);

const STATUS_PENDING = "pending";
const STATUS_SENT = "sent";
const STATUS_STOPPED = "stopped";

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const isPRRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === "placement_representative" || normalized === "pr";
};

const isPORole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === "po" || normalized === "placement_officer" || normalized === "admin";
};

const formatDate = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toISOString().slice(0, 10);
};

const addDays = (dateValue, days) => {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date;
};

const toIso = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const shouldSendReminder = (lastSentAt, now = new Date()) => {
  if (!lastSentAt) return true;
  const last = new Date(lastSentAt);
  if (Number.isNaN(last.getTime())) return true;
  return now.getTime() - last.getTime() >= REMINDER_INTERVAL_DAYS * DAY_MS;
};

const getBoxUploadSettings = async () => {
  const rows = await neonService.executeRawQuery(
    `
    SELECT setting_name, value
    FROM settings
    WHERE setting_name IN ('boxFileUploadEnabled', 'boxFileUploadDeadline')
    `
  );

  const map = new Map(rows.map((row) => [row.setting_name, row.value]));
  return {
    enabled: map.get("boxFileUploadEnabled") === "true",
    deadlineAt: map.get("boxFileUploadDeadline") || null,
  };
};

const fetchPOUserIds = async () => {
  const rows = await neonService.executeRawQuery(
    `
    SELECT id
    FROM users
    WHERE LOWER(REPLACE(role, ' ', '_')) IN ('po', 'placement_officer', 'admin')
    `
  );
  return rows.map((row) => row.id);
};

const fetchPRUsers = async (department = null) => {
  if (department) {
    const rows = await neonService.executeRawQuery(
      `
      SELECT u.id, up.department
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE LOWER(REPLACE(u.role, ' ', '_')) IN ('placement_representative', 'pr')
        AND LOWER(COALESCE(up.department, '')) = LOWER($1)
      `,
      [department]
    );
    return rows;
  }

  return neonService.executeRawQuery(
    `
    SELECT u.id, up.department
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE LOWER(REPLACE(u.role, ' ', '_')) IN ('placement_representative', 'pr')
    `
  );
};

const emitRealtime = (io, userIds, type) => {
  if (!io || !Array.isArray(userIds)) return;
  userIds.forEach((id) => {
    if (id) io.to(`user:${id}`).emit("notification:new", { type });
  });
};

const createNotificationsForUsers = async ({ userIds, type, title, message, metadata = {}, io = null }) => {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  if (ids.length === 0) return { inserted: 0 };

  const result = await notificationService.createForUserIds({
    userIds: ids,
    type,
    title,
    message,
    metadata,
  });

  emitRealtime(io, ids, type);
  return result;
};

const ensureSchema = async () => {
  await neonService.executeRawQuery(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

  await neonService.executeRawQuery(`
    CREATE TABLE IF NOT EXISTS settings (
      setting_name TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await neonService.executeRawQuery(`
    CREATE TABLE IF NOT EXISTS file_notification_state (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_kind VARCHAR(30) NOT NULL,
      entity_key TEXT NOT NULL UNIQUE,
      job_drive_id UUID,
      pr_user_id UUID,
      department TEXT,
      file_type VARCHAR(30) NOT NULL,
      deadline_at TIMESTAMP,
      notification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      last_notification_sent TIMESTAMP,
      is_submitted BOOLEAN NOT NULL DEFAULT FALSE,
      is_deleted_by_po BOOLEAN NOT NULL DEFAULT FALSE,
      resubmission_required BOOLEAN NOT NULL DEFAULT FALSE,
      po_deadline_notified BOOLEAN NOT NULL DEFAULT FALSE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await neonService.executeRawQuery(`
    CREATE INDEX IF NOT EXISTS idx_file_notify_entity_kind_status
    ON file_notification_state (entity_kind, file_type, notification_status)
  `);

  await neonService.executeRawQuery(`
    CREATE INDEX IF NOT EXISTS idx_file_notify_drive_department
    ON file_notification_state (job_drive_id, department, file_type)
  `);
};

const getStateByKey = async (entityKey) => {
  const rows = await neonService.executeRawQuery(
    `SELECT * FROM file_notification_state WHERE entity_key = $1 LIMIT 1`,
    [entityKey]
  );
  return rows[0] || null;
};

const upsertState = async ({
  entityKind,
  entityKey,
  jobDriveId = null,
  prUserId = null,
  department = null,
  fileType,
  deadlineAt = null,
  notificationStatus = STATUS_PENDING,
  lastNotificationSent = null,
  isSubmitted = false,
  isDeletedByPO = false,
  resubmissionRequired = false,
  poDeadlineNotified = false,
  metadata = {},
}) => {
  const rows = await neonService.executeRawQuery(
    `
    INSERT INTO file_notification_state (
      entity_kind,
      entity_key,
      job_drive_id,
      pr_user_id,
      department,
      file_type,
      deadline_at,
      notification_status,
      last_notification_sent,
      is_submitted,
      is_deleted_by_po,
      resubmission_required,
      po_deadline_notified,
      metadata,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW(), NOW())
    ON CONFLICT (entity_key) DO UPDATE
    SET
      job_drive_id = EXCLUDED.job_drive_id,
      pr_user_id = EXCLUDED.pr_user_id,
      department = EXCLUDED.department,
      file_type = EXCLUDED.file_type,
      deadline_at = EXCLUDED.deadline_at,
      notification_status = EXCLUDED.notification_status,
      last_notification_sent = EXCLUDED.last_notification_sent,
      is_submitted = EXCLUDED.is_submitted,
      is_deleted_by_po = EXCLUDED.is_deleted_by_po,
      resubmission_required = EXCLUDED.resubmission_required,
      po_deadline_notified = EXCLUDED.po_deadline_notified,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING *
    `,
    [
      entityKind,
      entityKey,
      jobDriveId,
      prUserId,
      department,
      fileType,
      deadlineAt,
      notificationStatus,
      lastNotificationSent,
      isSubmitted,
      isDeletedByPO,
      resubmissionRequired,
      poDeadlineNotified,
      JSON.stringify(metadata || {}),
    ]
  );

  return rows[0] || null;
};

const getFirstRoundDate = async (driveId, fallbackDriveDate = null) => {
  let rows = [];
  try {
    rows = await neonService.executeRawQuery(
      `
      SELECT round_date
      FROM selection_rounds
      WHERE job_drive_id = $1 AND round_date IS NOT NULL
      ORDER BY round_order ASC NULLS LAST, round_date ASC
      LIMIT 1
      `,
      [driveId]
    );
  } catch (error) {
    rows = [];
  }

  if (rows[0]?.round_date) return rows[0].round_date;
  return fallbackDriveDate;
};

const getLastRoundInfo = async (driveId) => {
  try {
    const rows = await neonService.executeRawQuery(
      `
      SELECT round_date, round_time, status
      FROM selection_rounds
      WHERE job_drive_id = $1
      ORDER BY round_order DESC NULLS LAST, round_date DESC NULLS LAST
      LIMIT 1
      `,
      [driveId]
    );

    const row = rows[0];
    if (!row) return null;
    return {
      roundDate: row.round_date || null,
      roundTime: row.round_time || null,
      status: row.status || null,
    };
  } catch (error) {
    return null;
  }
};

const toYmd = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const toHms = (value, fallback = "23:59:59") => {
  if (!value) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;

  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;

  const parsed = raw.split(":").map((x) => Number(x));
  if (parsed.length >= 2 && parsed.every((n) => !Number.isNaN(n))) {
    const hh = String(Math.min(Math.max(parsed[0], 0), 23)).padStart(2, "0");
    const mm = String(Math.min(Math.max(parsed[1], 0), 59)).padStart(2, "0");
    const ss = String(Math.min(Math.max(parsed[2] || 0, 0), 59)).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  return fallback;
};

const getNowIstNaive = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const read = (type) => parts.find((p) => p.type === type)?.value || "00";
  return new Date(`${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}:${read("second")}`);
};

const toNaiveDateTime = (dateValue, timeValue) => {
  const ymd = toYmd(dateValue);
  if (!ymd) return null;
  const hms = toHms(timeValue);
  const dt = new Date(`${ymd}T${hms}`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

const getDriveInfo = async (driveId) => {
  const rows = await neonService.executeRawQuery(
    `
    SELECT
      jd.id,
      jd.company_name,
      jd.role,
      jd.drive_date,
      jd.drive_time,
      jd.spoc_dept,
      jd.eligibility_allowed_departments,
      jd.created_by,
      up.department AS creator_department
    FROM job_drives jd
    LEFT JOIN user_profiles up ON up.user_id = jd.created_by
    WHERE jd.id = $1
    LIMIT 1
    `,
    [driveId]
  );

  const row = rows[0];
  if (!row) return null;

  const allowedDepartments = Array.isArray(row.eligibility_allowed_departments)
    ? row.eligibility_allowed_departments
    : [];

  const departments = [];
  if (row.spoc_dept) departments.push(String(row.spoc_dept).trim());
  for (const dept of allowedDepartments) {
    if (dept) departments.push(String(dept).trim());
  }
  if (row.creator_department) departments.push(String(row.creator_department).trim());

  const uniqueDepartments = Array.from(new Set(departments.filter(Boolean)));
  const department = uniqueDepartments[0] || null;
  const firstRoundDate = await getFirstRoundDate(row.id, row.drive_date);
    const lastRoundInfo = await getLastRoundInfo(row.id);
  const deadlineAt = firstRoundDate ? addDays(firstRoundDate, 30) : null;

  return {
    id: row.id,
    companyName: row.company_name,
    role: row.role,
    driveDate: row.drive_date,
    driveTime: row.drive_time,
    departments: uniqueDepartments,
    department,
    firstRoundDate,
      lastRoundInfo,
    deadlineAt,
  };
};

const isDriveEnded = (driveInfo) => {
    const now = getNowIstNaive();
    if (!now || Number.isNaN(now.getTime())) return false;

    const roundStatus = String(driveInfo?.lastRoundInfo?.status || "")
      .trim()
      .toLowerCase();
    if (roundStatus === "completed") return true;

    const roundEnd = toNaiveDateTime(driveInfo?.lastRoundInfo?.roundDate, driveInfo?.lastRoundInfo?.roundTime);
    if (roundEnd) return now > roundEnd;

    const driveEnd = toNaiveDateTime(driveInfo?.driveDate, driveInfo?.driveTime);
    if (driveEnd) return now > driveEnd;

    return false;
};

const getDriveEntityKey = ({ driveId, department, fileType, prUserId }) =>
  `drive:${driveId}:${department || "NA"}:${fileType}:${prUserId || "ALL"}`;

const getBoxEntityKey = ({ prUserId, department }) =>
  `box:${prUserId || "NA"}:${department || "NA"}`;

const onDriveComplete = async ({ driveId, io = null }) => {
  if (!driveId) return;

  await ensureSchema();
  const drive = await getDriveInfo(driveId);
  if (!drive) return;

  const targetDepartments = Array.isArray(drive.departments) && drive.departments.length > 0
    ? drive.departments
    : [drive.department].filter(Boolean);

  const useDepartmentRouting = targetDepartments.length > 0;
  const allPRUsers = useDepartmentRouting ? [] : await fetchPRUsers();
  if (!useDepartmentRouting && allPRUsers.length === 0) return;

  const fileTypes = ["spoc", "expenditure"];
  for (const fileType of fileTypes) {
    const routingBuckets = useDepartmentRouting
      ? targetDepartments.map((department) => ({ department, prUsers: null }))
      : [{ department: null, prUsers: allPRUsers }];

    for (const bucket of routingBuckets) {
      const department = bucket.department;
      const prUsers = bucket.prUsers || (await fetchPRUsers(department));
      if (!prUsers.length) continue;

      const notifyIds = [];
      for (const pr of prUsers) {
        const targetDepartment = department || pr.department || null;
        const entityKey = getDriveEntityKey({
          driveId,
          department: targetDepartment,
          fileType,
          prUserId: pr.id,
        });

        const existing = await getStateByKey(entityKey);
        if (existing) continue;

        await upsertState({
          entityKind: "drive_file",
          entityKey,
          jobDriveId: driveId,
          prUserId: pr.id,
          department: targetDepartment,
          fileType,
          deadlineAt: toIso(drive.deadlineAt),
          notificationStatus: STATUS_SENT,
          lastNotificationSent: new Date().toISOString(),
          isSubmitted: false,
          metadata: {
            driveId,
            driveName: [drive.companyName, drive.role].filter(Boolean).join(" - "),
            department: targetDepartment,
          },
        });

        notifyIds.push(pr.id);
      }

      if (notifyIds.length > 0) {
        const titlePrefix = department || "Department";
        const title = `${titlePrefix} - ${fileType.toUpperCase()} Submission Required`;
        const message = `Upload ${fileType.toUpperCase()} file before ${formatDate(drive.deadlineAt)} for ${drive.companyName}${
          drive.role ? ` - ${drive.role}` : ""
        }.`;

        await createNotificationsForUsers({
          userIds: notifyIds,
          type: "file_upload_deadline",
          title,
          message,
          metadata: {
            driveId,
            fileType,
            deadline: toIso(drive.deadlineAt),
            department,
          },
          io,
        });
      }
    }
  }
};

const bootstrapCompletedDriveNotifications = async (io = null) => {
  const rows = await neonService.executeRawQuery(
    `
    SELECT id
    FROM job_drives
    WHERE COALESCE(is_active, TRUE) = FALSE
       OR drive_date <= (CURRENT_DATE + INTERVAL '1 day')
    `
  );

  for (const row of rows) {
    const driveId = row?.id;
    if (!driveId) continue;

    const driveInfo = await getDriveInfo(driveId);
    if (!driveInfo || !isDriveEnded(driveInfo)) continue;

    await onDriveComplete({ driveId, io });
  }
};

const onDriveFileUpload = async ({ jobDriveId, fileType, uploaderId, department = null, io = null }) => {
  if (!jobDriveId || !fileType) return;

  await ensureSchema();
  const drive = await getDriveInfo(jobDriveId);
  if (!drive) return;

  const effectiveDepartment = department || drive.department;

  await neonService.executeRawQuery(
    `
    UPDATE file_notification_state
    SET
      is_submitted = TRUE,
      notification_status = $1,
      resubmission_required = FALSE,
      is_deleted_by_po = FALSE,
      updated_at = NOW()
    WHERE entity_kind = 'drive_file'
      AND job_drive_id = $2
      AND file_type = $3
      AND LOWER(COALESCE(department, '')) = LOWER(COALESCE($4, department))
    `,
    [STATUS_STOPPED, jobDriveId, fileType, effectiveDepartment]
  );

  const poUserIds = await fetchPOUserIds();
  if (poUserIds.length === 0) return;

  const withinDeadline = drive.deadlineAt ? new Date() <= new Date(drive.deadlineAt) : true;

  await createNotificationsForUsers({
    userIds: poUserIds,
    type: "file_submitted",
      title: `${effectiveDepartment || "Department"} - ${fileType.toUpperCase()} Submitted`,
    message: `${fileType.toUpperCase()} file for ${drive.companyName}${
      drive.role ? ` - ${drive.role}` : ""
    } submitted by ${effectiveDepartment || "department"} ${withinDeadline ? "within deadline" : "after deadline"}.`,
    metadata: {
      driveId: jobDriveId,
      fileType,
      department: effectiveDepartment,
      uploaderId,
      withinDeadline,
    },
    io,
  });
};

const onBoxEnable = async ({ deadlineAt = null, io = null }) => {
  await ensureSchema();

  const prUsers = await fetchPRUsers();
  if (!prUsers.length) return;

  const notifyIds = [];
  for (const pr of prUsers) {
    const entityKey = getBoxEntityKey({ prUserId: pr.id, department: pr.department });

    await upsertState({
      entityKind: "box_file",
      entityKey,
      prUserId: pr.id,
      department: pr.department || null,
      fileType: "box",
      deadlineAt: deadlineAt ? toIso(deadlineAt) : null,
      notificationStatus: STATUS_SENT,
      lastNotificationSent: new Date().toISOString(),
      isSubmitted: false,
      isDeletedByPO: false,
      resubmissionRequired: false,
      poDeadlineNotified: false,
      metadata: {
        reason: "po_enabled_box_upload",
      },
    });

    notifyIds.push(pr.id);
  }

  await createNotificationsForUsers({
    userIds: notifyIds,
    type: "box_upload_enabled",
    title: "BOX Upload Enabled",
    message: `Upload BOX file before ${deadlineAt ? formatDate(deadlineAt) : "deadline"}.`,
    metadata: {
      deadline: deadlineAt ? toIso(deadlineAt) : null,
    },
    io,
  });
};

const notifyPOMissingBoxSubmissions = async (io = null) => {
  const poUserIds = await fetchPOUserIds();
  if (!poUserIds.length) return;

  const missingRows = await neonService.executeRawQuery(
    `
    SELECT DISTINCT department
    FROM file_notification_state
    WHERE entity_kind = 'box_file'
      AND file_type = 'box'
      AND is_submitted = FALSE
      AND notification_status IN ('pending', 'sent')
      AND COALESCE(department, '') <> ''
    `
  );

  for (const row of missingRows) {
    await createNotificationsForUsers({
      userIds: poUserIds,
      type: "file_not_submitted",
        title: `${row.department || "Department"} - BOX Not Submitted`,
      message: `BOX file NOT submitted by ${row.department}.`,
      metadata: {
        fileType: "box",
        department: row.department,
      },
      io,
    });
  }
};

const onBoxDisable = async ({ io = null }) => {
  await ensureSchema();

  const prRows = await fetchPRUsers();
  const prIds = prRows.map((row) => row.id).filter(Boolean);

  if (prIds.length > 0) {
    await createNotificationsForUsers({
      userIds: prIds,
      type: "box_upload_closed",
      title: "BOX Upload Closed",
      message: "BOX upload is now closed.",
      metadata: {
        fileType: "box",
      },
      io,
    });
  }

  await notifyPOMissingBoxSubmissions(io);

  await neonService.executeRawQuery(
    `
    UPDATE file_notification_state
    SET notification_status = $1, updated_at = NOW()
    WHERE entity_kind = 'box_file'
      AND file_type = 'box'
      AND notification_status IN ('pending', 'sent')
    `,
    [STATUS_STOPPED]
  );
};

const onBoxFileUpload = async ({ prUserId, department = null, batch = null, io = null }) => {
  await ensureSchema();

  const entityKey = getBoxEntityKey({ prUserId, department });
  const existing = await getStateByKey(entityKey);

  await upsertState({
    entityKind: "box_file",
    entityKey,
    prUserId,
    department,
    fileType: "box",
    deadlineAt: existing?.deadline_at || null,
    notificationStatus: STATUS_STOPPED,
    lastNotificationSent: existing?.last_notification_sent || null,
    isSubmitted: true,
    isDeletedByPO: false,
    resubmissionRequired: false,
    poDeadlineNotified: existing?.po_deadline_notified || false,
    metadata: {
      batch,
      ...(existing?.metadata || {}),
    },
  });

  const poUserIds = await fetchPOUserIds();
  if (poUserIds.length === 0) return;

  const deadlineAt = existing?.deadline_at ? new Date(existing.deadline_at) : null;
  const withinDeadline = deadlineAt ? new Date() <= deadlineAt : true;

  await createNotificationsForUsers({
    userIds: poUserIds,
    type: "file_submitted",
    title: `${department || "Department"} - BOX Submitted`,
    message: `BOX file submitted by ${department || "department"} ${withinDeadline ? "within deadline" : "after deadline"}.`,
    metadata: {
      fileType: "box",
      department,
      prUserId,
      batch,
      withinDeadline,
    },
    io,
  });
};

const onBoxDeleteByPO = async ({ prUserId, department = null, batch = null, io = null }) => {
  await ensureSchema();

  const settings = await getBoxUploadSettings();
  const entityKey = getBoxEntityKey({ prUserId, department });
  const existing = await getStateByKey(entityKey);

  await upsertState({
    entityKind: "box_file",
    entityKey,
    prUserId,
    department,
    fileType: "box",
    deadlineAt: existing?.deadline_at || settings.deadlineAt || null,
    notificationStatus: STATUS_SENT,
    lastNotificationSent: new Date().toISOString(),
    isSubmitted: false,
    isDeletedByPO: true,
    resubmissionRequired: true,
    poDeadlineNotified: false,
    metadata: {
      batch,
      reason: "deleted_by_po",
      ...(existing?.metadata || {}),
    },
  });

  if (prUserId) {
    await createNotificationsForUsers({
      userIds: [prUserId],
      type: "box_resubmission_required",
      title: "BOX File Removed by PO",
      message: "Your BOX file has been removed by PO. Please upload the BOX file again before deadline.",
      metadata: {
        fileType: "box",
        department,
        prUserId,
        batch,
      },
      io,
    });
  }
};

const processDriveFileReminderCycle = async (io = null) => {
  const rows = await neonService.executeRawQuery(
    `
    SELECT *
    FROM file_notification_state
    WHERE entity_kind = 'drive_file'
      AND file_type IN ('spoc', 'expenditure')
      AND is_submitted = FALSE
      AND notification_status IN ('pending', 'sent')
    `
  );

  const now = new Date();
  for (const row of rows) {
    const deadline = row.deadline_at ? new Date(row.deadline_at) : null;

    if (deadline && now > deadline) {
      if (row.pr_user_id) {
        await createNotificationsForUsers({
          userIds: [row.pr_user_id],
          type: "file_upload_closed",
          title: `${row.department || "Department"} - ${String(row.file_type).toUpperCase()} Upload Closed`,
          message: `${String(row.file_type).toUpperCase()} upload window is closed for this drive because deadline passed.`,
          metadata: {
            driveId: row.job_drive_id,
            fileType: row.file_type,
            department: row.department,
            deadlinePassed: true,
          },
          io,
        });
      }

      if (!row.po_deadline_notified) {
        const drive = await getDriveInfo(row.job_drive_id);
        const poUserIds = await fetchPOUserIds();

        if (poUserIds.length > 0) {
          await createNotificationsForUsers({
            userIds: poUserIds,
            type: "file_not_submitted",
            title: `${row.department || "Department"} - ${String(row.file_type).toUpperCase()} Not Submitted`,
            message: `${String(row.file_type).toUpperCase()} file for ${drive?.companyName || "job drive"}${
              drive?.role ? ` - ${drive.role}` : ""
            } NOT submitted by ${row.department || "department"}.`,
            metadata: {
              driveId: row.job_drive_id,
              fileType: row.file_type,
              department: row.department,
            },
            io,
          });
        }
      }

      await neonService.executeRawQuery(
        `
        UPDATE file_notification_state
        SET
          notification_status = $1,
          po_deadline_notified = TRUE,
          updated_at = NOW()
        WHERE id = $2
        `,
        [STATUS_STOPPED, row.id]
      );
      continue;
    }

    if (!shouldSendReminder(row.last_notification_sent, now)) continue;

    const reminderMessage = `Reminder: Upload ${String(row.file_type).toUpperCase()} file before ${formatDate(
      row.deadline_at
    )}.`;

    const targetIds = row.pr_user_id ? [row.pr_user_id] : [];
    if (targetIds.length > 0) {
      await createNotificationsForUsers({
        userIds: targetIds,
        type: "file_upload_reminder",
        title: `${String(row.file_type).toUpperCase()} File Reminder`,
        message: reminderMessage,
        metadata: {
          driveId: row.job_drive_id,
          fileType: row.file_type,
          department: row.department,
        },
        io,
      });

      await neonService.executeRawQuery(
        `
        UPDATE file_notification_state
        SET
          notification_status = $1,
          last_notification_sent = NOW(),
          updated_at = NOW()
        WHERE id = $2
        `,
        [STATUS_SENT, row.id]
      );
    }
  }
};

const processBoxReminderCycle = async (io = null) => {
  const settings = await getBoxUploadSettings();
  if (!settings.enabled) return;

  const rows = await neonService.executeRawQuery(
    `
    SELECT *
    FROM file_notification_state
    WHERE entity_kind = 'box_file'
      AND file_type = 'box'
      AND is_submitted = FALSE
      AND notification_status IN ('pending', 'sent')
    `
  );

  const now = new Date();
  for (const row of rows) {
    const deadline = row.deadline_at ? new Date(row.deadline_at) : null;

    if (deadline && now > deadline) {
      if (!row.po_deadline_notified) {
        const poUserIds = await fetchPOUserIds();
        if (poUserIds.length > 0) {
          await createNotificationsForUsers({
            userIds: poUserIds,
            type: "file_not_submitted",
            title: `${row.department || "Department"} - BOX Not Submitted`,
            message: `BOX file NOT submitted by ${row.department || "department"}.`,
            metadata: {
              fileType: "box",
              department: row.department,
            },
            io,
          });
        }
      }

      await neonService.executeRawQuery(
        `
        UPDATE file_notification_state
        SET
          notification_status = $1,
          po_deadline_notified = TRUE,
          updated_at = NOW()
        WHERE id = $2
        `,
        [STATUS_STOPPED, row.id]
      );
      continue;
    }

    if (!shouldSendReminder(row.last_notification_sent, now)) continue;

    const reminderMessage = row.resubmission_required
      ? `Reminder: Your BOX file requires resubmission. Upload again before ${
          row.deadline_at ? formatDate(row.deadline_at) : "deadline"
        }.`
      : `Reminder: Upload BOX file before ${row.deadline_at ? formatDate(row.deadline_at) : "deadline"}.`;

    const targetIds = row.pr_user_id ? [row.pr_user_id] : [];
    if (targetIds.length > 0) {
      await createNotificationsForUsers({
        userIds: targetIds,
        type: "file_upload_reminder",
        title: "BOX File Reminder",
        message: reminderMessage,
        metadata: {
          fileType: "box",
          department: row.department,
          resubmissionRequired: row.resubmission_required,
        },
        io,
      });

      await neonService.executeRawQuery(
        `
        UPDATE file_notification_state
        SET
          notification_status = $1,
          last_notification_sent = NOW(),
          updated_at = NOW()
        WHERE id = $2
        `,
        [STATUS_SENT, row.id]
      );
    }
  }
};

const runDailyNotificationChecks = async (io = null) => {
  await ensureSchema();
  await bootstrapCompletedDriveNotifications(io);
  await processDriveFileReminderCycle(io);
  await processBoxReminderCycle(io);
};

let schedulerTimer = null;
let lastOnDemandRunAt = 0;

const startDailyScheduler = (io = null) => {
  if (schedulerTimer) return;

  // Run once shortly after startup.
  setTimeout(() => {
    runDailyNotificationChecks(io).catch((error) => {
      console.error("Initial file notification scheduler run failed:", error?.message || error);
    });
  }, 15000);

  schedulerTimer = setInterval(() => {
    runDailyNotificationChecks(io).catch((error) => {
      console.error("Daily file notification scheduler run failed:", error?.message || error);
    });
  }, DEFAULT_CHECK_INTERVAL_MS);
};

const runChecksIfStale = async (io = null, minIntervalMs = 2 * 60 * 1000) => {
  const now = Date.now();
  if (now - lastOnDemandRunAt < minIntervalMs) return;
  lastOnDemandRunAt = now;
  await runDailyNotificationChecks(io);
};

const stopDailyScheduler = () => {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
};

module.exports = {
  ensureSchema,
  onDriveComplete,
  onDriveFileUpload,
  onBoxEnable,
  onBoxDisable,
  onBoxFileUpload,
  onBoxDeleteByPO,
  runDailyNotificationChecks,
  runChecksIfStale,
  startDailyScheduler,
  stopDailyScheduler,
};
