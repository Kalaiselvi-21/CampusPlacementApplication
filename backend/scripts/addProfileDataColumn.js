/**
 * Add missing profile_data column to user_profiles table
 * This fixes the file upload error
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

// Create connection using environment variables
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

async function addProfileDataColumn() {
  try {
    console.log('🔗 Connecting to NeonDB...');
    await sequelize.authenticate();
    console.log('✅ Connected to NeonDB successfully');

    console.log('📝 Adding profile_data column...');
    await sequelize.query(`
      ALTER TABLE user_profiles 
      ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'::jsonb;
    `);
    
    console.log('✅ Successfully added profile_data column to user_profiles table');
    
    // Verify the column was added
    const [results] = await sequelize.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_profiles' 
      AND column_name = 'profile_data';
    `);
    
    if (results.length > 0) {
      console.log('✅ Verified: profile_data column exists');
      console.log('Column details:', results[0]);
    } else {
      console.log('❌ Column not found after creation');
    }
    
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
  addProfileDataColumn()
    .then(() => {
      console.log('🎉 Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = addProfileDataColumn;