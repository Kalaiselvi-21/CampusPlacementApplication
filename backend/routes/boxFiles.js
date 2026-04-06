const express = require("express");
const router = express.Router();
const multer = require("multer");
const { auth } = require("../middleware/auth");
const neonService = require("../services/database/neonService");
const { uploadMulterFileToS3, deleteFileFromS3 } = require("../services/storage/s3Upload");
const fileNotificationService = require("../services/notifications/fileNotificationService");

// ✅ ADDED: normalized role helpers for consistent access control.
const normalizeRole = (role) => String(role || "").toLowerCase().replace(/\s+/g, "_");
const isPO = (user) => ["po", "placement_officer", "admin"].includes(normalizeRole(user?.role));
const isPR = (user) => ["placement_representative", "pr"].includes(normalizeRole(user?.role));

const os = require("os");
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}-${file.originalname}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  // ✅ ADDED: enforce safe file types at API layer too.
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Invalid file type. Only PDF and DOCX files are allowed."));
  },
});

// Middleware to ensure tables exist
const ensureTables = async (req, res, next) => {
  try {
    await neonService.executeRawQuery(`
      CREATE TABLE IF NOT EXISTS box_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pr_id UUID NOT NULL,
        pr_name TEXT NOT NULL,
        department TEXT NOT NULL,
        batch TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        s3_key TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await neonService.executeRawQuery(`
      CREATE TABLE IF NOT EXISTS settings (
        setting_name TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    
    next();
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ message: "Database initialization failed" });
  }
};

// --- Settings Routes ---

router.get("/toggle-status", auth, ensureTables, async (req, res) => {
  try {
    const result = await neonService.executeRawQuery(
      "SELECT value FROM settings WHERE setting_name = 'boxFileUploadEnabled' LIMIT 1"
    );
    const enabled = result[0] ? result[0].value === "true" : false;
    res.json({ enabled });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch setting" });
  }
});

router.post("/toggle", auth, ensureTables, async (req, res) => {
  if (!isPO(req.user)) {
    return res.status(403).json({ message: "Access denied" });
  }
  try {
    const { enabled, deadlineAt } = req.body;
    const isEnabled =
      enabled === true ||
      String(enabled || "")
        .trim()
        .toLowerCase() === "true";

    await neonService.executeRawQuery(
      `INSERT INTO settings (setting_name, value) 
       VALUES ('boxFileUploadEnabled', $1)
       ON CONFLICT (setting_name) DO UPDATE SET value = $1`,
      [isEnabled.toString()]
    );

    if (deadlineAt) {
      await neonService.executeRawQuery(
        `INSERT INTO settings (setting_name, value)
         VALUES ('boxFileUploadDeadline', $1)
         ON CONFLICT (setting_name) DO UPDATE SET value = $1`,
        [String(deadlineAt)]
      );
    }

    try {
      const io = req.app.get("io");
      if (isEnabled) {
        await fileNotificationService.onBoxEnable({
          deadlineAt: deadlineAt || null,
          io,
        });
      } else {
        await fileNotificationService.onBoxDisable({ io });
      }
    } catch (notifyError) {
      console.error("Box toggle notification hook failed:", notifyError?.message || notifyError);
    }

    res.json({ message: "Setting updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update setting" });
  }
});

// --- Box File Management Routes ---

router.get("/my-file", auth, ensureTables, async (req, res) => {
  if (!isPR(req.user)) {
    return res.status(403).json({ message: "Access denied" });
  }
  try {
    const rows = await neonService.executeRawQuery(
      "SELECT * FROM box_files WHERE pr_id = $1 ORDER BY uploaded_at DESC LIMIT 1",
      [req.user.id]
    );
    res.json({ file: rows[0] || null });
  } catch (error) {
    res.status(500).json({ message: "Error fetching box file" });
  }
});

router.get("/all", auth, ensureTables, async (req, res) => {
  if (!isPO(req.user)) {
    return res.status(403).json({ message: "Access denied" });
  }
  try {
    const rows = await neonService.executeRawQuery(
      "SELECT * FROM box_files ORDER BY uploaded_at DESC"
    );
    res.json({ files: rows });
  } catch (error) {
    res.status(500).json({ message: "Error fetching all box files" });
  }
});

router.post("/upload", auth, ensureTables, upload.single("file"), async (req, res) => {
  // ⚠️ IMPORTANT: only PR users can upload their department box files.
  if (!isPR(req.user)) {
    return res.status(403).json({ message: "Access denied" });
  }
  try {
    const { batch, department } = req.body;
    if (!req.file) return res.status(400).json({ message: "File is required" });

    // ⚠️ IMPORTANT: enforce PO toggle status on backend (not just UI).
    const settingRows = await neonService.executeRawQuery(
      "SELECT value FROM settings WHERE setting_name = 'boxFileUploadEnabled' LIMIT 1"
    );
    const enabled = settingRows[0] ? settingRows[0].value === "true" : false;
    if (!enabled) {
      return res.status(403).json({ message: "Box file upload is currently disabled by PO." });
    }

    const existing = await neonService.executeRawQuery(
      "SELECT id FROM box_files WHERE pr_id = $1 ORDER BY uploaded_at DESC LIMIT 1",
      [req.user.id]
    );

    if (existing[0]) {
      return res.status(400).json({ message: "A box file already exists. Use replace instead." });
    }

    const uploaded = await uploadMulterFileToS3(req.file, {
      prefix: "box-files",
      keyPrefix: `${req.user.id}-${batch}`,
    });

    await neonService.executeRawQuery(
      `INSERT INTO box_files (id, pr_id, pr_name, department, batch, file_name, file_url, s3_key, uploaded_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())`,
      [req.user.id, req.user.name, department, batch, req.file.originalname, uploaded.url, uploaded.key]
    );

    const latestRows = await neonService.executeRawQuery(
      "SELECT * FROM box_files WHERE pr_id = $1 AND batch = $2 ORDER BY uploaded_at DESC LIMIT 1",
      [req.user.id, batch]
    );

    res.json({
      message: "Box file uploaded successfully",
      file: latestRows[0] || {
        file_name: req.file.originalname,
        file_url: uploaded.url,
        batch,
        uploaded_at: new Date().toISOString(),
      },
    });

    try {
      await fileNotificationService.onBoxFileUpload({
        prUserId: req.user.id,
        department,
        batch,
        io: req.app.get("io"),
      });
    } catch (notifyError) {
      console.error("Box upload notification hook failed:", notifyError?.message || notifyError);
    }
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Failed to upload box file" });
  }
});

