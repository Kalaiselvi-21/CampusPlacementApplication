const multer = require('multer');
const { auth: authMiddleware } = require('../../middleware/auth');
const { importQuiz } = require('../../services/quizGateway');
const neonService = require('../../services/database/neonService');
const logger = require('../../services/database/logger');
const { emitTestPublished, emitTestUpdated, emitTestDeleted } = require('../../utils/socketUtils');

const router = require('express').Router();

const DEPT_MAP = {
  CSE: 'CSE',
  'COMPUTER SCIENCE': 'CSE',
  'COMPUTER SCIENCE AND ENGINEERING': 'CSE',
  IT: 'IT',
  'INFORMATION TECHNOLOGY': 'IT',
  ECE: 'ECE',
  'ELECTRONICS AND COMMUNICATION ENGINEERING': 'ECE',
  EEE: 'EEE',
  'ELECTRICAL AND ELECTRONICS ENGINEERING': 'EEE',
  MECH: 'MECH',
  MECHANICAL: 'MECH',
  'MECHANICAL ENGINEERING': 'MECH',
  CIVIL: 'CIVIL',
  PROD: 'PROD',
  PRODUCTION: 'PROD',
  IBT: 'IBT',
  EIE: 'EIE',
};

const normalizeDepartment = (name) => {
  if (!name) return 'ALL';
  const key = String(name).trim().toUpperCase();
  return DEPT_MAP[key] || key;
};

const isPRRole = (user) => {
  const normalized = user?.roleNormalized || String(user?.role || '').toLowerCase();
  return normalized === 'placement_representative' || normalized === 'pr';
};

const toIsoOrNull = (value) => (value ? new Date(value).toISOString() : null);

const formatNeonTest = (row) => ({
  _id: row.id,
  id: row.id,
  title: row.title,
  description: row.description || '',
  department: row.department,
  durationMins: row.duration_mins,
  status: row.status,
  startAt: row.start_at,
  endAt: row.end_at,
  quizBackendId: row.quiz_backend_id,
  totalQuestions: row.total_questions,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', authMiddleware, async (req, res) => {
  try {
    if (!isPRRole(req.user)) {
      return res.status(403).json({ message: 'Only PRs can create tests' });
    }

    const { title, description, department, durationMins, startAt, endAt } = req.body;
    const dept = normalizeDepartment(department);

    logger.logAttempt('NEON', 'CREATE', 'Test', `Creating test: ${title}`);
    const rows = await neonService.executeRawQuery(
      `
      INSERT INTO tests (
        id, title, description, department, duration_mins, status, start_at, end_at, created_by, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, 'draft', $5, $6, $7, NOW(), NOW()
      )
      RETURNING *
      `,
      [title, description || '', dept, durationMins, toIsoOrNull(startAt), toIsoOrNull(endAt), req.user.id]
    );

    return res.status(201).json(formatNeonTest(rows[0]));
  } catch (err) {
    logger.logFailure('NEON', 'CREATE', 'Test', err.message || err);
    return res.status(400).json({ message: err.message });
  }
});

router.post('/:id/import', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!isPRRole(req.user)) {
      return res.status(403).json({ message: 'Only PRs can import tests' });
    }

    const rows = await neonService.executeRawQuery('SELECT * FROM tests WHERE id = $1 LIMIT 1', [req.params.id]);
    const test = rows[0] ? formatNeonTest(rows[0]) : null;
    if (!test) return res.status(404).json({ message: 'Test not found' });

    const meta = {
      title: test.title,
      department: test.department,
      durationMins: test.durationMins,
    };

    const result = await importQuiz(req.file.buffer, req.file.originalname, meta);

    await neonService.executeRawQuery(
      `
      UPDATE tests
      SET quiz_backend_id = $1, total_questions = $2, updated_at = NOW()
      WHERE id = $3
      `,
      [result.quizBackendId, result?.stats?.totalQuestions || null, req.params.id]
    );
    const updatedRows = await neonService.executeRawQuery('SELECT * FROM tests WHERE id = $1 LIMIT 1', [req.params.id]);
    return res.json({ test: formatNeonTest(updatedRows[0]) });
  } catch (err) {
    logger.logFailure('NEON', 'UPDATE', 'Test', err.message || err);
    return res.status(400).json({ message: err.message });
  }
});

