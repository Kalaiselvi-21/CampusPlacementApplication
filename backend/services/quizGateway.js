const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Default to deployed quiz backend to avoid localhost in production
const QUIZ_BASE_URL = process.env.QUIZ_BASE_URL || 'https://placement-app-kg7c.onrender.com';
const QUIZ_API_KEY = process.env.QUIZ_API_KEY || '';
const QUIZ_WEBHOOK_SECRET = process.env.QUIZ_WEBHOOK_SECRET || 'quiz_webhook_secret';

const importQuiz = async (fileBuffer, filename, metadata) => {
  const formData = new (require('form-data'))();
  formData.append('file', fileBuffer, filename);
  Object.entries(metadata || {}).forEach(([k, v]) => formData.append(k, v));

  const res = await axios.post(`${QUIZ_BASE_URL}/quizzes/import`, formData, {
    headers: {
      ...formData.getHeaders(),
      'x-api-key': QUIZ_API_KEY,
    },
  });
  return res.data; // { quizBackendId, stats }
};

const createLaunchToken = ({ userId, testId, quizBackendId, role, department, ttlSeconds = 7200 }) => {
  const payload = { sub: userId, testId, quizBackendId, role, department };
  const token = jwt.sign(payload, process.env.QUIZ_LAUNCH_SECRET || process.env.JWT_SECRET, {
    expiresIn: ttlSeconds,
    issuer: 'gstep-backend',
    audience: 'quiz-backend',
  });
  return token;
};

const verifyQuizSignature = (rawBody, signature) => {
  const hmac = crypto.createHmac('sha256', QUIZ_WEBHOOK_SECRET);
  hmac.update(rawBody, 'utf8');
  const digest = `sha256=${hmac.digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature || ''));
};

module.exports = { importQuiz, createLaunchToken, verifyQuizSignature };







