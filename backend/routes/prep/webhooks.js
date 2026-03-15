const bodyParser = require('body-parser');
const { verifyQuizSignature } = require('../../services/quizGateway');
const neonService = require('../../services/database/neonService');
const logger = require('../../services/database/logger');

const router = require('express').Router();

const stripSlash = (value) => String(value || '').replace(/\/$/, '');
const DEFAULT_ORIGIN = stripSlash(process.env.EXPO_QUIZ_URL || 'https://placement-app-sewb.vercel.app/');
const ALLOWED_ORIGINS = [
  stripSlash(process.env.CLIENT_URL || ''),
  stripSlash(process.env.EXPO_QUIZ_URL || ''),
  'http://localhost:19006',
  'http://localhost:3000',
].filter(Boolean);

const getAllowedOrigin = (req) => {
  const origin = stripSlash(req.headers.origin || '');
  if (!origin) return DEFAULT_ORIGIN;
  return ALLOWED_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGIN;
};

router.get('/ping', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req));
  return res.json({ ok: true, route: '/api/prep/webhooks/ping' });
});

const upsertNeonSubmission = async ({ testId, userId, quizSessionId, score, total, correctCount, answers, submittedAt }) => {
  const columns = await neonService.getTableColumns('test_submissions');
  const hasAnswers = columns.includes('answers');

  if (hasAnswers) {
    await neonService.executeRawQuery(
      `
      INSERT INTO test_submissions (
        id, test_id, user_id, quiz_session_id, score, total, correct_count, answers, submitted_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW(), NOW()
      )
      ON CONFLICT (test_id, user_id)
      DO UPDATE SET
        quiz_session_id = EXCLUDED.quiz_session_id,
        score = EXCLUDED.score,
        total = EXCLUDED.total,
        correct_count = EXCLUDED.correct_count,
        answers = EXCLUDED.answers,
        submitted_at = EXCLUDED.submitted_at,
        updated_at = NOW()
      `,
      [
        testId,
        userId,
        quizSessionId || null,
        score || 0,
        total || 0,
        correctCount || null,
        JSON.stringify(answers || []),
        submittedAt || new Date().toISOString(),
      ]
    );
  } else {
    await neonService.executeRawQuery(
      `
      INSERT INTO test_submissions (
        id, test_id, user_id, quiz_session_id, score, total, correct_count, submitted_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
      )
      ON CONFLICT (test_id, user_id)
      DO UPDATE SET
        quiz_session_id = EXCLUDED.quiz_session_id,
        score = EXCLUDED.score,
        total = EXCLUDED.total,
        correct_count = EXCLUDED.correct_count,
        submitted_at = EXCLUDED.submitted_at,
        updated_at = NOW()
      `,
      [
        testId,
        userId,
        quizSessionId || null,
        score || 0,
        total || 0,
        correctCount || null,
        submittedAt || new Date().toISOString(),
      ]
    );
  }

  await neonService.executeRawQuery(
    `
    INSERT INTO test_assignments (id, test_id, user_id, role, enabled, status, created_at, updated_at)
    VALUES (gen_random_uuid(), $1, $2, 'student', true, 'completed', NOW(), NOW())
    ON CONFLICT (test_id, user_id)
    DO UPDATE SET status = 'completed', enabled = true, updated_at = NOW()
    `,
    [testId, userId]
  );
};

router.post('/quiz/submission', bodyParser.raw({ type: '*/*' }), async (req, res) => {
  try {
    const signature = req.header('X-Quiz-Signature');
    const rawBody = req.body.toString('utf8');
    if (!verifyQuizSignature(rawBody, signature)) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const payload = JSON.parse(rawBody);
    const { quizSessionId, userId, testId, score, total, correctCount, answers, submittedAt } = payload;

    const tests = await neonService.executeRawQuery('SELECT id FROM tests WHERE id = $1 LIMIT 1', [testId]);
    if (!tests[0]) {
      return res.status(404).json({ message: 'Test not found' });
    }

    await upsertNeonSubmission({
      testId,
      userId,
      quizSessionId,
      score,
      total,
      correctCount,
      answers,
      submittedAt: submittedAt ? new Date(submittedAt).toISOString() : new Date().toISOString(),
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('test:completed', { testId, userId, score, total });
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.logFailure('NEON', 'CREATE', 'TestSubmission', err.message || err);
    return res.status(400).json({ message: err.message });
  }
});

router.use((req, res, next) => {
  try {
    console.log('[prep/webhooks]', req.method, req.originalUrl);
  } catch (_) {}
  next();
});

router.options('/quiz/submission-simple', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  return res.sendStatus(204);
});

const handleSimpleSubmission = async (req, res) => {
  try {
    const { quizTitle, registerNo, score, total } = req.body || {};
    if (!quizTitle || !registerNo) {
      return res.status(400).json({ message: 'quizTitle and registerNo are required' });
    }

    const normalizedTitle = String(quizTitle).trim();
    const normalizedReg = String(registerNo).trim();

    let tests = await neonService.executeRawQuery(
      'SELECT id, title FROM tests WHERE LOWER(title) = LOWER($1) LIMIT 1',
      [normalizedTitle]
    );
    let test = tests[0] || null;

    let users = await neonService.executeRawQuery(
      `
      SELECT u.id
      FROM users u
      JOIN user_profiles up ON up.user_id = u.id
      WHERE LOWER(COALESCE(up.register_no, '')) = LOWER($1)
      LIMIT 1
      `,
      [normalizedReg]
    );
    let resolvedUser = users[0] || null;

    if (!test && resolvedUser) {
      const pending = await neonService.executeRawQuery(
        `
        SELECT t.id, t.title
        FROM test_assignments ta
        JOIN tests t ON t.id = ta.test_id
        WHERE ta.user_id = $1 AND ta.status IN ('in_progress', 'new')
        ORDER BY ta.updated_at DESC
        LIMIT 1
        `,
        [resolvedUser.id]
      );
      test = pending[0] || null;
    }

    if (!resolvedUser && test) {
      const inProgress = await neonService.executeRawQuery(
        `
        SELECT user_id
        FROM test_assignments
        WHERE test_id = $1 AND status = 'in_progress'
        ORDER BY updated_at DESC
        LIMIT 1
        `,
        [test.id]
      );
      if (inProgress[0]) {
        resolvedUser = { id: inProgress[0].user_id };
      }
    }

    if (!test || !resolvedUser) {
      res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req));
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      return res.status(200).json({ ok: true, note: 'Submission accepted, awaiting proper mapping (test/user not resolved)' });
    }

    await upsertNeonSubmission({
      testId: test.id,
      userId: resolvedUser.id,
      score,
      total,
      submittedAt: new Date().toISOString(),
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('test:completed', { testId: String(test.id), userId: String(resolvedUser.id), score, total });
    }

    res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.json({ ok: true });
  } catch (err) {
    logger.logFailure('NEON', 'CREATE', 'TestSubmission', err.message || err);
    res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(400).json({ message: err.message });
  }
};

router.post('/quiz/submission-simple', bodyParser.json(), handleSimpleSubmission);
router.post('/quiz/submission-simple/', bodyParser.json(), handleSimpleSubmission);

router.options('/submission-simple', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  return res.sendStatus(204);
});

router.post('/submission-simple', bodyParser.json(), handleSimpleSubmission);
router.post('/submission-simple/', bodyParser.json(), handleSimpleSubmission);

module.exports = router;
