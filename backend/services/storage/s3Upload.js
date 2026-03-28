const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

let cachedClient = null;

const getBucketName = () =>
  process.env.AWS_BUCKET_NAME ||
  process.env.AWS_S3_BUCKET ||
  process.env.S3_BUCKET ||
  "";

const getRegion = () => process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "";

const getPublicBaseUrl = () => {
  const value = process.env.AWS_S3_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || "";
  return value ? value.replace(/\/+$/, "") : "";
};

const sanitizeForKey = (value) =>
  String(value || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180) || "file";

const buildS3Url = ({ bucket, region, key }) => {
  const baseUrl = getPublicBaseUrl();
  if (baseUrl) return `${baseUrl}/${key}`;
  const resolvedRegion = region || getRegion() || "us-east-1";
  return `https://${bucket}.s3.${resolvedRegion}.amazonaws.com/${key}`;
};

const getClient = () => {
  if (cachedClient) return cachedClient;

  const region = getRegion() || "us-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  cachedClient = new S3Client({
    region,
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });

  return cachedClient;
};

async function uploadMulterFileToS3(file, { prefix = "uploads", keyPrefix = "" } = {}) {
  if (!file || !file.buffer) {
    throw new Error("No file buffer available for S3 upload");
  }

  const bucket = getBucketName();
  if (!bucket) {
    throw new Error("Missing S3 bucket env var (AWS_BUCKET_NAME/AWS_S3_BUCKET/S3_BUCKET)");
  }

  const client = getClient();
  const region = getRegion() || "us-east-1";

  const safeName = sanitizeForKey(file.originalname);
  const timePart = Date.now();
  const randomPart = Math.random().toString(16).slice(2, 10);
  const normalizedPrefix = String(prefix || "uploads").replace(/^\/+|\/+$/g, "");
  const normalizedKeyPrefix = String(keyPrefix || "").replace(/^\/+|\/+$/g, "");
  const keyBase = [normalizedPrefix, normalizedKeyPrefix].filter(Boolean).join("/");
  const key = `${keyBase}/${timePart}-${randomPart}-${safeName}`.replace(/\/{2,}/g, "/");

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  try {
    await client.send(command);
  } catch (error) {
    const name = error?.name || "";
    const message = error?.message || "";
    if (name === "CredentialsProviderError" || message.includes("Could not load credentials")) {
      throw new Error(
        "AWS credentials not found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (and AWS_SESSION_TOKEN if using temporary creds), then restart the backend."
      );
    }
    throw error;
  }

  return {
    bucket,
    region,
    key,
    url: buildS3Url({ bucket, region, key }),
    contentType: file.mimetype,
    size: file.size,
    originalName: file.originalname,
  };
}

async function deleteFileFromS3(s3Key) {
  const key = String(s3Key || "").trim();
  if (!key) return { deleted: false, reason: "missing-key" };

  const bucket = getBucketName();
  if (!bucket) {
    throw new Error("Missing S3 bucket env var (AWS_BUCKET_NAME/AWS_S3_BUCKET/S3_BUCKET)");
  }

  const client = getClient();
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  try {
    await client.send(command);
    return { deleted: true, key };
  } catch (error) {
    const name = error?.name || "";
    const message = error?.message || "";
    if (name === "CredentialsProviderError" || message.includes("Could not load credentials")) {
      throw new Error(
        "AWS credentials not found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (and AWS_SESSION_TOKEN if using temporary creds), then restart the backend."
      );
    }
    throw error;
  }
}

module.exports = { uploadMulterFileToS3, deleteFileFromS3 };
