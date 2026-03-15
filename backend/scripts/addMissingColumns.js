/**
 * Add any other missing columns that might be needed
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.NEON_DATABASE_URL, {
  dialect: 'postgres',
  logging: console.log,
  ssl: true,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

async function addMissingColumns() {
  try {
    console.log('🔗 Connecting to NeonDB...');
    await sequelize.authenticate();
    console.log('✅ Connected to NeonDB successfully');

    // Add marksheets column for multiple marksheet files
    console.log('📝 Adding marksheets column...');
    await sequelize.query(`
      ALTER TABLE user_profiles 
      ADD COLUMN IF NOT EXISTS marksheets TEXT[];
    `);
    
    // Add batch column if missing
    console.log('📝 Adding batch column...');
    await sequelize.query(`
      ALTER TABLE user_profiles 
      ADD COLUMN IF NOT EXISTS batch VARCHAR(50);
    `);
    
    // Add profile completion percentage
    console.log('📝 Adding profile_completion_percentage column...');
    await sequelize.query(`
      ALTER TABLE user_profiles 
      ADD COLUMN IF NOT EXISTS profile_completion_percentage INTEGER DEFAULT 0;
    `);
    
    console.log('✅ Successfully added all missing columns');
    
    // Show current table structure
    const [columns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'user_profiles'
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 Current user_profiles table structure:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await sequelize.close();
    console.log('🔒 Database connection closed');
  }
}

// Run the script
if (require.main === module) {
  addMissingColumns()
    .then(() => {
      console.log('🎉 Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = addMissingColumns;