router.post('/:id/publish', authMiddleware, async (req, res) => {
  try {
    if (!isPRRole(req.user)) {
      return res.status(403).json({ message: 'Only PRs can publish tests' });
    }

    const rows = await neonService.executeRawQuery(
      'UPDATE tests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      ['published', req.params.id]
    );
    const testRow = rows[0];
    if (!testRow) {
      return res.status(404).json({ message: 'Test not found' });
    }

    const deptCode = normalizeDepartment(testRow.department);
    const users = await neonService.executeRawQuery(
      `
      SELECT u.id, u.role
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE
        (u.role IN ('placement_representative', 'pr'))
        OR (
          u.role = 'student' AND (
            $1 = 'ALL'
            OR up.department = $1
            OR up.department = 'ALL'
          )
        )
      `,
      [deptCode]
    );

    for (const user of users) {
      const assignmentRole = user.role === 'student' ? 'student' : 'placement_representative';
      await neonService.executeRawQuery(
        `
        INSERT INTO test_assignments (id, test_id, user_id, role, enabled, status, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, true, 'new', NOW(), NOW())
        ON CONFLICT (test_id, user_id)
        DO UPDATE SET enabled = true, updated_at = NOW()
        `,
        [req.params.id, user.id, assignmentRole]
      );
    }

    const io = req.app.get('io');
    if (io) {
      emitTestPublished(io, {
        testId: testRow.id,
        title: testRow.title,
        durationMins: testRow.duration_mins,
        department: testRow.department,
        description: testRow.description,
        totalQuestions: testRow.total_questions,
      });
    }

    return res.json({ message: 'Published', testId: testRow.id });
  } catch (err) {
    logger.logFailure('NEON', 'UPDATE', 'Test', err.message || err);
    return res.status(400).json({ message: err.message });
  }
});

router.get('/available', authMiddleware, async (req, res) => {
  try {
    const rows = await neonService.executeRawQuery(
      `
      SELECT
        t.id,
        t.title,
        t.department,
        t.duration_mins,
        t.total_questions,
        t.status,
        ta.status AS assignment_status,
        t.start_at,
        t.end_at
      FROM test_assignments ta
      JOIN tests t ON t.id = ta.test_id
      WHERE ta.user_id = $1
        AND ta.enabled = true
        AND ta.status <> 'completed'
        AND t.status = 'published'
      ORDER BY t.created_at DESC
      `,
      [req.user.id]
    );

    return res.json({
      tests: rows.map((row) => ({
        id: row.id,
        title: row.title,
        department: row.department,
        durationMins: row.duration_mins,
        totalQuestions: row.total_questions,
        status: row.status,
        assignmentStatus: row.assignment_status,
        startAt: row.start_at,
        endAt: row.end_at,
      })),
    });
  } catch (err) {
    logger.logFailure('NEON', 'READ', 'TestAssignment', err.message || err);
    return res.status(400).json({ message: err.message });
  }
});

router.post('/:id/start', authMiddleware, async (req, res) => {
  try {
    const tests = await neonService.executeRawQuery('SELECT * FROM tests WHERE id = $1 LIMIT 1', [req.params.id]);
    const test = tests[0];
    if (!test || test.status !== 'published') {
      return res.status(404).json({ message: 'Test not available' });
    }

    const assignments = await neonService.executeRawQuery(
      'SELECT * FROM test_assignments WHERE test_id = $1 AND user_id = $2 AND enabled = true LIMIT 1',
      [req.params.id, req.user.id]
    );
    const assignment = assignments[0];
    if (!assignment) {
      return res.status(403).json({ message: 'Not assigned or not enabled' });
    }
    if (assignment.status && assignment.status !== 'new') {
      return res.status(400).json({ message: 'Test already started or completed' });
    }

    const now = new Date();
    if (test.start_at && now < new Date(test.start_at)) return res.status(400).json({ message: 'Test not started yet' });
    if (test.end_at && now > new Date(test.end_at)) return res.status(400).json({ message: 'Test ended' });

    await neonService.executeRawQuery(
      'UPDATE test_assignments SET status = $1, updated_at = NOW() WHERE test_id = $2 AND user_id = $3',
      ['in_progress', req.params.id, req.user.id]
    );

    const expoUrl = process.env.EXPO_QUIZ_URL || 'https://placement-app-sewb.vercel.app/';
    const quizUrl = `${expoUrl.replace(/\/$/, '')}/?quiz=${encodeURIComponent(test.title)}`;
    return res.json({ quizUrl });
  } catch (err) {
    logger.logFailure('NEON', 'UPDATE', 'TestAssignment', err.message || err);
    return res.status(400).json({ message: err.message });
  }
});

router.get('/past', authMiddleware, async (req, res) => {
  try {
    const rows = await neonService.executeRawQuery(
      `
      SELECT t.id, t.title, t.department, t.duration_mins
      FROM test_assignments ta
      JOIN tests t ON t.id = ta.test_id
      WHERE ta.user_id = $1 AND ta.status = 'completed'
      ORDER BY ta.updated_at DESC
      `,
      [req.user.id]
    );
    return res.json({
      tests: rows.map((t) => ({
        id: t.id,
        title: t.title,
        department: t.department,
        durationMins: t.duration_mins,
      })),
    });
  } catch (err) {
    logger.logFailure('NEON', 'READ', 'TestAssignment', err.message || err);
    return res.status(400).json({ message: err.message });
  }
});

