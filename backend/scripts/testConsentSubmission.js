/**
 * Test consent submission to NeonDB
 */

require('dotenv').config();
const neonService = require('../services/database/neonService');

async function testConsentSubmission() {
  try {
    console.log('🧪 Testing consent submission...');
    
    // Test user ID (replace with actual user ID from your database)
    const testUserId = 'f7cd6795-6563-4d23-a514-7483fbb81ef4'; // From your error log
    
    console.log('📝 Submitting test consent...');
    await neonService.submitPlacementConsent(testUserId, {
      hasAgreed: true,
      signature: 'test-signature.jpg',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Browser'
    });
    
    console.log('✅ Consent submitted successfully');
    
    // Test OTP update
    console.log('📝 Testing OTP update...');
    await neonService.updateOTPVerification(testUserId, {
      otp_code: '123456',
      otp_expires: new Date(Date.now() + 2 * 60 * 1000),
      otp_verified: false,
      otp_attempts: 0,
      last_otp_sent: new Date()
    });
    
    console.log('✅ OTP updated successfully');
    
    // Verify data was saved
    console.log('🔍 Checking saved data...');
    const { sequelize } = require('../config/neonConnection');
    
    const [consentResults] = await sequelize.query(`
      SELECT * FROM placement_consents WHERE user_id = $1
    `, {
      bind: [testUserId]
    });
    
    const [otpResults] = await sequelize.query(`
      SELECT * FROM verification_status WHERE user_id = $1
    `, {
      bind: [testUserId]
    });
    
    console.log('📋 Consent data:', consentResults[0] || 'No data found');
    console.log('📋 OTP data:', otpResults[0] || 'No data found');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
if (require.main === module) {
  testConsentSubmission()
    .then(() => {
      console.log('🎉 Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = testConsentSubmission;