import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
const API_BASE = process.env.REACT_APP_API_BASE;

const OTPVerification = () => {
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes to match OTP expiry
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user already has OTP verified
    if (user?.verificationStatus?.otpVerified) {
      if (user.role === 'placement_representative') {
        navigate('/pr-dashboard');
      } else {
        navigate('/dashboard');
      }
      return;
    }

    // Check if user has consent but no OTP - stay on this page
    if (!user?.placementPolicyConsent?.hasAgreed) {
      navigate('/placement-consent');
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [user, navigate]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!otpCode || otpCode.length !== 6) {
      alert('Please enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      console.log('Submitting OTP:', otpCode);
      
      const response = await axios.post(`${API_BASE}/api/placement-consent/verify-otp`, 
        { otpCode: otpCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('OTP verification response:', response.data);

      // Update user context with verified status
      const updatedUser = {
        ...user,
        verificationStatus: {
          ...user.verificationStatus,
          otpVerified: true,
          isVerified: true,
          verifiedAt: new Date()
        }
      };
      updateUser(updatedUser);

      console.log('OTP verified, navigating to dashboard');
      alert('OTP verified successfully! Welcome to the placement portal.');

      // Navigate based on user role
      if (user.role === 'student') {
        navigate('/dashboard');
      } else if (user.role === 'placement_representative') {
        navigate('/pr-dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      console.error('Error response:', error.response?.data);
      
      const errorData = error.response?.data;
      let errorMessage = 'OTP verification failed';
      
      if (errorData?.expired) {
        errorMessage = 'OTP has expired. Please request a new one.';
      } else if (errorData?.attemptsLeft !== undefined) {
        errorMessage = `Invalid OTP. ${errorData.attemptsLeft} attempts remaining.`;
      } else if (errorData?.needsNewOtp) {
        errorMessage = 'Too many failed attempts. Please request a new OTP.';
      } else if (errorData?.message) {
        errorMessage = errorData.message;
      }
      
      alert(errorMessage);
      
      // If expired or needs new OTP, clear the input
      if (errorData?.expired || errorData?.needsNewOtp) {
        setOtpCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await axios.post(`${API_BASE}/api/placement-consent/resend-otp`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Resend OTP response:', response.data);
      
      const data = response.data;
      let message = `New OTP sent to your email (${data.email})! Please check your inbox.`;
      
      if (data.remainingResends !== undefined) {
        message += ` You have ${data.remainingResends} resend attempts remaining.`;
      }
      
      alert(message);
      setTimeLeft(120); // Reset timer to 2 minutes
      setOtpCode(''); // Clear current input
    } catch (error) {
      console.error('Error resending OTP:', error);
      
      const errorData = error.response?.data;
      let errorMessage = 'Failed to resend OTP';
      
      if (errorData?.maxLimitReached) {
        errorMessage = 'Maximum resend limit reached. Please contact support.';
      } else if (errorData?.waitTime) {
        errorMessage = `Please wait ${errorData.waitTime} seconds before requesting a new OTP.`;
      } else if (errorData?.message) {
        errorMessage = errorData.message;
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 flex items-center justify-center mb-4">
            <img
              src="/gct_logo.png"
              alt="GCT Logo"
              className="w-16 h-16 object-contain"
            />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Verify Your Identity</h2>
          <p className="text-gray-600 mt-2">
            Enter the 6-digit OTP to complete your placement registration
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
              <p className="text-sm font-medium text-blue-800">OTP Code (Demo)</p>
              <p className="text-xs text-blue-600">Check console or contact admin for OTP</p>
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={loading}
                className="text-xs text-blue-700 underline mt-1"
              >
                Click here to get new OTP
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter OTP Code
            </label>
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl font-mono tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength="6"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
            />
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              Time remaining: <span className="font-mono font-medium text-red-600">{formatTime(timeLeft)}</span>
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || otpCode.length !== 6 || timeLeft === 0}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResendOTP}
              disabled={timeLeft > 0 || loading}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {timeLeft > 0 ? `Resend OTP (${formatTime(timeLeft)})` : 'Resend OTP'}
            </button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/placement-consent')}
            className="text-gray-600 hover:text-gray-800 text-sm"
          >
            ← Back to Consent Form
          </button>
        </div>
      </div>
    </div>
  );
};

export default OTPVerification;
