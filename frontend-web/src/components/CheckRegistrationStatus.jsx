import { API_BASE } from '../config/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';


const CheckRegistrationStatus = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showResubmit, setShowResubmit] = useState(false);
  const [resubmitData, setResubmitData] = useState({
    department: 'CSE',
    notes: ''
  });
  const [resubmitting, setResubmitting] = useState(false);

  const departments = ['CSE', 'IT', 'ECE', 'MECH', 'CIVIL', 'EEE', 'EIE', 'PRODUCTION', 'IBT'];

  const handleCheckStatus = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const response = await axios.get(`${API_BASE}/api/auth/allowlist/status`, {
        params: { email: email.toLowerCase() }
      });

      setStatus(response.data);
      if (response.data.status === 'rejected') {
        setShowResubmit(true);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to check status';
      toast.error(errorMessage);
      if (error.response?.status === 404) {
        setStatus({ status: 'not_found' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResubmit = async (e) => {
    e.preventDefault();
    setResubmitting(true);

    try {
      const payload = {
        email: email.toLowerCase(),
        role: status.role,
        notes: resubmitData.notes
      };

      if (status.role === 'placement_representative') {
        payload.department = resubmitData.department;
      }

      const response = await axios.post(`${API_BASE}/api/auth/allowlist/resubmit`, payload);
      toast.success(response.data.message);
      const updated = response.data?.data || {};
      setStatus({
        ...status,
        status: updated.status || 'pending',
        role: updated.role || status.role,
        department: updated.department || status.department,
        rejectionReason: null
      });
      setShowResubmit(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to resubmit');
    } finally {
      setResubmitting(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved':
        return '✅';
      case 'rejected':
        return '❌';
      case 'pending':
        return '⏳';
      default:
        return '❓';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 py-12">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="flex justify-center mb-4">
          <img
            src="/gct_logo.png"
            alt="GCT Logo"
            className="w-16 h-16 object-contain"
          />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2 text-center">Check Status</h2>
        <p className="text-gray-600 mb-6 text-center">Track your PR/PO registration request</p>

        {!status ? (
          <form onSubmit={handleCheckStatus} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Institutional Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="example@gct.ac.in"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg transition font-medium"
            >
              {loading ? 'Checking...' : 'Check Status'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition"
            >
              Go Back
            </button>
          </form>
        ) : status.status === 'not_found' ? (
          <div className="text-center">
            <div className="text-4xl mb-4">❓</div>
            <p className="text-gray-600 mb-6">No registration request found for this email.</p>
            <button
              onClick={() => {
                setStatus(null);
                setEmail('');
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg transition mb-3"
            >
              Try Another Email
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition"
            >
              Go Back
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`border-2 rounded-lg p-4 ${getStatusColor(status.status)}`}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{getStatusIcon(status.status)}</span>
                <p className="text-lg font-bold capitalize">{status.status}</p>
              </div>
              <p className="text-sm">
                <strong>Role:</strong> {status.role === 'placement_representative' ? 'Placement Representative (PR)' : 'Placement Officer (PO)'}
              </p>
              {status.department && (
                <p className="text-sm">
                  <strong>Department:</strong> {status.department}
                </p>
              )}
            </div>

            {status.rejectionReason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-bold text-red-800 mb-2">Rejection Reason:</p>
                <p className="text-sm text-red-700">{status.rejectionReason}</p>
              </div>
            )}

            {status.status === 'rejected' && showResubmit && (
              <form onSubmit={handleResubmit} className="space-y-3 bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm font-bold text-blue-900">Resubmit Your Request</p>

                {status.role === 'placement_representative' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Department
                    </label>
                    <select
                      value={resubmitData.department}
                      onChange={(e) => setResubmitData({ ...resubmitData, department: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      {departments.map((dept) => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Notes (optional)
                  </label>
                  <textarea
                    value={resubmitData.notes}
                    onChange={(e) => setResubmitData({ ...resubmitData, notes: e.target.value })}
                    placeholder="Add any additional information..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    rows="2"
                  />
                </div>

                <button
                  type="submit"
                  disabled={resubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition text-sm font-medium"
                >
                  {resubmitting ? 'Resubmitting...' : 'Resubmit Request'}
                </button>
              </form>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStatus(null);
                  setEmail('');
                  setShowResubmit(false);
                }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition"
              >
                Check Another
              </button>
              <button
                onClick={() => navigate('/')}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition"
              >
                Go Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckRegistrationStatus;
