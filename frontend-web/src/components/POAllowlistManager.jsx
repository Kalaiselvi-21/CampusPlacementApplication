import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

const API_BASE = process.env.REACT_APP_API_BASE;

const normalizeAllowlistEntry = (entry = {}) => {
  const resolvedId = entry._id || entry.id;
  return {
    ...entry,
    _id: resolvedId,
    id: resolvedId,
    createdAt: entry.createdAt || entry.created_at || entry.requested_at || null
  };
};

const PRAllowlistManager = () => {
  const [allowlistData, setAllowlistData] = useState({
    entries: [],
    stats: { pending: 0, approved: 0, rejected: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState(null);
  
  // Direct add form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormData, setAddFormData] = useState({
    email: '',
    role: 'placement_representative',
    department: 'CSE'
  });
  const [addingEmail, setAddingEmail] = useState(false);

  useEffect(() => {
    fetchAllowlist();
  }, []);

  const fetchAllowlist = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/api/auth/allowlist`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const entries = Array.isArray(response.data?.entries)
        ? response.data.entries
        : Array.isArray(response.data)
        ? response.data
        : [];
      const normalizedEntries = entries.map(normalizeAllowlistEntry);
      const stats = response.data?.stats || { pending: 0, approved: 0, rejected: 0 };
      setAllowlistData({ entries: normalizedEntries, stats });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to fetch requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId) => {
    if (!requestId) {
      toast.error('Invalid request ID');
      return;
    }

    if (!window.confirm('Approve this registration request?')) return;

    try {
      setProcessingId(requestId);
      await axios.post(
        `${API_BASE}/api/auth/allowlist/approve/${requestId}`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      toast.success('Request approved');
      fetchAllowlist();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Approval failed');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectSubmit = async (requestId) => {
    if (!requestId) {
      toast.error('Invalid request ID');
      return;
    }

    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      setProcessingId(requestId);
      await axios.post(
        `${API_BASE}/api/auth/allowlist/reject/${requestId}`,
        { reason: rejectReason },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      toast.success('Request rejected');
      setRejectingId(null);
      setRejectReason('');
      fetchAllowlist();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Rejection failed');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (requestId) => {
    if (!requestId) {
      toast.error('Invalid request ID');
      return;
    }

    if (!window.confirm('Are you sure you want to remove this email from the allowlist? This will allow the email to be registered again.')) return;

    try {
      setProcessingId(requestId);
      await axios.delete(
        `${API_BASE}/api/auth/allowlist/${requestId}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      toast.success('Entry removed from allowlist');
      fetchAllowlist();
    } catch (error) {
      if (error.response && error.response.status === 404) {
        toast.success('Entry already removed');
        fetchAllowlist();
      } else {
        toast.error(error.response?.data?.message || 'Removal failed');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleDirectAdd = async (e) => {
    e.preventDefault();
    
    if (!addFormData.email || !addFormData.email.match(/@gct\.ac\.in$/)) {
      toast.error('Please enter a valid @gct.ac.in email');
      return;
    }

    try {
      setAddingEmail(true);
      
      // Check if entry already exists in the loaded list to avoid 400 error
      const existingEntry = allowlistData.entries.find(
        e => e.email.toLowerCase() === addFormData.email.toLowerCase().trim()
      );

      let targetId;

      if (existingEntry) {
        targetId = existingEntry.id || existingEntry._id;
      } else {
        // First create the allowlist entry if it doesn't exist
        const response = await axios.post(
          `${API_BASE}/api/auth/allowlist/request`,
          {
            email: addFormData.email,
            role: addFormData.role,
            department: addFormData.role === 'placement_officer' ? '' : addFormData.department,
            notes: 'Directly added by PO'
          },
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
        );
        targetId = response.data.requestId;
      }

      // Then immediately approve it
      if (targetId) {
        await axios.post(
          `${API_BASE}/api/auth/allowlist/approve/${targetId}`,
          {},
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
        );
      }

      toast.success(`${addFormData.email} added and approved successfully!`);
      setAddFormData({ email: '', role: 'placement_representative', department: 'CSE' });
      setShowAddForm(false);
      fetchAllowlist();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add email');
    } finally {
      setAddingEmail(false);
    }
  };

  const getFilteredEntries = () => {
    if (filter === 'all') return allowlistData.entries;
    return allowlistData.entries.filter(entry => entry.status === filter);
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleDisplay = (role) => {
    return role === 'placement_representative' ? 'PR' : 'PO';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading requests...</p>
        </div>
      </div>
    );
  }

  const filteredEntries = getFilteredEntries();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <img
            src="/gct_logo.png"
            alt="GCT Logo"
            className="w-16 h-16 object-contain"
          />
          <div>
            <h1 className="text-4xl font-bold text-gray-800 mb-2">PR/PO Registration Requests</h1>
            <p className="text-gray-600">Manage and approve placement staff registration requests</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Total</div>
            <div className="text-3xl font-bold text-gray-800">
              {allowlistData.entries.length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-yellow-600 mb-1">Pending</div>
            <div className="text-3xl font-bold text-yellow-600">
              {allowlistData.stats.pending}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-green-600 mb-1">Approved</div>
            <div className="text-3xl font-bold text-green-600">
              {allowlistData.stats.approved}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-red-600 mb-1">Rejected</div>
            <div className="text-3xl font-bold text-red-600">
              {allowlistData.stats.rejected}
            </div>
          </div>
        </div>

        {/* Direct Add Email Section */}
        <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 transition"
          >
            <div className="flex items-center">
              <svg className="w-6 h-6 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <div className="text-left">
                <h3 className="text-lg font-bold text-gray-800">Add PR/PO Email Directly</h3>
                <p className="text-sm text-gray-600">Bypass request process and approve emails instantly</p>
              </div>
            </div>
            <svg 
              className={`w-5 h-5 text-gray-600 transition-transform ${showAddForm ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAddForm && (
            <form onSubmit={handleDirectAdd} className="p-6 bg-gray-50 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Email Input */}
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={addFormData.email}
                    onChange={(e) => setAddFormData({...addFormData, email: e.target.value})}
                    placeholder="name@gct.ac.in"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Role Select */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role *
                  </label>
                  <select
                    value={addFormData.role}
                    onChange={(e) => setAddFormData({...addFormData, role: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="placement_representative">Placement Representative (PR)</option>
                    <option value="placement_officer">Placement Officer (PO)</option>
                  </select>
                </div>

                {/* Department Select */}
                {addFormData.role !== 'placement_officer' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Department *
                    </label>
                    <select
                      value={addFormData.department}
                      onChange={(e) => setAddFormData({...addFormData, department: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="CSE">CSE</option>
                      <option value="IT">IT</option>
                      <option value="ECE">ECE</option>
                      <option value="MECH">MECH</option>
                      <option value="CIVIL">CIVIL</option>
                      <option value="EEE">EEE</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={addingEmail}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-semibold transition flex items-center"
                >
                  {addingEmail ? (
                    <>
                      <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Adding...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add & Approve
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddFormData({ email: '', role: 'placement_representative', department: 'CSE' });
                  }}
                  className="text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg font-semibold transition"
                >
                  Cancel
                </button>
                <p className="text-xs text-gray-500 ml-auto">
                  Email will be instantly approved for registration
                </p>
              </div>
            </form>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
          <div className="flex gap-0">
            {['all', 'pending', 'approved', 'rejected'].map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`flex-1 py-3 px-4 font-semibold transition border-b-2 ${
                  filter === status
                    ? 'bg-indigo-50 border-indigo-600 text-indigo-600'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Requests List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {filteredEntries.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500 text-lg">No {filter === 'all' ? 'requests' : `${filter} requests`} found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Dept</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Notes</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry, index) => (
                    <React.Fragment key={entry._id || entry.id || `${entry.email}-${entry.status}-${index}`}>
                      <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 text-sm text-gray-800 font-medium">{entry.email}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs font-semibold">
                            {getRoleDisplay(entry.role)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{entry.department}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(entry.status)}`}>
                            {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                          {entry.notes || '-'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {entry.status === 'pending' && (
                            <div className="flex gap-2 justify-center">
                              <button
                                onClick={() => handleApprove(entry._id)}
                                disabled={processingId === entry._id}
                                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-3 py-1 rounded text-xs font-semibold transition"
                              >
                                {processingId === entry._id ? '...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => setRejectingId(entry._id)}
                                disabled={processingId === entry._id}
                                className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-3 py-1 rounded text-xs font-semibold transition"
                              >
                                {processingId === entry._id ? '...' : 'Reject'}
                              </button>
                            </div>
                          )}
                          {entry.status === 'approved' && (
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-green-600 text-xs font-semibold">✓ Approved</span>
                              <button
                                onClick={() => handleDelete(entry._id)}
                                disabled={processingId === entry._id}
                                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                title="Remove from allowlist"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                          {entry.status === 'rejected' && (
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-red-600 text-xs font-semibold">✗ Rejected</span>
                              <button
                                onClick={() => handleDelete(entry._id)}
                                disabled={processingId === entry._id}
                                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                title="Remove from allowlist"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Reject Reason Dialog */}
                      {rejectingId === entry._id && (
                        <tr className="bg-yellow-50 border-t border-yellow-200">
                          <td colSpan="7" className="px-6 py-4">
                            <div className="space-y-3">
                              <p className="font-semibold text-gray-800">Rejection Reason:</p>
                              <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Please provide a reason for rejection..."
                                className="w-full px-4 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none resize-none"
                                rows="3"
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => {
                                    setRejectingId(null);
                                    setRejectReason('');
                                  }}
                                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 transition"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleRejectSubmit(entry._id)}
                                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition"
                                >
                                  Confirm Rejection
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PRAllowlistManager;