/**
 * Database Logger Utility
 * Provides consistent logging for all database operations
 */

const getTimestamp = () => {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
};

class DatabaseLogger {
  /**
   * Log operation attempt
   */
  logAttempt(db, operation, model, details = '') {
    const timestamp = getTimestamp();
    console.log(`[${timestamp}] [${db}] [${operation}] [${model}] [ATTEMPT] ${details}`);
  }

  /**
   * Log successful operation
   */
  logSuccess(db, operation, model, details = '', recordId = null) {
    const timestamp = getTimestamp();
    const idInfo = recordId ? ` | ID: ${recordId}` : '';
    console.log(`[${timestamp}] [${db}] [${operation}] [${model}] [SUCCESS]${idInfo} ${details}`);
  }

  /**
   * Log operation with record details
   */
  logRecord(db, operation, model, recordId, additionalInfo = '') {
    const timestamp = getTimestamp();
    console.log(`[${timestamp}] [${db}] [${operation}] [${model}] Record ID: ${recordId} ${additionalInfo}`);
  }

  /**
   * Log failed operation
   */
  logFailure(db, operation, model, error) {
    const timestamp = getTimestamp();
    const errorMsg = error?.message || error || 'Unknown error';
    console.error(`[${timestamp}] [${db}] [${operation}] [${model}] [FAILURE] ${errorMsg}`);
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation, model, duration, source) {
    const timestamp = getTimestamp();
    console.log(`[${timestamp}] [PERF] [${operation}] [${model}] Completed in ${duration}ms using ${source}`);
  }

  /**
   * Log critical system events
   */
  logCritical(message) {
    const timestamp = getTimestamp();
    console.error(`[${timestamp}] [CRITICAL] ${message}`);
  }

  /**
   * Log info messages
   */
  logInfo(message) {
    const timestamp = getTimestamp();
    console.log(`[${timestamp}] [INFO] ${message}`);
  }
}

module.exports = new DatabaseLogger();
