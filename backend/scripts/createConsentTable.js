/**
 * Create placement_consents table if it doesn't exist
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

async function createConsentTable() {
  try {
    console.log('🔗 Connecting to NeonDB...');
    await sequelize.authenticate();
    console.log('✅ Connected to NeonDB successfully');

    // Check if table exists
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'placement_consents';
    `);

    if (tables.length === 0) {
      console.log('📝 Creating placement_consents table...');
      await sequelize.query(`
        CREATE TABLE placement_consents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          has_agreed BOOLEAN DEFAULT FALSE,
          agreed_at TIMESTAMP,
          signature VARCHAR(500),
          ip_address VARCHAR(45),
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id)
        );
      `);
      console.log('✅ Created placement_consents table');
    } else {
      console.log('✅ placement_consents table already exists');
    }

    // Check if verification_status table exists
    const [verificationTables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'verification_status';
    `);

    if (verificationTables.length === 0) {
      console.log('📝 Creating verification_status table...');
      await sequelize.query(`
        CREATE TABLE verification_status (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          otp_verified BOOLEAN DEFAULT FALSE,
          is_verified BOOLEAN DEFAULT FALSE,
          otp_code VARCHAR(10),
          otp_expires TIMESTAMP,
          otp_attempts INTEGER DEFAULT 0,
          otp_resend_count INTEGER DEFAULT 0,
          last_otp_sent TIMESTAMP,
          verified_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id)
        );
      `);
      console.log('✅ Created verification_status table');
    } else {
      console.log('✅ verification_status table already exists');
    }

    // Show table structures
    console.log('📋 Table structures:');
    
    const [consentColumns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'placement_consents'
      ORDER BY ordinal_position;
    `);
    
    console.log('placement_consents columns:');
    consentColumns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    const [verificationColumns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'verification_status'
      ORDER BY ordinal_position;
    `);
    
    console.log('verification_status columns:');
    verificationColumns.forEach(col => {
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
  createConsentTable()
    .then(() => {
      console.log('🎉 Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = createConsentTable;