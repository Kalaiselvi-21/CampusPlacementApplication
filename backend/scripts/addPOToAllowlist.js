require('dotenv').config();
const { sequelize } = require('../config/neonConnection');

const addPOToAllowlist = async () => {
  try {
    console.log('[SETUP] Adding PO to pr_allowlist table...');
    
    const email = 'padm.71772314135@gct.ac.in';
    
    // Check if allowlist entry already exists
    const [existing] = await sequelize.query(`
      SELECT id, email, status FROM pr_allowlist WHERE email = $1
    `, { bind: [email] });
    
    if (existing.length > 0) {
      console.log('✅ PO already in allowlist!');
      console.log('   Email:', existing[0].email);
      console.log('   Status:', existing[0].status);
      
      // Update to approved if not already
      if (existing[0].status !== 'approved') {
        await sequelize.query(`
          UPDATE pr_allowlist 
          SET status = 'approved', approved_at = NOW(), updated_at = NOW()
          WHERE email = $1
        `, { bind: [email] });
        console.log('✅ Status updated to approved');
      }
      return;
    }
    
    // Create new allowlist entry
    console.log('Creating new allowlist entry...');
    
    const [result] = await sequelize.query(`
      INSERT INTO pr_allowlist (
        id, email, role, status, approved_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, 'placement_officer', 'approved', NOW(), NOW(), NOW()
      )
      RETURNING id, email, role, status
    `, {
      bind: [email]
    });
    
    const entry = result[0];
    console.log('\n✅ SUCCESS: PO added to allowlist!');
    console.log('   ID:', entry.id);
    console.log('   Email:', entry.email);
    console.log('   Role:', entry.role);
    console.log('   Status:', entry.status);
    console.log('\n📝 PO can now register at: http://localhost:3000/register');
    console.log('   Email:', email);
    console.log('   Password: (Use a strong password)');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
};

addPOToAllowlist();