router.get('/mine', authMiddleware, async (req, res) => {
  try {
    if (!isPRRole(req.user)) {
      return res.status(403).json({ message: 'Only PRs can view their tests' });
    }

    const rows = await neonService.executeRawQuery(
      'SELECT * FROM tests WHERE created_by = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    return res.json({ tests: rows.map(formatNeonTest) });
  } catch (err) {
    logger.logFailure('NEON', 'READ', 'Test', err.message || err);
    return res.status(400).json({ message: err.message });
  }
});

router.delete('/drafts', authMiddleware, async (req, res) => {
  try {
    if (!isPRRole(req.user)) {
      return res.status(403).json({ message: 'Only PRs can delete draft tests' });
    }

    const drafts = await neonService.executeRawQuery(
      'SELECT id, title, department FROM tests WHERE created_by = $1 AND status = $2',
      [req.user.id, 'draft']
    );

    if (!drafts.length) {
      return res.json({ message: 'No draft tests to delete', deleted: 0 });
    }

    for (const draft of drafts) {
      await neonService.executeRawQuery('DELETE FROM test_assignments WHERE test_id = $1', [draft.id]);
      await neonService.executeRawQuery('DELETE FROM tests WHERE id = $1', [draft.id]);
    }

    const io = req.app.get('io');
    if (io) {
      drafts.forEach((draft) => {
        emitTestDeleted(io, {
          testId: String(draft.id),
          title: draft.title,
          department: draft.department,
        });
      });
    }

    return res.json({ message: 'Draft tests deleted successfully', deleted: drafts.length });
  } catch (err) {
    logger.logFailure('NEON', 'DELETE', 'Test', err.message || err);
    return res.status(400).json({ message: err.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const rows = await neonService.executeRawQuery('SELECT * FROM tests WHERE id = $1 LIMIT 1', [req.params.id]);
    const test = rows[0] ? formatNeonTest(rows[0]) : null;
    if (!test) return res.status(404).json({ message: 'Test not found' });

    if (String(test.createdBy) !== String(req.user.id) && !isPRRole(req.user)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    return res.json(test);
  } catch (err) {
    logger.logFailure('NEON', 'READ', 'Test', err.message || err);
    return res.status(400).json({ message: err.message });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    if (!isPRRole(req.user)) {
      return res.status(403).json({ message: 'Only PRs can edit tests' });
    }

    const { title, description, department, durationMins, startAt, endAt } = req.body;

    const existingRows = await neonService.executeRawQuery('SELECT * FROM tests WHERE id = $1 LIMIT 1', [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: 'Test not found' });
    if (String(existing.created_by) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only edit your own tests' });
    }

    const updates = [];
    const values = [];
    let idx = 1;
    if (title !== undefined) {
      updates.push(`title = $${idx++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${idx++}`);
      values.push(description);
    }
    if (department !== undefined) {
      updates.push(`department = $${idx++}`);
      values.push(normalizeDepartment(department));
    }
    if (durationMins !== undefined) {
      updates.push(`duration_mins = $${idx++}`);
      values.push(durationMins);
    }
    if (startAt !== undefined) {
      updates.push(`start_at = $${idx++}`);
      values.push(toIsoOrNull(startAt));
    }
    if (endAt !== undefined) {
      updates.push(`end_at = $${idx++}`);
      values.push(toIsoOrNull(endAt));
    }

    updates.push('updated_at = NOW()');
    values.push(req.params.id);

    const rows = await neonService.executeRawQuery(
      `UPDATE tests SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    const updated = formatNeonTest(rows[0]);

    const io = req.app.get('io');
    if (io) {
      emitTestUpdated(io, {
        testId: String(updated.id),
        title: updated.title,
        department: updated.department,
        status: updated.status,
      });
    }

    return res.json(updated);
  } catch (err) {
    logger.logFailure('NEON', 'UPDATE', 'Test', err.message || err);
    return res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (!isPRRole(req.user)) {
      return res.status(403).json({ message: 'Only PRs can delete tests' });
    }

    const rows = await neonService.executeRawQuery('SELECT * FROM tests WHERE id = $1 LIMIT 1', [req.params.id]);
    const test = rows[0];
    if (!test) return res.status(404).json({ message: 'Test not found' });
    if (String(test.created_by) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only delete your own tests' });
    }

    await neonService.executeRawQuery('DELETE FROM test_assignments WHERE test_id = $1', [req.params.id]);
    await neonService.executeRawQuery('DELETE FROM tests WHERE id = $1', [req.params.id]);

    const io = req.app.get('io');
    if (io) {
      emitTestDeleted(io, {
        testId: req.params.id,
        title: test.title,
        department: test.department,
      });
    }

    return res.json({ message: 'Test deleted successfully' });
  } catch (err) {
    logger.logFailure('NEON', 'DELETE', 'Test', err.message || err);
    return res.status(400).json({ message: err.message });
  }
});

module.exports = router;
