// Test NeonDB job drive creation
require('dotenv').config();
const { sequelize } = require('./config/neonConnection');
const neonService = require('./services/database/neonService');

async function testNeonCreate() {
  try {
    console.log('\n🧪 Testing NeonDB Job Drive Creation...\n');
    
    // Connect to NeonDB
    await sequelize.authenticate();
    console.log('✅ Connected to NeonDB\n');
    
    // Get a sample user ID from NeonDB to use as createdBy
    const [users] = await sequelize.query('SELECT id, email, role FROM users WHERE role IN ($1, $2) LIMIT 1', {
      bind: ['placement_officer', 'po']
    });
    
    if (users.length === 0) {
      console.log('❌ No placement officer found in NeonDB. Cannot test.');
      console.log('   Need a user with role "placement_officer" or "po"');
      
      // Show all users
      const [allUsers] = await sequelize.query('SELECT id, email, role FROM users LIMIT 5');
      console.log('\nFirst 5 users in NeonDB:');
      allUsers.forEach(u => console.log(`  - ${u.email} (${u.role}) - ID: ${u.id}`));
      
      process.exit(1);
    }
    
    const creatorId = users[0].id;
    console.log(`Using creator: ${users[0].email} (${users[0].role})`);
    console.log(`Creator ID: ${creatorId}\n`);
    
    // Test job drive data
    const testDrive = {
      companyName: 'Test Company Inc.',
      companyWebsite: 'https://testcompany.com',
      companyDescription: 'A test company for testing',
      role: 'Software Engineer',
      jobType: 'full-time',
      description: 'Test job description',
      requirements: 'Test requirements',
      skills: ['JavaScript', 'Node.js'],
      ctc: '12.5',
      driveMode: 'on-campus',
      location: 'Bangalore',
      locations: ['Bangalore', 'Mumbai'],
      date: '2026-04-15',
      time: '10:00:00',
      deadline: '2026-04-10',
      applicationDeadlineTime: '17:00:00',
      venue: 'Auditorium',
      isDreamJob: false,
      unplacedOnly: false,
      eligibility: {
        minCGPA: 7.0,
        maxBacklogs: 0,
        allowedDepartments: ['Computer Science', 'IT'],
        allowedBatches: ['2026', '2027']
      },
      spocDept: 'Placement Cell',
      createdBy: creatorId
    };
    
    console.log('📝 Test drive data:');
    console.log(JSON.stringify(testDrive, null, 2));
    console.log('\n🚀 Attempting to create job drive in NeonDB...\n');
    
    const result = await neonService.createJobDrive(testDrive);
    
    console.log('\n✅ SUCCESS! Job drive created in NeonDB:');
    console.log(JSON.stringify(result, null, 2));
    
    // Verify it exists
    console.log('\n🔍 Verifying creation...');
    const [drives] = await sequelize.query('SELECT COUNT(*) as count FROM job_drives');
    console.log(`Total drives in NeonDB: ${drives[0].count}`);
    
    // Clean up - delete the test drive
    console.log('\n🗑️  Cleaning up test drive...');
    await sequelize.query('DELETE FROM job_drives WHERE company_name = $1', {
      bind: ['Test Company Inc.']
    });
    console.log('✅ Test drive deleted\n');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nFull error:', error);
    console.error('\nStack:', error.stack);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

testNeonCreate();
