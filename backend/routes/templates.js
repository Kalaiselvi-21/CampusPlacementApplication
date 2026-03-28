const express = require("express");
const router = express.Router();
const multer = require("multer");
const { auth } = require("../middleware/auth");
const neonService = require("../services/database/neonService");
const { uploadMulterFileToS3 } = require("../services/storage/s3Upload");
const logger = require("../services/database/logger");

// ==========================================
// S3 URL Signing Logic (Async & Robust)
// ==========================================
let signS3Url = async (url) => url; // Default: return original URL if signing fails

const initializeS3 = () => {
  const bucketName = process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION || 'ap-south-1';
  const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  };

  if (!bucketName || !credentials.accessKeyId || !credentials.secretAccessKey) return;

  // Attempt to load AWS SDK v3 (Modern)
  try {
    const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
    const client = new S3Client({ region, credentials });

    signS3Url = async (fileUrl) => {
      if (!fileUrl || !fileUrl.includes("amazonaws.com")) return fileUrl;
      try {
        const urlObj = new URL(fileUrl);
        // Extract key from pathname (remove leading slash)
        const key = decodeURIComponent(urlObj.pathname.substring(1));
        const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
        return await getSignedUrl(client, command, { expiresIn: 3600 });
      } catch (err) { return fileUrl; }
    };
    return; // Initialized v3 successfully
  } catch (e) {}

  // Fallback to AWS SDK v2 (Legacy)
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
  } catch (e) { console.warn("No AWS SDK found. S3 URL signing disabled."); }
};
initializeS3();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
});

// Helper to check for PO role
const isPo = (user) => {
  const role = String(user.role || "").toLowerCase().replace(/\s+/g, "_");
  return ["po", "placement_officer", "admin"].includes(role);
};

// Get latest templates
router.get("/latest", auth, async (req, res) => {
  try {
    // Ensure table exists (idempotent)
    await neonService.executeRawQuery(`
      CREATE TABLE IF NOT EXISTS placement_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(50) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_url TEXT NOT NULL,
        uploaded_by UUID,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get the latest file for each type (spoc, expenditure, box)
    const query = `
      SELECT DISTINCT ON (type)
        t.id, t.type, t.file_name, t.file_url, t.created_at,
        up.profile_name as uploader_name, u.email as uploader_email
      FROM placement_templates t
      LEFT JOIN users u ON t.uploaded_by = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      ORDER BY type, created_at DESC
    `;
    
    const rows = await neonService.executeRawQuery(query);
    
    // Helper to process row with async signing
    const processRow = async (row) => {
      if (!row) return null;
      const signedUrl = await signS3Url(row.file_url);
      return { ...row, file_url: signedUrl };
    };

    const templates = {
      spoc: await processRow(rows.find(r => r.type === 'spoc')),
      expenditure: await processRow(rows.find(r => r.type === 'expenditure')),
      box: await processRow(rows.find(r => r.type === 'box'))
    };

    res.json({ templates, database: "NEON" });
  } catch (error) {
    console.error("Error fetching templates:", error);
    res.status(500).json({ message: "Failed to fetch templates" });
  }
});

// Upload templates (PO only)
router.post("/upload", auth, upload.fields([
  { name: "spoc", maxCount: 1 },
  { name: "expenditure", maxCount: 1 },
  { name: "box", maxCount: 1 }
]), async (req, res) => {
  try {
    if (!isPo(req.user)) {
      return res.status(403).json({ message: "Access denied. Only Placement Officers can upload templates." });
    }

    const { spoc, expenditure, box } = req.files || {};

    // 🔁 MODIFIED: allow partial updates; require at least one template file.
    if (!spoc && !expenditure && !box) {
      return res.status(400).json({ message: "Please upload at least one template file (SPOC, Expenditure, or Box)." });
    }

    const uploadAndSave = async (fileArray, type) => {
      if (!fileArray || !fileArray.length) return;
      const file = fileArray[0];
      const s3Result = await uploadMulterFileToS3(file, {
        prefix: "templates",
        keyPrefix: type // This will create folders like templates/spoc/filename
      });
      
      await neonService.executeRawQuery(
        `INSERT INTO placement_templates (type, file_name, file_url, uploaded_by) VALUES ($1, $2, $3, $4)`,
        [type, file.originalname, s3Result.url, req.user.id]
      );
    };

    // Upload only the provided files in parallel.
    await Promise.all([
      spoc ? uploadAndSave(spoc, "spoc") : Promise.resolve(),
      expenditure ? uploadAndSave(expenditure, "expenditure") : Promise.resolve(),
      box ? uploadAndSave(box, "box") : Promise.resolve()
    ]);

    logger.logAttempt("NEON", "CREATE", "Templates", `User ${req.user.email} uploaded new templates set`);

    res.json({ message: "Templates uploaded successfully" });
  } catch (error) {
    console.error("Template upload error:", error);
    res.status(500).json({ message: "Failed to upload templates", error: error.message });
  }
});

module.exports = router;