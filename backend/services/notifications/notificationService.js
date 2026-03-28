const neonService = require("../database/neonService");

// Canonical notification types. Legacy aliases are mapped in canonicalizeType().
const NOTIFICATION_TYPES = new Set([
  "drive_created",
  "round_selected",
  "final_round_cleared",
  "placement_success",
  "resource_uploaded",
  "spoc_assignment",
  "file_upload_deadline",
  "file_upload_reminder",
  "file_upload_closed",
  "file_submitted",
  "file_not_submitted",
  "box_upload_enabled",
  "box_upload_closed",
  "box_resubmission_required",
]);

const ensureSchema = async () => {
  await neonService.executeRawQuery(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

  await neonService.executeRawQuery(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      user_role VARCHAR(50) NOT NULL,
      department VARCHAR(50),
      type VARCHAR(50) NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await neonService.executeRawQuery(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created
      ON notifications (user_id, created_at DESC);
  `);
  await neonService.executeRawQuery(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
      ON notifications (user_id, is_read);
  `);
  await neonService.executeRawQuery(`
    CREATE INDEX IF NOT EXISTS idx_notifications_department_type_created
      ON notifications (department, type, created_at DESC);
  `);
};

const normalizeType = (value) => String(value || "").trim().toLowerCase();

const canonicalizeType = (type) => {
  const normalized = normalizeType(type);
  if (normalized === "placed") return "placement_success";
  if (normalized === "spoc_department") return "spoc_assignment";
  return normalized;
};

const validateType = (type) => {
  const normalized = canonicalizeType(type);
  if (!NOTIFICATION_TYPES.has(normalized)) {
    throw new Error(`Invalid notification type: ${type}`);
  }
  return normalized;
};

const listForUser = async (userId, { limit = 50, offset = 0 } = {}) => {
  const cappedLimit = Math.min(Math.max(Number(limit) || 50, 1), 50);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const rows = await neonService.executeRawQuery(
    `
    SELECT *
    FROM notifications
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, cappedLimit, safeOffset]
  );

  const unreadRows = await neonService.executeRawQuery(
    `SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );

  return {
    notifications: rows,
    unreadCount: unreadRows[0]?.unread || 0,
    limit: cappedLimit,
    offset: safeOffset,
  };
};

const markRead = async (userId, notificationId) => {
  const rows = await neonService.executeRawQuery(
    `
    UPDATE notifications
    SET is_read = TRUE
    WHERE id = $1 AND user_id = $2
    RETURNING *
    `,
    [notificationId, userId]
  );
  return rows[0] || null;
};

const markAllRead = async (userId) => {
  await neonService.executeRawQuery(
    `
    UPDATE notifications
    SET is_read = TRUE
    WHERE user_id = $1 AND is_read = FALSE
    `,
    [userId]
  );

  const unreadRows = await neonService.executeRawQuery(
    `SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );

  return { unreadCount: unreadRows[0]?.unread || 0 };
};

const createForUserIds = async ({
  userIds,
  type,
  title,
  message,
  metadata = {},
}) => {
  const normalizedType = validateType(type);
  const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : [];
  if (ids.length === 0) return { inserted: 0 };

  await neonService.executeRawQuery(
    `
    INSERT INTO notifications (id, user_id, user_role, department, type, title, message, metadata, is_read, created_at)
    SELECT
      gen_random_uuid(),
      u.id,
      u.role,
      up.department,
      $2,
      $3,
      $4,
      $5::jsonb,
      FALSE,
      NOW()
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE u.id = ANY($1)
    `,
    [ids, normalizedType, title, message, JSON.stringify(metadata || {})]
  );

  return { inserted: ids.length };
};

const createPlacementSuccessForUserIdsIfMissing = async ({
  userIds,
  driveId,
  title,
  message,
  metadata = {},
}) => {
  const normalizedType = validateType("placement_success");
  const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : [];
  if (ids.length === 0) return { inserted: 0 };

  const driveIdValue = String(driveId || "").trim();
  if (!driveIdValue) {
    throw new Error("driveId is required to dedupe placement_success notifications");
  }

  const existingRows = await neonService.executeRawQuery(
    `
    SELECT DISTINCT user_id
    FROM notifications
    WHERE user_id = ANY($1)
      AND type = $2
      AND (metadata->>'driveId') = $3
    `,
    [ids, normalizedType, driveIdValue]
  );

  const existing = new Set((existingRows || []).map((r) => String(r.user_id)));
  const missingIds = ids.filter((id) => !existing.has(String(id)));
  if (missingIds.length === 0) return { inserted: 0 };

  await neonService.executeRawQuery(
    `
    INSERT INTO notifications (id, user_id, user_role, department, type, title, message, metadata, is_read, created_at)
    SELECT
      gen_random_uuid(),
      u.id,
      u.role,
      up.department,
      $2,
      $3,
      $4,
      $5::jsonb,
      FALSE,
      NOW()
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE u.id = ANY($1)
    `,
    [
      missingIds,
      normalizedType,
      title,
      message,
      JSON.stringify({ ...(metadata || {}), driveId: driveIdValue }),
    ]
  );

  return { inserted: missingIds.length };
};

const createForDepartments = async ({
  departments,
  roles = ["student", "placement_representative", "pr"],
  type,
  title,
  message,
  metadata = {},
}) => {
  const normalizedType = validateType(type);
  const deptList = Array.isArray(departments)
    ? departments.map((d) => String(d).trim()).filter(Boolean)
    : [];

  const roleList = Array.isArray(roles) ? roles.filter(Boolean) : [];
  if (roleList.length === 0) {
    throw new Error("roles required to create department notifications");
  }

  // If departments is empty or contains ALL, notify all matching users.
  const notifyAll = deptList.length === 0 || deptList.includes("ALL");

  const rows = await neonService.executeRawQuery(
    `
    INSERT INTO notifications (id, user_id, user_role, department, type, title, message, metadata, is_read, created_at)
    SELECT
      gen_random_uuid(),
      u.id,
      u.role,
      up.department,
      $3,
      $4,
      $5,
      $6::jsonb,
      FALSE,
      NOW()
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE u.role = ANY($1)
      AND ($2 = TRUE OR up.department = ANY($7))
    RETURNING id
    `,
    [
      roleList,
      notifyAll,
      normalizedType,
      title,
      message,
      JSON.stringify(metadata || {}),
      deptList,
    ]
  );

  return { inserted: rows.length };
};

const sendNotification = async (
  user,
  message,
  type,
  { title = "Placement Notification", metadata = {}, io = null } = {}
) => {
  const userId = typeof user === "string" ? user : user?.id || user?._id;
  if (!userId) {
    return { inserted: 0 };
  }

  const result = await createForUserIds({
    userIds: [userId],
    type,
    title,
    message,
    metadata,
  });

  if (io) {
    io.to(`user:${userId}`).emit("notification:new", { type });
  }

  return result;
};

module.exports = {
  ensureSchema,
  listForUser,
  markRead,
  markAllRead,
  createForUserIds,
  createPlacementSuccessForUserIdsIfMissing,
  createForDepartments,
  sendNotification,
  NOTIFICATION_TYPES: Array.from(NOTIFICATION_TYPES),
};
