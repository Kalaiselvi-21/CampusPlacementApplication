/**
 * Verify NeonDB Migration Status
 * Checks database tables and migration completeness
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.NEON_DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

async function verifyMigration() {
  try {
    console.log('🔍 Verifying NeonDB Migration Status\n');
    console.log('='.repeat(80));
    
    // Check connection
    await sequelize.authenticate();
    console.log('✅ NeonDB connection successful\n');
    
    // Check all required tables
    const requiredTables = [
      'users',
      'user_profiles',
      'job_drives',
      'job_drive_applications',
      'placement_consents',
      'verification_status',
      'cgpa_references',
      'placed_students',
      'placement_analytics',
      'pr_allowlist',
      'resources',
      'tests',
      'test_assignments',
      'test_submissions',
      'deleted_users',
      'deletion_requests'
    ];
    
    console.log('📋 Checking Required Tables:\n');
    
    for (const table of requiredTables) {
      try {
        const [result] = await sequelize.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = '${table}'
          );
        `);
        
        if (result[0].exists) {
          // Get row count
          const [countResult] = await sequelize.query(`SELECT COUNT(*) as count FROM ${table}`);
          const count = countResult[0].count;
          console.log(`   ✅ ${table.padEnd(30)} (${count} rows)`);
        } else {
          console.log(`   ❌ ${table.padEnd(30)} MISSING`);
        }
      } catch (error) {
        console.log(`   ❌ ${table.padEnd(30)} ERROR: ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 Migration Summary:\n');
    
    // Check for UUID vs ObjectId users
    const [users] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 1 END) as uuid_users
      FROM users
    `);
    
    console.log(`   Total Users: ${users[0].total}`);
    console.log(`   UUID Users (NeonDB): ${users[0].uuid_users}`);
    console.log(`   Legacy Users: ${users[0].total - users[0].uuid_users}`);
    
    // Check job drives
    const [drives] = await sequelize.query(`SELECT COUNT(*) as count FROM job_drives`);
    console.log(`\n   Total Job Drives: ${drives[0].count}`);
    
    // Check applications
    const [apps] = await sequelize.query(`SELECT COUNT(*) as count FROM job_drive_applications`);
    console.log(`   Total Applications: ${apps[0].count}`);
    
    // Check consents
    const [consents] = await sequelize.query(`SELECT COUNT(*) as count FROM placement_consents`);
    console.log(`   Total Consents: ${consents[0].count}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Migration verification complete!\n');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  verifyMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = verifyMigration;
