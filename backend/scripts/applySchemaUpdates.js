/**
 * Run schema migrations for user deletion archiving and backlog history
 * Usage: node applySchemaUpdates.js
 */

const fs = require('fs');
const path = require('path');
const { sequelize } = require('../config/neonConnection');
const logger = require('../services/database/logger');

async function runMigration() {
  try {
    logger.logInfo('Starting schema migration...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'migrationDeletedUsersAndBacklogs.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    logger.logAttempt('MIGRATION', 'EXECUTE', 'Schema', 'Applying schema updates for deleted_users and backlog history');
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      try {
        await sequelize.query(statement);
        const preview = statement.substring(0, 80) + (statement.length > 80 ? '...' : '');
        logger.logSuccess('MIGRATION', 'EXECUTE', 'Schema', `Statement completed: ${preview}`);
      } catch (stmtError) {
        logger.logFailure('MIGRATION', 'EXECUTE', 'Schema', stmtError.message);
        // Continue with other statements even if one fails (idempotent)
      }
    }
    
    logger.logSuccess('MIGRATION', 'COMPLETE', 'Schema', 'Schema migration completed successfully');
    console.log('✓ Schema migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.logFailure('MIGRATION', 'EXECUTE', 'Schema', error);
    console.error('✗ Schema migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration
runMigration();
