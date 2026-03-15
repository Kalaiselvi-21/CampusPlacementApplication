const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const sequelize = new Sequelize(process.env.NEON_DATABASE_URL || '', {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: console.log
});

async function applyViewFix() {
  try {
    console.log('Connecting to NeonDB...');
    await sequelize.authenticate();
    console.log('✓ Connected to NeonDB');

    // Read the SQL file
    const sqlPath = path.join(__dirname, 'createMissingTables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('\nCreating tables and updating view...');
    await sequelize.query(sql);
    console.log('✓ Tables created and view updated successfully');

    // Test the view
    console.log('\nTesting updated view...');
    const [results] = await sequelize.query('SELECT * FROM v_users_complete LIMIT 1');
    console.log('✓ View is working');
    console.log('Sample columns:', Object.keys(results[0] || {}));

    await sequelize.close();
    console.log('\n✓ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyViewFix();
