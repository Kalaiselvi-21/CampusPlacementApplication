/**
 * Create missing tables in NeonDB
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.NEON_DATABASE_URL, {
  dialect: 'postgres',
  logging: console.log,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

async function createMissingTables() {
  try {
    console.log('🔧 Creating Missing Tables in NeonDB\n');
    console.log('='.repeat(80));
    
    await sequelize.authenticate();
    console.log('✅ Connected to NeonDB\n');
    
    // Create pr_allowlist table
    console.log('📝 Creating pr_allowlist table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS pr_allowlist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        role VARCHAR(50) NOT NULL,
        department VARCHAR(255),
        notes TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP,
        approved_by UUID REFERENCES users(id),
        rejected_at TIMESTAMP,
        rejected_by UUID REFERENCES users(id),
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ pr_allowlist table created\n');
    
    // Create indexes
    console.log('📝 Creating indexes...');
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_pr_allowlist_email ON pr_allowlist(email);
      CREATE INDEX IF NOT EXISTS idx_pr_allowlist_status ON pr_allowlist(status);
      CREATE INDEX IF NOT EXISTS idx_pr_allowlist_role ON pr_allowlist(role);
    `);
    console.log('✅ Indexes created\n');
    
    console.log('='.repeat(80));
    console.log('✅ All missing tables created successfully!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  createMissingTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createMissingTables;
