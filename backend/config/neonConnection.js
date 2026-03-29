const { Sequelize } = require('sequelize');

// NeonDB Connection Configuration
const sequelize = new Sequelize(process.env.NEON_DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  pool: {
    max: 50,
    min: 5,
    acquire: 30000,
    idle: 10000
  },
  logging: false,
  timezone: '+00:00'
});

// Test connection function
async function testNeonConnection() {
  try {
    console.log('[NEON] Attempting to connect to NeonDB...');
    await sequelize.authenticate();
    console.log('[NEON] ✓ NeonDB connection established successfully');
    return true;
  } catch (error) {
    console.error('[NEON] ✗ NeonDB connection failed:', error.message);
    return false;
  }
}

module.exports = { sequelize, testNeonConnection };