router.post("/replace/:id", auth, ensureTables, upload.single("file"), async (req, res) => {
  // ⚠️ IMPORTANT: only PR owner can replace their file.
  if (!isPR(req.user)) {
    return res.status(403).json({ message: "Access denied" });
  }
  try {
    const fileId = req.params.id;
    const { batch } = req.body;

    if (!req.file) return res.status(400).json({ message: "File is required" });
    if (!batch) return res.status(400).json({ message: "Batch information is required for replacement" });

    const settingRows = await neonService.executeRawQuery(
      "SELECT value FROM settings WHERE setting_name = 'boxFileUploadEnabled' LIMIT 1"
    );
    const enabled = settingRows[0] ? settingRows[0].value === "true" : false;
    if (!enabled) {
      return res.status(403).json({ message: "Box file upload is currently disabled by PO." });
    }

    let rows = await neonService.executeRawQuery(
      "SELECT s3_key FROM box_files WHERE id = $1 AND pr_id = $2",
      [fileId, req.user.id]
    );

    let targetFileId = fileId;

    // If the provided id is stale, recover using the PR's latest record (one active file per PR).
    if (!rows[0]) {
      const fallbackRows = await neonService.executeRawQuery(
        "SELECT id, s3_key FROM box_files WHERE pr_id = $1 ORDER BY uploaded_at DESC LIMIT 1",
        [req.user.id]
      );

      if (fallbackRows[0]) {
        rows = [{ s3_key: fallbackRows[0].s3_key }];
        targetFileId = fallbackRows[0].id;
      } else {
        return res.status(404).json({ message: "File record not found" });
      }
    }

    if (rows[0].s3_key) {
      try {
        await deleteFileFromS3(rows[0].s3_key);
      } catch (s3DeleteError) {
        // Do not block replacement if previous object is already missing or cannot be removed.
        console.warn("Warning while deleting previous S3 object during replace:", s3DeleteError.message);
      }
    }

    const uploaded = await uploadMulterFileToS3(req.file, {
      prefix: "box-files",
      keyPrefix: `${req.user.id}-${batch}`,
    });

    await neonService.executeRawQuery(
      `UPDATE box_files
       SET file_name = $1, file_url = $2, s3_key = $3, batch = $4, uploaded_at = NOW()
       WHERE id = $5`,
      [req.file.originalname, uploaded.url, uploaded.key, batch, targetFileId]
    );

    const updatedRows = await neonService.executeRawQuery(
      "SELECT * FROM box_files WHERE id = $1 LIMIT 1",
      [targetFileId]
    );

    try {
      await fileNotificationService.onBoxFileUpload({
        prUserId: req.user.id,
        department: updatedRows[0]?.department || null,
        batch,
        io: req.app.get("io"),
      });
    } catch (notifyError) {
      console.error("Box replace notification hook failed:", notifyError?.message || notifyError);
    }

    res.json({
      message: "Box file replaced successfully",
      file: updatedRows[0] || {
        id: targetFileId,
        file_name: req.file.originalname,
        file_url: uploaded.url,
        batch,
        uploaded_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Replace error details:", error);
    res.status(500).json({ message: "Failed to replace box file", error: error.message });
  }
});

router.delete("/:id", auth, ensureTables, async (req, res) => {
  if (!isPO(req.user)) {
    return res.status(403).json({ message: "Access denied" });
  }
  try {
    const fileId = req.params.id;
    const rows = await neonService.executeRawQuery(
      "SELECT s3_key, pr_id, department, batch FROM box_files WHERE id = $1",
      [fileId]
    );

    if (!rows[0]) return res.status(404).json({ message: "File not found" });

    if (rows[0].s3_key) {
      try {
        await deleteFileFromS3(rows[0].s3_key);
      } catch (s3DeleteError) {
        // Keep DB delete path working even if object delete fails for legacy/missing keys.
        console.warn("Warning while deleting S3 object for box file delete:", s3DeleteError.message);
      }
    }
    await neonService.executeRawQuery("DELETE FROM box_files WHERE id = $1", [fileId]);

    try {
      await fileNotificationService.onBoxDeleteByPO({
        prUserId: rows[0]?.pr_id || null,
        department: rows[0]?.department || null,
        batch: rows[0]?.batch || null,
        io: req.app.get("io"),
      });
    } catch (notifyError) {
      console.error("Box delete notification hook failed:", notifyError?.message || notifyError);
    }

    res.json({ message: "Box file deleted successfully" });
  } catch (error) {
    console.error("Delete box file error:", error);
    res.status(500).json({ message: "Failed to delete box file" });
  }
});

module.exports = router;