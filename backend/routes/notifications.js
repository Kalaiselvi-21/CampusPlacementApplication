const router = require("express").Router();
const { auth } = require("../middleware/auth");
const logger = require("../services/database/logger");
const notificationService = require("../services/notifications/notificationService");
const fileNotificationService = require("../services/notifications/fileNotificationService");

const isPlacementStaff = (user) => {
  const role = user?.roleNormalized || user?.role || "";
  const normalized = String(role).trim().toLowerCase().replace(/\s+/g, "_");
  return (
    normalized === "po" ||
    normalized === "placement_officer" ||
    normalized === "admin" ||
    normalized === "placement_representative" ||
    normalized === "pr"
  );
};

router.get("/", auth, async (req, res) => {
  try {
    try {
      await fileNotificationService.runChecksIfStale(req.app.get("io"), 0);
    } catch (checkError) {
      console.error("Notification pre-check failed:", checkError?.message || checkError);
    }

    const limit = req.query.limit;
    const offset = req.query.offset;
    const result = await notificationService.listForUser(req.user.id, { limit, offset });
    return res.json({ ...result, database: "NEON" });
  } catch (error) {
    logger.logFailure("NEON", "READ", "Notification", error.message || error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.patch("/:id/read", auth, async (req, res) => {
  try {
    const updated = await notificationService.markRead(req.user.id, req.params.id);
    if (!updated) return res.status(404).json({ message: "Notification not found" });
    return res.json({ notification: updated, database: "NEON" });
  } catch (error) {
    logger.logFailure("NEON", "UPDATE", "Notification", error.message || error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.patch("/read-all", auth, async (req, res) => {
  try {
    const result = await notificationService.markAllRead(req.user.id);
    return res.json({ ...result, database: "NEON" });
  } catch (error) {
    logger.logFailure("NEON", "UPDATE", "Notification", error.message || error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Create notification (staff only; internal usage)
router.post("/", auth, async (req, res) => {
  try {
    if (!isPlacementStaff(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { userIds, departments, roles, type, title, message, metadata } = req.body || {};

    if (!type || !title || !message) {
      return res.status(400).json({ message: "type, title, and message are required" });
    }

    let result;
    if (Array.isArray(userIds) && userIds.length > 0) {
      result = await notificationService.createForUserIds({ userIds, type, title, message, metadata });
    } else {
      result = await notificationService.createForDepartments({ departments, roles, type, title, message, metadata });
    }

    return res.status(201).json({ ...result, database: "NEON" });
  } catch (error) {
    logger.logFailure("NEON", "CREATE", "Notification", error.message || error);
    return res.status(400).json({ message: error.message || "Failed to create notification" });
  }
});

module.exports = router;

