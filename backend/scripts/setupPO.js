require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/neonConnection');

const setupPO = async () => {
  try {
    console.log('[SETUP] Setting up PO account: padm.71772314135@gct.ac.in');
    
    const email = 'padm.71772314135@gct.ac.in';
    const password = 'Padm@123'; // Default password - user should change after first login
    const name = 'Padmanaban S'; // PO Name
    
    // Check if user already exists
    const [existing] = await sequelize.query(`
      SELECT id, email, role FROM users WHERE email = $1
    `, { bind: [email] });
    
    if (existing.length > 0) {
      const user = existing[0];
      if (user.role === 'placement_officer' || user.role === 'po') {
        console.log('✅ PO account already exists!');
        console.log('   Email:', user.email);
        console.log('   Role:', user.role);
        console.log('   ID:', user.id);
        console.log('\n📝 Login at: http://localhost:3000/login');
        console.log('   Email:', email);
        console.log('   Password: (your existing password)');
        return;
      } else {
        // Update existing user to PO
        console.log('⚠️  User exists but not a PO. Updating role...');
        await sequelize.query(`
          UPDATE users SET role = 'placement_officer', updated_at = NOW()
          WHERE email = $1
        `, { bind: [email] });
        console.log('✅ User role updated to placement_officer');
        console.log('\n📝 Login at: http://localhost:3000/login');
        console.log('   Email:', email);
        console.log('   Password: (your existing password)');
        return;
      }
    }
    
    // Create new PO user
    console.log('Creating new PO account...');
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const [result] = await sequelize.query(`
      INSERT INTO users (
        id, name, email, password, role, is_verified, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, 'placement_officer', true, NOW(), NOW()
      )
      RETURNING id, name, email, role
    `, {
      bind: [name, email, hashedPassword]
    });
    
    const newUser = result[0];
    console.log('\n✅ SUCCESS: PO account created!');
    console.log('   ID:', newUser.id);
    console.log('   Name:', newUser.name);
    console.log('   Email:', newUser.email);
    console.log('   Role:', newUser.role);
    console.log('   Default Password:', password);
    console.log('\n📝 Login at: http://localhost:3000/login');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('\n⚠️  IMPORTANT: Change password after first login!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    process.exit(0);
  }
};

setupPO();
