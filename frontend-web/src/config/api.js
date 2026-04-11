const APP_RUNNER_API_BASE = "https://3dgmjyt95a.us-east-1.awsapprunner.com";

const LEGACY_HOST_PATTERNS = [
  "onrender.com",
];

const stripTrailingSlash = (value) => String(value || "").trim().replace(/\/+$/, "");

const isLegacyBackend = (value) => {
  const normalized = stripTrailingSlash(value).toLowerCase();
  return LEGACY_HOST_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const normalizeBase = (value, fallback) => {
  const normalized = stripTrailingSlash(value);

  if (!normalized || isLegacyBackend(normalized)) {
    return fallback;
  }

  return normalized;
};

export const API_BASE = normalizeBase(process.env.REACT_APP_API_BASE, APP_RUNNER_API_BASE);
export const SERVER_URL = normalizeBase(process.env.REACT_APP_SERVER_URL, API_BASE);
