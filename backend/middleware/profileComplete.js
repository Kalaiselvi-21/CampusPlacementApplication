const neonService = require('../services/database/neonService');

const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const requireCompleteProfile = async (req, res, next) => {
  try {
    // Only apply to students
    if (req.user.role !== 'student') {
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
    
    // Check profile completion
    const isComplete = user.profile?.isProfileComplete || user.profile?.is_profile_complete;
    if (!isComplete) {
      const response = { 
        message: 'Profile completion required',
        needsProfileCompletion: true
      };
      
      if (user.profile?.profileCompletionPercentage) {
        response.completionPercentage = user.profile.profileCompletionPercentage;
      }
      
      return res.status(403).json(response);
    }
    
    next();
  } catch (error) {
    console.error('Profile complete middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { requireCompleteProfile };



