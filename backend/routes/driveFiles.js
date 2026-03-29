/**
 * Route handler for Job Drive Files (SPOC & Expenditure)
 */
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { auth } = require("../middleware/auth");
const neonService = require("../services/database/neonService");
const { uploadMulterFileToS3 } = require("../services/storage/s3Upload");
const fileNotificationService = require("../services/notifications/fileNotificationService");

// ✅ ADDED: normalized role helpers for predictable permissions.
const normalizeRole = (role) => String(role || "").toLowerCase().replace(/\s+/g, "_");
const isPO = (user) => ["po", "placement_officer", "admin"].includes(normalizeRole(user?.role));
const isPR = (user) => ["placement_representative", "pr"].includes(normalizeRole(user?.role));

const addDays = (dateValue, days) => {
  const d = new Date(dateValue);
  d.setDate(d.getDate() + days);
  return d;
};

const getDriveFileDeadline = async (jobDriveId) => {
  const driveRows = await neonService.executeRawQuery(
    `
    SELECT id, drive_date
    FROM job_drives
    WHERE id = $1
    LIMIT 1
    `,
    [jobDriveId]
  );

  const drive = driveRows[0];
  if (!drive) return null;

  let firstRoundDate = null;
  try {
    const roundRows = await neonService.executeRawQuery(
      `
      SELECT round_date
      FROM selection_rounds
      WHERE job_drive_id = $1 AND round_date IS NOT NULL
      ORDER BY round_order ASC NULLS LAST, round_date ASC
      LIMIT 1
      `,
      [jobDriveId]
    );
    firstRoundDate = roundRows[0]?.round_date || null;
  } catch (error) {
    firstRoundDate = null;
  }

  const baseDate = firstRoundDate || drive.drive_date;
  if (!baseDate) return null;
  return addDays(baseDate, 30);
};

// ==========================================
// S3 URL Signing Logic (Copied from templates.js for consistency)
// ==========================================
let signS3Url = async (url) => url;

const initializeS3 = () => {
  const bucketName = process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION || 'ap-south-1';
  const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  };

  if (!bucketName || !credentials.accessKeyId || !credentials.secretAccessKey) return;

  try {
    const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
    const client = new S3Client({ region, credentials });

    signS3Url = async (fileUrl) => {
      if (!fileUrl || !fileUrl.includes("amazonaws.com")) return fileUrl;
      try {
        const urlObj = new URL(fileUrl);
        const key = decodeURIComponent(urlObj.pathname.substring(1));
        const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
        return await getSignedUrl(client, command, { expiresIn: 3600 });
      } catch (err) { return fileUrl; }
    };
  } catch (e) {
    try {
      const AWS = require("aws-sdk");
      const s3 = new AWS.S3({ ...credentials, region, signatureVersion: 'v4' });
      signS3Url = async (fileUrl) => {
        if (!fileUrl || !fileUrl.includes("amazonaws.com")) return fileUrl;
        try {
          const key = decodeURIComponent(new URL(fileUrl).pathname.substring(1));
          return s3.getSignedUrlPromise("getObject", { Bucket: bucketName, Key: key, Expires: 3600 });
        } catch (err) { return fileUrl; }
      };
    } catch (e) { }
  }
};
initializeS3();

// Multer setup
const os = require("os");
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}-${file.originalname}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and DOCX files are allowed.'));
    }
  }
});

