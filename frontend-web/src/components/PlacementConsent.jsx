import { API_BASE } from '../config/api';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
  
const PlacementConsent = () => {
  const [policy, setPolicy] = useState(null);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [signatureFile, setSignatureFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user already has consent and OTP verified - go to dashboard
    if (user?.placementPolicyConsent?.hasAgreed && user?.verificationStatus?.otpVerified) {
      navigate('/dashboard');
      return;
    }
    
    // Check if user has consent but needs OTP verification - go to OTP page
    if (user?.placementPolicyConsent?.hasAgreed && !user?.verificationStatus?.otpVerified) {
      navigate('/otp-verification');
      return;
    }
    
    // If no consent yet, stay on this page and fetch policy
    if (!user?.placementPolicyConsent?.hasAgreed) {
      fetchPolicy();
    }
  }, [user, navigate]);

  const fetchPolicy = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE}/api/placement-consent/policy`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPolicy(response.data.policy);
    } catch (error) {
      console.error('Error fetching policy:', error);
      alert('Failed to load placement policy');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!hasAgreed) {
      alert('Please agree to the placement policy');
      return;
    }
    
    if (!signatureFile) {
      alert('Please upload your signature');
      return;
    }

    setSubmitting(true);
    
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('hasAgreed', 'true');
      formData.append('signature', signatureFile);

      console.log('Submitting consent form...');
      
      const response = await axios.post(`${API_BASE}/api/placement-consent/consent`, 
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('Consent response:', response.data);
      
      // Update user context with consent status
      const updatedUser = {
        ...user,
        placementPolicyConsent: {
          hasAgreed: true,
          agreedAt: new Date()
        },
        verificationStatus: {
          ...user.verificationStatus,
          otpVerified: false // Ensure OTP is not verified yet
        }
      };
      updateUser(updatedUser);
      
      // Show success message with email info
      alert(`Consent submitted successfully! An OTP has been sent to your email (${response.data.email}). Please check your inbox and verify to complete the process.`);
      
      // Navigate to OTP verification
      navigate('/otp-verification');
    } catch (error) {
      console.error('Error submitting consent:', error);
      console.error('Error details:', error.response?.data);
      alert(error.response?.data?.message || 'Failed to record consent');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignatureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Signature file must be less than 2MB');
        return;
      }
      
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        alert('Please upload a valid signature file (JPG, PNG, or PDF)');
        return;
      }
      
      setSignatureFile(file);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading placement policy...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-blue-600 px-6 py-4 flex items-center gap-4">
            <img
              src="/gct_logo.png"
              alt="GCT Logo"
              className="w-16 h-16 object-contain bg-white rounded-lg p-1"
            />
            <div>
              <h1 className="text-2xl font-bold text-white">Placement Policy Consent</h1>
              <p className="text-blue-100 mt-1">Please read and agree to the placement policy to continue</p>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">{policy?.title}</h2>
              <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto border">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                  {policy?.content}
                </pre>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="agreement"
                  checked={hasAgreed}
                  onChange={(e) => setHasAgreed(e.target.checked)}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="agreement" className="ml-3 text-sm text-gray-700">
                  <span className="font-medium">I agree</span> to the placement policy and conditions stated above.
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Digital Signature *
                </label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={handleSignatureChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {signatureFile && (
                  <p className="text-sm text-green-600 mt-2">
                    ✓ Signature uploaded: {signatureFile.name}
                  </p>
                )}
              </div>

              <div className="flex justify-end space-x-4">
                <button
                  type="submit"
                  disabled={!hasAgreed || !signatureFile || submitting}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Processing...' : 'Submit Consent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlacementConsent;
