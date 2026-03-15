const { auth: authMiddleware } = require('../../middleware/auth');
const neonService = require('../../services/database/neonService');
const logger = require('../../services/database/logger');
const { emitResourceAdded } = require('../../utils/socketUtils');

const router = require('express').Router();

const isPRRole = (user) => {
  const normalized = user?.roleNormalized || String(user?.role || '').toLowerCase();
  return normalized === 'placement_representative' || normalized === 'pr';
};

const formatNeonResource = (row) => ({
  _id: row.id,
  id: row.id,
  title: row.title,
  type: row.type,
  department: row.department,
  urlOrPath: row.url_or_path,
  meta: row.meta || {},
  description: row.description || '',
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// List resources with optional department filter
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { department } = req.query;
    logger.logAttempt('NEON', 'READ', 'Resource', 'Fetching prep resources');

    let rows = [];
    if (department && department !== 'ALL') {
      rows = await neonService.executeRawQuery(
        `
        SELECT *
        FROM resources
        WHERE department = $1 OR department = 'ALL'
        ORDER BY created_at DESC
        `,
        [department]
      );
    } else {
      rows = await neonService.executeRawQuery(
        `
        SELECT *
        FROM resources
        ORDER BY created_at DESC
        `
      );
    }

    logger.logSuccess('NEON', 'READ', 'Resource', `Fetched ${rows.length} resources`);
    res.json({ resources: rows.map(formatNeonResource) });
  } catch (err) {
    logger.logFailure('NEON', 'READ', 'Resource', err.message || err);
    res.status(400).json({ message: err.message });
  }
});

// Add resource (PR only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (!isPRRole(req.user)) {
      return res.status(403).json({ message: 'Only PRs can add resources' });
    }

    const { title, type, department = 'ALL', urlOrPath, meta, description } = req.body;

    logger.logAttempt('NEON', 'CREATE', 'Resource', `Creating resource: ${title}`);
    const rows = await neonService.executeRawQuery(
      `
      INSERT INTO resources (
        id, title, type, department, url_or_path, meta, description, created_by, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6, $7, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        title,
        type,
        department,
        urlOrPath,
        JSON.stringify(meta || {}),
        description || '',
        req.user.id,
      ]
    );
    const item = formatNeonResource(rows[0]);
    logger.logSuccess('NEON', 'CREATE', 'Resource', 'Resource created', item.id);

    // Emit socket event if available
    const io = req.app.get('io');
    if (io) {
      emitResourceAdded(io, {
        resourceId: String(item._id || item.id),
        title: item.title,
        type: item.type,
        department: item.department,
        addedBy: req.user.profile?.name || req.user.email
      });
    }

    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;


