/**
 * Setup NeonDB Schema
 * Creates all tables, indexes, and constraints in NeonDB
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../config/neonConnection');

async function setupNeonDB() {
  console.log('\n========================================');
  console.log('NEONDB SCHEMA SETUP');
  console.log('========================================\n');

  try {
    // Test connection
    console.log('1. Testing NeonDB connection...');
    await sequelize.authenticate();
    console.log('   ✓ Connected to NeonDB\n');

    // Read SQL schema file
    console.log('2. Reading schema file...');
    const schemaPath = path.join(__dirname, '../../neondb-migration-schema.sql');
    
    if (!fs.existsSync(schemaPath)) {
      console.error('   ✗ Schema file not found:', schemaPath);
      console.error('   Please ensure neondb-migration-schema.sql exists in the project root\n');
      process.exit(1);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    console.log('   ✓ Schema file loaded\n');

    // Execute schema
    console.log('3. Creating database schema...');
    console.log('   This may take a few moments...\n');
    
    await sequelize.query(schemaSql);
    console.log('   ✓ Schema created successfully\n');

    // Verify tables
    console.log('4. Verifying tables...');
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log(`   ✓ Created ${tables.length} tables:\n`);
    tables.forEach((table, index) => {
      console.log(`      ${index + 1}. ${table.table_name}`);
    });

    console.log('\n========================================');
    console.log('SETUP COMPLETE');
    console.log('========================================');
    console.log('✓ NeonDB schema is ready');
    console.log('✓ All tables, indexes, and constraints created');
    console.log('✓ You can now start the server with: npm start\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Setup failed:', error.message);
    console.error('\nFull error:', error);
    console.error('\nPlease check:');
    console.error('  1. Your NEON_DATABASE_URL in .env is correct');
    console.error('  2. The schema file exists and is valid');
    console.error('  3. You have proper permissions on NeonDB\n');
    process.exit(1);
  }
}

setupNeonDB();
