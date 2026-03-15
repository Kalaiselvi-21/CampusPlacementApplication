/**
 * Database Service - NeonDB Only
 * Direct interface to NeonDB operations
 * No fallback logic - NeonDB is the single source of truth
 */

const neonService = require('./neonService');
const logger = require('./logger');

class DatabaseService {
  constructor() {
    this.neonAvailable = false;
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    logger.logInfo('Initializing NeonDB service...');

    try {
      this.neonAvailable = await neonService.checkConnection();
      if (this.neonAvailable) {
        logger.logInfo('✓ NeonDB initialized successfully');
      } else {
        logger.logCritical('✗ NeonDB connection failed');
        throw new Error('NeonDB connection failed');
      }
    } catch (error) {
      logger.logFailure('NEON', 'CONNECT', 'System', error);
      throw error;
    }

    return { neon: this.neonAvailable };
  }

  /**
   * Execute NeonDB operation
   */
  async executeOperation(operation, ...args) {
    if (!this.neonAvailable) {
      throw new Error('NeonDB not available');
    }

    const startTime = Date.now();
    
    try {
      logger.logAttempt('NEON', operation.toUpperCase(), 'Database', '');
      
      const result = await neonService[operation](...args);

      const duration = Date.now() - startTime;
      const recordId = result?.id || result?._id || result?.dataValues?.id || 'N/A';
      logger.logSuccess('NEON', operation.toUpperCase(), 'Database', `Completed in ${duration}ms`, recordId);
      logger.logPerformance(operation, 'Database', duration, 'NeonDB');
      
      return { success: true, data: result, source: 'neon' };
    } catch (error) {
      logger.logFailure('NEON', operation.toUpperCase(), 'Database', error);
      throw error;
    }
  }

  /**
   * Delete user with automatic PR allowlist cleanup
   */
  async deleteUserWithCleanup(userId) {
    const startTime = Date.now();

    try {
      logger.logAttempt('NEON', 'DELETE_USER_WITH_CLEANUP', 'User', `Deleting user with cleanup: ${userId}`);
      
      const result = await neonService.deleteUserById(userId);

      const duration = Date.now() - startTime;
      logger.logSuccess('NEON', 'DELETE_USER_WITH_CLEANUP', 'User', `Completed in ${duration}ms`, userId);
      logger.logPerformance('DELETE_USER_WITH_CLEANUP', 'User', duration, 'NeonDB');
      
      return { success: true, data: result, source: 'neon' };
    } catch (error) {
      logger.logFailure('NEON', 'DELETE_USER_WITH_CLEANUP', 'User', error);
      throw error;
    }
  }

  /**
   * Get database status
   */
  getStatus() {
    return {
      database: 'NeonDB',
      neon: neonService.getConnectionStatus()
    };
  }
}

module.exports = new DatabaseService();
