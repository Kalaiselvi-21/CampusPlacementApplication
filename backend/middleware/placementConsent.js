const neonService = require('../services/database/neonService');

const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const requirePlacementConsent = async (req, res, next) => {
  try {
    // Only apply to students and placement representatives
    if (req.user.role !== 'student' && req.user.role !== 'placement_representative') {
      return next();
    }
    
    let user;
    if (isUuid(req.user.id)) {
      user = await neonService.findUserById(req.user.id);
    } else if (req.user.email) {
      user = await neonService.findUserByEmail(req.user.email.toLowerCase());
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check profile completion (handle both camelCase and snake_case)
    const isProfileComplete = user.profile?.isProfileComplete || user.profile?.is_profile_complete;
    if (!user.profile || !isProfileComplete) {
      return res.status(403).json({ 
        message: 'Profile completion required',
        needsProfileCompletion: true
      });
    }
    
    // Check placement consent (handle both camelCase and snake_case)
    const hasAgreed = user.placementPolicyConsent?.hasAgreed || 
                      user.placementPolicyConsent?.has_agreed ||
                      user.placement_policy_consent?.hasAgreed ||
                      user.placement_policy_consent?.has_agreed;
    if (!hasAgreed) {
      return res.status(403).json({ 
        message: 'Placement policy consent required',
        needsPlacementConsent: true
      });
    }

    // Check OTP verification (handle both camelCase and snake_case)
    const otpVerified = user.verificationStatus?.otpVerified ||
                        user.verificationStatus?.otp_verified ||
                        user.verification_status?.otpVerified ||
                        user.verification_status?.otp_verified;
    if (!otpVerified) {
      return res.status(403).json({ 
        message: 'OTP verification required',
        needsOtpVerification: true
      });
    }
    
    next();
  } catch (error) {
    console.error('Placement consent middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { requirePlacementConsent };




