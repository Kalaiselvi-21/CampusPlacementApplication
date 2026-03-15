import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import toast from "react-hot-toast";
import axios from "axios";

const Login = () => {
  const API_BASE = process.env.REACT_APP_API_BASE;
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [userInfo, setUserInfo] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Check if user came from registration
    const urlParams = new URLSearchParams(location.search);
    const registeredEmail = urlParams.get("email");
    const registeredName = urlParams.get("name");

    if (registeredEmail && registeredName) {
      setUserInfo({
        email: registeredEmail,
        name: registeredName,
      });
      setFormData((prev) => ({ ...prev, email: registeredEmail }));
    }
  }, [location]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await login(formData.email, formData.password);
      const { user } = response;
      
      toast.success('Login successful!');
      
      // Handle different role redirections
      if (user.role === 'placement_representative') {
        // Check profile completion first
        if (!user.profile?.isProfileComplete) {
          navigate('/pr-profile-setup');
        } 
        // Check placement consent
        else if (!user.placementPolicyConsent?.hasAgreed) {
          navigate('/placement-consent');
        }
        // All checks passed, go to PR dashboard
        else {
          navigate('/pr-dashboard');
        }
      } else if (user.role === 'student') {
        // Check profile completion first
        if (!user.profile?.isProfileComplete) {
          navigate('/complete-profile');
        } 
        // Check placement consent
        else if (!user.placementPolicyConsent?.hasAgreed) {
          navigate('/placement-consent');
        }
        // Check OTP verification
        else if (!user.verificationStatus?.otpVerified) {
          navigate('/otp-verification');
        }
        // All checks passed, go to dashboard
        else {
          navigate('/dashboard');
        }
      } else if (user.role === 'placement_officer' || user.role === 'po') {
        navigate('/po-dashboard');
      } else {
        navigate('/dashboard');
      }
      
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = error.response?.data?.message || 'Login failed';
      toast.error(errorMessage);
      
      if (error.response?.data?.needsVerification) {
        setShowResendVerification(true);
        setResendEmail(formData.email);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      setLoading(true);
      console.log("Resending verification to:", resendEmail);

      await axios.post(`${API_BASE}/api/auth/resend-verification`, {
        email: resendEmail,
      });

      toast.success("Verification email sent! Please check your inbox.");
      setShowResendVerification(false);
    } catch (error) {
      console.error("Resend verification error:", error);

      if (!error.response) {
        toast.error(
          "Network error. Please check your connection and try again."
        );
      } else {
        toast.error(
          error.response?.data?.message || "Failed to send verification email"
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="card-white p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <img
              src="/gct_logo.png"
              alt="GCT Logo"
              className="w-16 h-16 object-contain"
            />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Campus Placement Portal
          </h2>
          {userInfo ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-center mb-2">
                <svg
                  className="w-5 h-5 text-green-500 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-green-800 font-medium">
                  Registration Successful!
                </span>
              </div>
              <p className="text-green-700 text-sm">
                Welcome <strong>{userInfo.name}</strong>! Your account has been
                created.
              </p>
              <p className="text-green-600 text-xs mt-1">
                Please check your email ({userInfo.email}) for verification
                link, then login below.
              </p>
            </div>
          ) : (
            <p className="text-gray-600">Sign in to your account</p>
          )}
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-all duration-300"
              placeholder="Enter your email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-all duration-300 pr-10"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-violet-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {showResendVerification && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800 mb-2">
              Didn't receive the verification email?
            </p>
            <button
              onClick={handleResendVerification}
              className="text-sm bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700"
            >
              Resend Verification Email
            </button>
          </div>
        )}

        <div className="text-center mt-6">
          <Link
            to="/register"
            className="text-violet-600 hover:text-violet-800 transition-colors duration-300 text-sm font-medium"
          >
            Don't have an account? Register
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;