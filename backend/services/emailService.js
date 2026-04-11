const nodemailer = require('nodemailer');
const crypto = require('crypto');

let transporter;
let transporterInitPromise;

// Initialize transporter
const initializeTransporter = async () => {
  if (transporter) {
    return transporter;
  }

  if (transporterInitPromise) {
    return transporterInitPromise;
  }

  transporterInitPromise = (async () => {
  try {
    // Check if Gmail credentials are provided
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      console.log('Setting up Gmail SMTP...');
      
      const emailPass = String(process.env.EMAIL_PASS || '').replace(/\s+/g, '');

      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: emailPass
        },
            tls: {
              rejectUnauthorized: false
            }
      });
      
      console.log('✅ Using Gmail SMTP for email delivery');
      
      // Test the Gmail configuration
      await transporter.verify();
      console.log('✅ Gmail SMTP configuration verified successfully');
      
    } else {
      // Fallback to Ethereal for development
      console.log('Gmail credentials not found, using Ethereal test account...');
      const testAccount = await nodemailer.createTestAccount();
      
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        },
        tls: { rejectUnauthorized: false }

      });
      
      console.log('✅ Using Ethereal test email service');
      console.log('Test account created:', testAccount.user);
    }
    
  } catch (error) {
    console.error('❌ Email configuration failed:', error.message);
    
    // Fallback: create a dummy transporter that logs instead of sending
    transporter = {
      sendMail: async (mailOptions) => {
        console.log('📧 EMAIL WOULD BE SENT:');
        console.log('To:', mailOptions.to);
        console.log('Subject:', mailOptions.subject);
        console.log('Verification URL would be in the email body');
        return { messageId: 'dummy-id' };
      }
    };
    console.log('Using fallback email logger');
  }
  return transporter;
  })();

  return transporterInitPromise;
};

// Initialize when module loads
initializeTransporter();

const sendVerificationEmail = async (email, token) => {
  await initializeTransporter();

  // Make sure we're using the correct frontend URL
  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL;
  if (!frontendUrl) {
    throw new Error("FRONTEND_URL or CLIENT_URL must be set");
  }
  const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;
  
  console.log('=== EMAIL SERVICE DEBUG ===');
  console.log('Frontend URL:', frontendUrl);
  console.log('Full verification URL:', verificationUrl);
  
  const mailOptions = {
    from: `"Placement Management System" <${process.env.EMAIL_USER || 'noreply@placementapp.com'}>`,
    to: email,
    subject: 'Verify Your Email - Placement Management System',
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0; font-size: 28px;">Placement Management System</h1>
          </div>
          
          <h2 style="color: #333; margin-bottom: 20px;">Welcome to our platform!</h2>
          
          <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
            Thank you for registering with the Placement Management System. To complete your registration and start using our platform, please verify your email address by clicking the button below:
          </p>
          
          <div style="text-align: center; margin: 35px 0;">
            <a href="${verificationUrl}" 
               style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
                      color: white; 
                      padding: 15px 35px; 
                      text-decoration: none; 
                      border-radius: 8px; 
                      display: inline-block; 
                      font-weight: bold; 
                      font-size: 16px;
                      box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);">
              ✅ Verify Email Address
            </a>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <p style="color: #666; font-size: 14px; margin: 0; line-height: 1.5;">
              <strong>Can't click the button?</strong> Copy and paste this link into your browser:<br>
              <a href="${verificationUrl}" style="color: #2563eb; word-break: break-all;">${verificationUrl}</a>
            </p>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
              This verification link will expire in 24 hours for security reasons.<br>
              If you didn't create an account, please ignore this email.
            </p>
          </div>
        </div>
      </div>
    `,
    text: `
Welcome to Placement Management System!

Thank you for registering. Please verify your email address by visiting the following link:
${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account, please ignore this email.
    `
  };

  console.log(`📧 Sending verification email to: ${email}`);
  console.log(`🔗 Verification URL: ${verificationUrl}`);
  
  try {
    const info = await transporter.sendMail(mailOptions);
    
    // For Ethereal, show preview URL
    if (info.messageId && info.messageId !== 'dummy-id' && !process.env.EMAIL_USER) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log('📧 Preview email here: %s', previewUrl);
      }
    }
    
    console.log(`✅ Verification email sent successfully to: ${email}`);
    return info;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw error;
  }
};

const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const sendOTPEmail = async (email, otpCode, userName) => {
  await initializeTransporter();

  const mailOptions = {
    from: `"Placement Management System" <${process.env.EMAIL_USER || 'noreply@placementapp.com'}>`,
    to: email,
    subject: 'OTP Verification - Placement Policy Consent',
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0; font-size: 28px;">Placement Management System</h1>
          </div>
          
          <h2 style="color: #333; margin-bottom: 20px;">OTP Verification Required</h2>
          
          <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
            Hello ${userName},<br><br>
            You have successfully submitted your placement policy consent. To complete the verification process, please use the following One-Time Password (OTP):
          </p>
          
          <div style="text-align: center; margin: 35px 0;">
            <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
                        color: white; 
                        padding: 20px 40px; 
                        border-radius: 12px; 
                        display: inline-block; 
                        font-weight: bold; 
                        font-size: 32px;
                        letter-spacing: 8px;
                        box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);">
              ${otpCode}
            </div>
          </div>
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 25px 0;">
            <p style="color: #92400e; font-size: 14px; margin: 0; font-weight: 500;">
              ⚠️ <strong>Important:</strong> This OTP is valid for only 2 minutes. Do not share this code with anyone.
            </p>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <p style="color: #666; font-size: 14px; margin: 0; line-height: 1.5;">
              <strong>Security Note:</strong> If you didn't request this verification, please contact the placement office immediately.
            </p>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
              This OTP will expire in 2 minutes for security reasons.<br>
              Government College of Technology - Placement Cell
            </p>
          </div>
        </div>
      </div>
    `,
    text: `
Placement Management System - OTP Verification

Hello ${userName},

You have successfully submitted your placement policy consent. To complete the verification process, please use the following OTP:

OTP: ${otpCode}

This OTP is valid for 2 minutes only. Do not share this code with anyone.

If you didn't request this verification, please contact the placement office immediately.

Government College of Technology - Placement Cell
    `
  };

  console.log(`📧 Sending OTP email to: ${email}`);
  console.log(`🔐 OTP Code: ${otpCode}`);
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent successfully to: ${email}`);
    return info;
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  generateVerificationToken,
  sendOTPEmail
};





