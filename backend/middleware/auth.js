const jwt = require('jsonwebtoken');
const neonService = require('../services/database/neonService');
const logger = require('../services/database/logger');

const normalizeRole = (role) => {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (normalized === 'placementofficer') return 'placement_officer';
  if (normalized === 'placementrepresentative') return 'placement_representative';
  return normalized;
};

const auth = async (req, res, next) => {
  console.log('=== AUTH MIDDLEWARE DEBUG ===');
  
  const authHeader = req.header('Authorization');
  console.log('Headers:', authHeader);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('No valid authorization header');
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  const token = authHeader.replace('Bearer ', '');
  console.log('Extracted token:', token ? 'Token exists' : 'No token');
  
  if (!token || token === 'null' || token === 'undefined' || token.trim() === '') {
    console.log('Token is null, undefined, or empty');
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    console.log('Decoded token:', { userId: decoded.userId, email: decoded.email, role: decoded.role });
    
    let user = null;
    
    // Try NeonDB first
    try {
      logger.logAttempt('NEON', 'READ', 'User', `Auth check for user: ${decoded.userId}`);
      user = await neonService.findUserById(decoded.userId);

      // If ID-based lookup misses (e.g., stale JWT after account recreation),
      // try resolving by email in NeonDB.
      if (!user && decoded.email) {
          console.log('User not found by ID, trying email lookup...');
        user = await neonService.findUserByEmail(decoded.email.toLowerCase());
      }

      if (user) {
        console.log('Found user in NeonDB:', user.email);
        logger.logSuccess('NEON', 'READ', 'User', 'Auth verified', decoded.userId);
            } else {
              console.log('User not found in NeonDB');
      }
    } catch (neonError) {
      console.log('NeonDB lookup error:', neonError.message);
      logger.logFailure('NEON', 'READ', 'User', neonError.message || neonError);
    }

    if (!user) {
      console.log('❌ User not found in NeonDB. Email from token:', decoded.email);
      return res.status(401).json({ message: 'Token is not valid - user not found' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      roleNormalized: normalizeRole(user.role),
      name: user.name,
      isVerified: user.isVerified,
      profile: user.profile,
      placementPolicyConsent: user.placementPolicyConsent,
      verificationStatus: user.verificationStatus
    };
    
    console.log('✅ Auth successful');
    console.log('User Email:', user.email);
    console.log('Raw role from DB:', JSON.stringify(user.role));
    console.log('Normalized role:', JSON.stringify(req.user.roleNormalized));
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = { auth };






