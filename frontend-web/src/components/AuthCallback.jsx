import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    console.log('=== AUTH CALLBACK DEBUG ===');
    console.log('All search params:', Object.fromEntries(searchParams));
    
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');
    const error = searchParams.get('error');

    console.log('Token:', token ? 'Present' : 'Missing');
    console.log('User param:', userParam ? 'Present' : 'Missing');
    console.log('Error:', error);

    if (error) {
      console.log('Authentication error detected:', error);
      let errorMessage = 'Authentication failed';
      
      if (error === 'oauth_not_configured') {
        errorMessage = 'Google OAuth is not configured. Please contact administrator.';
      } else if (error === 'auth_failed') {
        errorMessage = 'Authentication failed. Please try again.';
      }
      
      toast.error(errorMessage);
      navigate('/login');
      return;
    }

    if (token && userParam) {
      try {
        console.log('Parsing user data...');
        const user = JSON.parse(decodeURIComponent(userParam));
        console.log('Parsed user:', user);
        
        // Use AuthContext login to set user and token
        login(user, token);
        
        toast.success('Login successful!');
        
        // Redirect based on user role and profile completion
        if (user.role === 'student') {
          if (!user.profile?.isProfileComplete) {
            navigate('/complete-profile');
          } else if (!user.placementPolicyConsent?.hasAgreed) {
            navigate('/placement-consent');
          } else if (!user.verificationStatus?.otpVerified) {
            navigate('/otp-verification');
          } else {
            navigate('/dashboard');
          }
        } else if (user.role === 'placement_representative') {
          if (!user.profile?.isProfileComplete) {
            navigate('/pr-profile-setup');
          } else if (!user.placementPolicyConsent?.hasAgreed) {
            navigate('/placement-consent');
          } else if (!user.verificationStatus?.otpVerified) {
            navigate('/otp-verification');
          } else {
            navigate('/pr-dashboard');
          }
        } else if (user.role === 'po') {
          navigate('/po-dashboard');
        } else {
          navigate('/dashboard');
        }
      } catch (error) {
        console.error('Error parsing user data:', error);
        toast.error('Authentication failed - invalid user data');
        navigate('/login');
      }
    } else {
      console.log('Missing token or user data');
      toast.error('Authentication failed - missing data');
      navigate('/login');
    }
  }, [searchParams, navigate, login]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <img
            src="/gct_logo.png"
            alt="GCT Logo"
            className="w-16 h-16 object-contain"
          />
        </div>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
