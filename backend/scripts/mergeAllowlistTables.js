require('dotenv').config();
const { sequelize } = require('../config/neonConnection');

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const getColumns = async (tableName) => {
  const [rows] = await sequelize.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    `,
    { bind: [tableName] }
  );
  return new Set(rows.map((row) => row.column_name));
};

const tableExists = async (tableName) => {
  const columns = await getColumns(tableName);
  return columns.size > 0;
};

async function mergeAllowlistTables() {
  try {
    console.log('[MERGE] Checking allowlist tables...');

    const singularExists = await tableExists('pr_allowlist');
    const pluralExists = await tableExists('pr_allowlists');

    if (!singularExists) {
      throw new Error('pr_allowlist table does not exist. Create it first.');
    }

    if (!pluralExists) {
      console.log('[MERGE] pr_allowlists does not exist. Nothing to merge.');
      return;
    }

    const singularColumns = await getColumns('pr_allowlist');
    const pluralColumns = await getColumns('pr_allowlists');

    const [legacyRows] = await sequelize.query('SELECT * FROM pr_allowlists');
    console.log(`[MERGE] Found ${legacyRows.length} rows in pr_allowlists`);

    let mergedCount = 0;

    for (const row of legacyRows) {
      const email = String(row.email || '').trim().toLowerCase();
      if (!email) {
        continue;
      }

      const role = normalizeRole(row.role) || 'placement_representative';
      const department = row.department || null;
      const notes = row.notes || null;
      const status = row.status || 'pending';

      const requestedAt = row.requested_at || row.created_at || new Date();
      const approvedAt = row.approved_at || row.approved_date || null;
      const approvedBy = row.approved_by || null;
      const rejectedAt = row.rejected_at || null;
      const rejectedBy = row.rejected_by || null;
      const rejectionReason = row.rejection_reason || null;

      const fieldNames = ['email', 'role', 'department', 'notes', 'status'];
      const bindValues = [email, role, department, notes, status];
      const valueRefs = ['$1', '$2', '$3', '$4', '$5'];

      if (singularColumns.has('requested_at')) {
        fieldNames.push('requested_at');
        bindValues.push(requestedAt);
        valueRefs.push(`$${bindValues.length}`);
      }

      if (singularColumns.has('approved_at')) {
        fieldNames.push('approved_at');
        bindValues.push(approvedAt);
        valueRefs.push(`$${bindValues.length}`);
      }

      if (singularColumns.has('approved_by')) {
        fieldNames.push('approved_by');
        bindValues.push(approvedBy);
        valueRefs.push(`$${bindValues.length}`);
      }

      if (singularColumns.has('rejected_at')) {
        fieldNames.push('rejected_at');
        bindValues.push(rejectedAt);
        valueRefs.push(`$${bindValues.length}`);
      }

      if (singularColumns.has('rejected_by')) {
        fieldNames.push('rejected_by');
        bindValues.push(rejectedBy);
        valueRefs.push(`$${bindValues.length}`);
      }

      if (singularColumns.has('rejection_reason')) {
        fieldNames.push('rejection_reason');
        bindValues.push(rejectionReason);
        valueRefs.push(`$${bindValues.length}`);
      }

      const updateClauses = [
        'role = EXCLUDED.role',
        'department = COALESCE(EXCLUDED.department, pr_allowlist.department)',
        'notes = COALESCE(EXCLUDED.notes, pr_allowlist.notes)',
        'status = EXCLUDED.status'
      ];

      if (singularColumns.has('requested_at')) {
        updateClauses.push('requested_at = COALESCE(pr_allowlist.requested_at, EXCLUDED.requested_at)');
      }
      if (singularColumns.has('approved_at')) {
        updateClauses.push('approved_at = COALESCE(EXCLUDED.approved_at, pr_allowlist.approved_at)');
      }
      if (singularColumns.has('approved_by')) {
        updateClauses.push('approved_by = COALESCE(EXCLUDED.approved_by, pr_allowlist.approved_by)');
      }
      if (singularColumns.has('rejected_at')) {
        updateClauses.push('rejected_at = COALESCE(EXCLUDED.rejected_at, pr_allowlist.rejected_at)');
      }
      if (singularColumns.has('rejected_by')) {
        updateClauses.push('rejected_by = COALESCE(EXCLUDED.rejected_by, pr_allowlist.rejected_by)');
      }
      if (singularColumns.has('rejection_reason')) {
        updateClauses.push('rejection_reason = COALESCE(EXCLUDED.rejection_reason, pr_allowlist.rejection_reason)');
      }
      if (singularColumns.has('updated_at')) {
        updateClauses.push('updated_at = NOW()');
      }

      await sequelize.query(
        `
        INSERT INTO pr_allowlist (${fieldNames.join(', ')})
        VALUES (${valueRefs.join(', ')})
        ON CONFLICT (email) DO UPDATE
        SET ${updateClauses.join(', ')}
        `,
        { bind: bindValues }
      );

      mergedCount += 1;
    }

    console.log(`[MERGE] Merged ${mergedCount} rows from pr_allowlists into pr_allowlist`);

    if (pluralColumns.has('email')) {
      await sequelize.query('DELETE FROM pr_allowlists');
      console.log('[MERGE] Cleared legacy pr_allowlists rows after successful merge');
    }

    console.log('[MERGE] Completed successfully.');
  } catch (error) {
    console.error('[MERGE] Failed:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  mergeAllowlistTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = mergeAllowlistTables;