// Middleware to ensure table exists
const ensureTable = async (req, res, next) => {
  try {
    await neonService.executeRawQuery(`
      CREATE TABLE IF NOT EXISTS job_drive_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_drive_id TEXT NOT NULL,
        uploader_id UUID NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    next();
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ message: "Database initialization failed" });
  }
};

// Upload a file
router.post("/upload", auth, ensureTable, upload.single('file'), async (req, res) => {
  try {
    // ⚠️ IMPORTANT: file upload is PR-owned workflow.
    if (!isPR(req.user)) {
      return res.status(403).json({ message: "Access denied. Only PR users can upload drive files." });
    }

    const { jobDriveId, fileType } = req.body;
    const file = req.file;

    if (!file || !jobDriveId || !fileType) {
      return res.status(400).json({ message: "Missing file, jobDriveId or fileType" });
    }

    if (!['spoc', 'expenditure'].includes(fileType)) {
      return res.status(400).json({ message: "Invalid file type" });
    }

    const deadlineAt = await getDriveFileDeadline(jobDriveId);
    if (deadlineAt && new Date() > new Date(deadlineAt)) {
      return res.status(403).json({
        message: `Upload deadline has passed for ${String(fileType).toUpperCase()} file.`,
        deadlineAt,
      });
    }

    // Upload to S3
    const s3Result = await uploadMulterFileToS3(file, {
      prefix: `drive-files/${jobDriveId}`,
      keyPrefix: fileType
    });

    // Save to NeonDB
    await neonService.executeRawQuery(
      `INSERT INTO job_drive_files (job_drive_id, uploader_id, file_type, file_name, file_url) 
       VALUES ($1, $2, $3, $4, $5)`,
      [jobDriveId, req.user.id, fileType, file.originalname, s3Result.url]
    );

    // Event hook: mark submission complete for reminder workflow and notify PO.
    try {
      const profileRows = await neonService.executeRawQuery(
        "SELECT department FROM user_profiles WHERE user_id = $1 LIMIT 1",
        [req.user.id]
      );

      await fileNotificationService.onDriveFileUpload({
        jobDriveId,
        fileType,
        uploaderId: req.user.id,
        department: profileRows[0]?.department || null,
        io: req.app.get("io"),
      });
    } catch (notifyError) {
      console.error("Drive file notification hook failed:", notifyError?.message || notifyError);
    }

    res.json({ message: "File uploaded successfully" });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Failed to upload file", error: error.message });
  }
});

// Delete a file
router.delete("/file/:fileId", auth, async (req, res) => {
  try {
    const { fileId } = req.params;

    const rows = await neonService.executeRawQuery(
      `SELECT id, uploader_id FROM job_drive_files WHERE id = $1 LIMIT 1`,
      [fileId]
    );

    const target = rows[0];
    if (!target) {
      return res.status(404).json({ message: "File not found" });
    }

    // 🔁 MODIFIED: allow delete only for PO or original uploader.
    const canDelete = isPO(req.user) || String(target.uploader_id) === String(req.user.id);
    if (!canDelete) {
      return res.status(403).json({ message: "Access denied. You can delete only your own uploaded files." });
    }

    await neonService.executeRawQuery(
      `DELETE FROM job_drive_files WHERE id = $1`,
      [fileId]
    );
    res.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("Delete file error:", error);
    res.status(500).json({ message: "Failed to delete file" });
  }
});

router.get("/all-summary", auth, ensureTable, async (req, res) => {
  try {
    const isPO = (user) => {
      const role = String(user.role || "").toLowerCase().replace(/\s+/g, "_");
      return ["po", "placement_officer", "admin"].includes(role);
    };

    if (!isPO(req.user)) {
      return res.status(403).json({ message: "Access denied. Only Placement Officers can view this summary." });
    }

    const { fileType, submissionStatus, department } = req.query;

    // 🔥 CLEAN QUERY HERE
    let filters = {};

    if (fileType && fileType !== "all") {
      filters.fileType = fileType;
    }

    if (submissionStatus && submissionStatus !== "all") {
      filters.submissionStatus = submissionStatus;
    }

    if (department && department !== "all") {
      filters.department = department;
    }

    console.log("Filters sent to service:", filters);

    const result = await neonService.getDetailedFileSubmissionStatus(filters);

    const matrix = await Promise.all(result.map(async (row) => {
      if (row.file_url) {
        return {
          ...row,
          file_url: await signS3Url(row.file_url)
        };
      }
      return {
        ...row,
        file_name: row.file_name || '-',
        file_url: null // Frontend will handle disabled state via null URL
      };
    }));

    res.json({ matrix });

  } catch (error) {
    console.error("Fetch all drive files summary error:", error);
    res.status(500).json({ message: "Failed to fetch all drive files summary", error: error.message });
  }
});

// Get files for a drive
router.get("/:driveId", auth, ensureTable, async (req, res) => {
  try {
    const { driveId } = req.params;
    
    // Fetch files with uploader info
    const query = `
      SELECT 
        f.id, f.file_type, f.file_name, f.file_url, f.created_at,
        up.profile_name as uploader_name, u.email as uploader_email,
        up.department as uploader_department
      FROM job_drive_files f
      LEFT JOIN users u ON f.uploader_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE f.job_drive_id = $1
      ORDER BY f.created_at DESC
    `;
    
    const rows = await neonService.executeRawQuery(query, [driveId]);
    
    // Sign URLs
    const files = await Promise.all(rows.map(async (row) => ({
      ...row,
      file_url: await signS3Url(row.file_url)
    })));

    res.json({ files });
  } catch (error) {
    console.error("Fetch files error:", error);
    res.status(500).json({ message: "Failed to fetch files" });
  }
});

module.exports = router;
