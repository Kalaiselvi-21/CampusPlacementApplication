import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocketConnection, useSocketEvent } from '../hooks/useSocket';
import NotificationToast from './NotificationToast';

const API_BASE = process.env.REACT_APP_API_BASE;

export default function PlacementPreparation() {
  const { user } = useAuth();
  const [tab, setTab] = useState('available');
  const [available, setAvailable] = useState([]);
  const [past, setPast] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [prForm, setPrForm] = useState({ 
    title: '', 
    department: '', 
    durationMins: 45,
    description: '',
    startAt: '',
    endAt: ''
  });
  const [myTests, setMyTests] = useState([]);
  const [editingTest, setEditingTest] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [resourceForm, setResourceForm] = useState({
    title: '',
    type: 'link',
    urlOrPath: '',
    department: 'ALL',
    description: ''
  });
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [notifications, setNotifications] = useState([]);
  const [activeNotifications, setActiveNotifications] = useState([]);
  const isPR = user?.role === 'placement_representative';
  const draftCount = myTests.filter((t) => t.status === 'draft').length;

  // Ensure socket connection is initialized with role
  useSocketConnection(user?.role);

  // Populate form when editingTest changes
  useEffect(() => {
    if (editingTest) {
      setPrForm({
        title: editingTest.title || '',
        department: editingTest.department || '',
        durationMins: editingTest.durationMins || 45,
        description: editingTest.description || '',
        startAt: editingTest.startAt ? new Date(editingTest.startAt).toISOString().slice(0, 16) : '',
        endAt: editingTest.endAt ? new Date(editingTest.endAt).toISOString().slice(0, 16) : ''
      });
    }
  }, [editingTest]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingTest) return;
    // Use editingTest.id as per the mapped data in fetchMine
    await editTest(editingTest.id, prForm);
  };

  const headers = useMemo(() => {
    const t = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${t}`,
      'Content-Type': 'application/json'
    };
  }, [user]);

  const fetchAvailable = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/prep/tests/available`, { headers });
      const data = await res.json();
      setAvailable(data.tests || []);
    } finally {
      setLoading(false);
    }
  };

  const fetchPast = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/prep/tests/past`, { headers });
      const data = await res.json();
      setPast(data.tests || []);
    } catch (e) {}
  };

  const fetchResources = async () => {
    try {
      const dept = user?.profile?.department || 'ALL';
      const res = await fetch(`${API_BASE}/api/prep/resources?department=${encodeURIComponent(dept)}`, { headers });
      const data = await res.json();
      setResources(data.resources || []);
    } catch (e) {}
  };

  useEffect(() => {
    fetchAvailable();
    fetchPast();
    fetchResources();
    if (isPR) fetchMine();
  }, []);

  // Socket event listeners via hooks
  useSocketEvent('test:published', (data) => {
    const notification = {
      id: Date.now().toString(),
      type: 'test:published',
      title: 'New Test Published',
      message: `${data.title} is now available for ${data.department} department`,
      data: data,
      timestamp: new Date().toISOString()
    };
    setActiveNotifications(prev => [...prev, notification]);
    fetchAvailable();
  });

  useSocketEvent('test:updated', (data) => {
    const notification = {
      id: Date.now().toString(),
      type: 'test:updated',
      title: 'Test Updated',
      message: `${data.title} has been updated`,
      data: data,
      timestamp: new Date().toISOString()
    };
    setActiveNotifications(prev => [...prev, notification]);
    fetchAvailable();
    if (isPR) fetchMine();
  });

  useSocketEvent('test:deleted', (data) => {
    const notification = {
      id: Date.now().toString(),
      type: 'test:deleted',
      title: 'Test Deleted',
      message: `${data.title} has been removed`,
      data: data,
      timestamp: new Date().toISOString()
    };
    setActiveNotifications(prev => [...prev, notification]);
    fetchAvailable();
    if (isPR) fetchMine();
  });

  useSocketEvent('test:completed', (data) => {
    const notification = {
      id: Date.now().toString(),
      type: 'test:completed',
      title: 'Test Completed',
      message: `A student has completed ${data.testTitle || 'a test'}`,
      data: data,
      timestamp: new Date().toISOString()
    };
    setActiveNotifications(prev => [...prev, notification]);
    fetchPast();
  });

  useSocketEvent('resource:added', (data) => {
    const notification = {
      id: Date.now().toString(),
      type: 'resource:added',
      title: 'New Resource Added',
      message: `${data.title} has been added to resources`,
      data: data,
      timestamp: new Date().toISOString()
    };
    setActiveNotifications(prev => [...prev, notification]);
    fetchResources();
  });

  const fetchMine = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/prep/tests/mine`, { headers });
      const data = await res.json();
      setMyTests(data.tests || []);
    } catch (e) {}
  };

  const createTest = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/api/prep/tests`, {
      method: 'POST',
      headers,
      body: JSON.stringify(prForm)
    });
    const data = await res.json();
    if (data?._id || data?.title) {
      await fetchMine();
      setShowCreateModal(false);
      setPrForm({
        title: '',
        department: '',
        durationMins: 45,
        description: '',
        startAt: '',
        endAt: ''
      });
      setTab('available');
    }
  };

  const publishTest = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/prep/tests/${id}/publish`, { 
        method: 'POST', 
        headers 
      });
      const data = await res.json();
      if (res.ok) {
        alert('Test published successfully!');
        await fetchAvailable();
        await fetchMine();
        setTab('available');
      } else {
        alert(`Failed to publish: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Publish error:', error);
      alert('Failed to publish test. Please try again.');
    }
  };

  const deleteTest = async (id) => {
    if (!confirm('Are you sure you want to delete this test?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/prep/tests/${id}`, { 
        method: 'DELETE', 
        headers 
      });
      if (res.ok) {
        alert('Test deleted successfully!');
        await fetchMine();
      } else {
        const data = await res.json();
        alert(`Failed to delete: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete test. Please try again.');
    }
  };

  const deleteAllDrafts = async () => {
    if (draftCount === 0) {
      alert('No draft tests to delete.');
      return;
    }
    const message = `This will permanently delete ${draftCount} draft test${draftCount !== 1 ? 's' : ''}. Continue?`;
    if (!confirm(message)) return;
    try {
      const res = await fetch(`${API_BASE}/api/prep/tests/drafts`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Deleted ${data.deleted || 0} draft test${data.deleted === 1 ? '' : 's'}.`);
        await fetchMine();
      } else {
        alert(`Failed to delete drafts: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Delete drafts error:', error);
      alert('Failed to delete draft tests. Please try again.');
    }
  };

  const editTest = async (id, updates) => {
    try {
      const res = await fetch(`${API_BASE}/api/prep/tests/${id}`, { 
        method: 'PATCH', 
        headers,
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        alert('Test updated successfully!');
        await fetchMine();
        setShowEditModal(false);
        setEditingTest(null);
        setPrForm({
          title: '',
          department: '',
          durationMins: 45,
          description: '',
          startAt: '',
          endAt: ''
        });
      } else {
        const data = await res.json();
        alert(`Failed to update: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Edit error:', error);
      alert('Failed to update test. Please try again.');
    }
  };

  const addResource = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/prep/resources`, {
        method: 'POST',
        headers,
        body: JSON.stringify(resourceForm)
      });
      if (res.ok) {
        alert('Resource added successfully!');
        setResourceForm({
          title: '',
          type: 'link',
          urlOrPath: '',
          department: 'ALL',
          description: ''
        });
        setShowResourceModal(false);
        await fetchResources();
      } else {
        const data = await res.json();
        alert(`Failed to add resource: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Add resource error:', error);
      alert('Failed to add resource. Please try again.');
    }
  };

  const startTest = async (id) => {
    const res = await fetch(`${API_BASE}/api/prep/tests/${id}/start`, {
      method: 'POST',
      headers,
    });
    const data = await res.json();
    if (data?.quizUrl) {
      window.open(data.quizUrl, '_blank', 'noopener');
    }
  };

  // Helper functions
  const getStatusColor = (status) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      case 'closed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isTestActive = (test) => {
    const now = new Date();
    if (test.startAt && now < new Date(test.startAt)) return false;
    if (test.endAt && now > new Date(test.endAt)) return false;
    return true;
  };

  const getTimeStatus = (test) => {
    const now = new Date();
    if (test.startAt && now < new Date(test.startAt)) {
      return { status: 'upcoming', text: `Starts ${new Date(test.startAt).toLocaleDateString()}` };
    }
    if (test.endAt && now > new Date(test.endAt)) {
      return { status: 'ended', text: `Ended ${new Date(test.endAt).toLocaleDateString()}` };
    }
    return { status: 'active', text: 'Active now' };
  };

  const filteredResources = resources.filter(r => {
    const deptMatch = selectedDept === 'ALL' || r.department === selectedDept;
    const typeMatch = selectedType === 'ALL' || r.type === selectedType;
    return deptMatch && typeMatch;
  });

  const removeNotification = (id) => {
    setActiveNotifications(prev => prev.filter(n => n.id !== id));
  };

  const TabButton = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-md text-sm font-medium ${tab === id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Notification Toasts */}
      {activeNotifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
      <div className="mb-6">
        <div className="relative w-full h-40 rounded-xl overflow-hidden bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-between px-6">
          <div className="text-white">
            <h2 className="text-2xl font-semibold">Placement Preparation</h2>
            <p className="opacity-90">Practice tests, past results, and curated resources.</p>
          </div>
          <button
            onClick={() => setTab('available')}
            className="bg-white text-indigo-700 px-4 py-2 rounded-md shadow"
          >
            Go to Available Tests
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <TabButton id="available" label="Available Tests" />
        <TabButton id="past" label="Past Tests" />
        <TabButton id="resources" label="Resources" />
        {isPR && <TabButton id="manage" label="Manage (PR)" />}
      </div>

      {tab === 'available' && (
        <div>
          <div className="mb-4 flex justify-between items-center">
            <h3 className="text-lg font-semibold">Available Tests</h3>
            <div className="text-sm text-gray-600">
              {available.length} test{available.length !== 1 ? 's' : ''} available
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading && <div className="col-span-full text-center text-gray-500 py-8">Loading...</div>}
            {available.map((t) => {
              const timeStatus = getTimeStatus(t);
              const isActive = isTestActive(t);
              const canStart = isActive && (t.assignmentStatus === 'new' || !t.assignmentStatus);
              return (
                <div key={t.id} className="border rounded-lg p-4 shadow-sm bg-white hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 flex-1">{t.title}</h3>
                    <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 ml-2">{t.department}</span>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <span className="w-4 h-4 mr-2">📝</span>
                      {t.totalQuestions || 'Unknown'} questions
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <span className="w-4 h-4 mr-2">⏱️</span>
                      {t.durationMins} minutes
                    </div>
                    <div className="flex items-center text-sm">
                      <span className="w-4 h-4 mr-2">📅</span>
                      <span className={timeStatus.status === 'active' ? 'text-green-600' : 
                                     timeStatus.status === 'upcoming' ? 'text-yellow-600' : 'text-red-600'}>
                        {timeStatus.text}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex justify-end">
                    <button 
                      onClick={() => startTest(t.id)} 
                      disabled={!canStart}
                      className={`px-4 py-2 rounded-md font-medium transition-colors ${
                        canStart 
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {canStart ? 'Start Test' : (isActive ? 'Already Started' : 'Not Available')}
                    </button>
                  </div>
                </div>
              );
            })}
            {!loading && available.length === 0 && (
              <div className="col-span-full text-center text-gray-500 py-8">
                <div className="text-4xl mb-2">📚</div>
                <p>No tests available yet.</p>
                <p className="text-sm">Check back later or contact your PR for updates.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'past' && (
        <div>
          <div className="mb-4 flex justify-between items-center">
            <h3 className="text-lg font-semibold">Past Tests</h3>
            <div className="text-sm text-gray-600">
              {past.length} completed test{past.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="space-y-4">
            {past.map((t) => (
              <div key={t.id} className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="font-semibold text-gray-900">{t.title}</h4>
                      <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">{t.department}</span>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <span>⏱️ {t.durationMins} mins</span>
                      <span>📅 Completed recently</span>
                      <span>📊 Score: {t.score || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded text-sm hover:bg-indigo-200 transition-colors">
                      View Review
                    </button>
                    <button className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 transition-colors">
                      Download Report
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {past.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                <div className="text-4xl mb-2">📋</div>
                <p>No past tests yet.</p>
                <p className="text-sm">Complete some tests to see your history here.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'resources' && (
        <div>
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
            <h3 className="text-lg font-semibold">Resources</h3>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
              <div className="flex space-x-2">
                <select 
                  value={selectedDept} 
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="px-3 py-1 border rounded text-sm"
                >
                  <option value="ALL">All Departments</option>
                  {['CSE','IT','ECE','MECH','PROD','IBT','EEE','CIVIL','EIE'].map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <select 
                  value={selectedType} 
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="px-3 py-1 border rounded text-sm"
                >
                  <option value="ALL">All Types</option>
                  <option value="pdf">PDF</option>
                  <option value="link">Link</option>
                  <option value="video">Video</option>
                  <option value="sample_test">Sample Test</option>
                </select>
              </div>
              {isPR && (
                <button 
                  onClick={() => setShowResourceModal(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 transition-colors"
                >
                  Add Resource
                </button>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredResources.map((r) => (
              <div key={r._id} className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-medium text-gray-900 flex-1">{r.title}</h4>
                  <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 ml-2">{r.type}</span>
                </div>
                <div className="text-xs text-gray-500 mb-3">{r.department}</div>
                {r.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{r.description}</p>
                )}
                <div className="flex justify-end">
                  <a 
                    href={r.urlOrPath} 
                    target="_blank" 
                    rel="noreferrer"
                    className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded text-sm hover:bg-indigo-200 transition-colors"
                  >
                    Open
                  </a>
                </div>
              </div>
            ))}
            {filteredResources.length === 0 && (
              <div className="col-span-full text-center text-gray-500 py-8">
                <div className="text-4xl mb-2">📚</div>
                <p>No resources found.</p>
                <p className="text-sm">Try adjusting your filters or check back later.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'manage' && isPR && (
        <div>
          <div className="mb-6 flex justify-between items-center">
            <h3 className="text-lg font-semibold">Test Management</h3>
            <div className="flex items-center space-x-2">
              <button 
                onClick={deleteAllDrafts}
                className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              >
                Delete All Drafts
              </button>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
              >
                Create New Test
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="border rounded-lg p-4 bg-white">
                <h4 className="font-semibold mb-4">My Tests ({myTests.length})</h4>
                <div className="space-y-4">
                  {myTests.map((t) => (
                    <div key={t.id} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h5 className="font-medium text-gray-900">{t.title}</h5>
                          <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                            <span>📚 {t.department}</span>
                            <span>⏱️ {t.durationMins} mins</span>
                            <span>📝 {t.totalQuestions || 'Unknown'} questions</span>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${getStatusColor(t.status)}`}>
                          {t.status}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500">
                          Created: {new Date(t.createdAt || Date.now()).toLocaleDateString()}
                        </div>
                        <div className="flex items-center space-x-2">
                          {t.status === 'draft' && (
                            <>
                              <button 
                                onClick={() => {
                                  setEditingTest(t);
                                  setShowEditModal(true);
                                }}
                                className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-colors"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => publishTest(t.id)} 
                                className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 transition-colors"
                              >
                                Publish
                              </button>
                            </>
                          )}
                          {t.status === 'published' && (
                            <button 
                              onClick={() => publishTest(t.id)} 
                              className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs hover:bg-yellow-200 transition-colors"
                            >
                              Resend
                            </button>
                          )}
                          <button 
                            onClick={() => deleteTest(t.id)} 
                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {myTests.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      <div className="text-4xl mb-2">📝</div>
                      <p>No tests created yet.</p>
                      <p className="text-sm">Create your first test to get started.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="border rounded-lg p-4 bg-white">
              <h4 className="font-semibold mb-4">Quick Stats</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Tests:</span>
                  <span className="font-medium">{myTests.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Published:</span>
                  <span className="font-medium text-green-600">
                    {myTests.filter(t => t.status === 'published').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Drafts:</span>
                  <span className="font-medium text-yellow-600">
                    {myTests.filter(t => t.status === 'draft').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Closed:</span>
                  <span className="font-medium text-red-600">
                    {myTests.filter(t => t.status === 'closed').length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Test Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-lg font-semibold">Create New Test</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={createTest} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title (must match Google Sheet tab)
                  </label>
                  <input 
                    value={prForm.title} 
                    onChange={(e) => setPrForm({ ...prForm, title: e.target.value })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    required 
                    placeholder="e.g., DSA_Quiz_1"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea 
                    value={prForm.description} 
                    onChange={(e) => setPrForm({ ...prForm, description: e.target.value })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    rows="3"
                    placeholder="Optional description for the test"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select 
                    value={prForm.department} 
                    onChange={(e) => setPrForm({ ...prForm, department: e.target.value })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    required
                  >
                    <option value="">Select Department</option>
                    {['CSE','IT','ECE','MECH','PROD','IBT','EEE','CIVIL','EIE','ALL'].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                  <input 
                    type="number" 
                    min="1" 
                    value={prForm.durationMins} 
                    onChange={(e) => setPrForm({ ...prForm, durationMins: Number(e.target.value) })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    required 
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date (Optional)</label>
                    <input 
                      type="datetime-local" 
                      value={prForm.startAt} 
                      onChange={(e) => setPrForm({ ...prForm, startAt: e.target.value })} 
                      className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date (Optional)</label>
                    <input 
                      type="datetime-local" 
                      value={prForm.endAt} 
                      onChange={(e) => setPrForm({ ...prForm, endAt: e.target.value })} 
                      className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    />
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                  >
                    Create Test
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Test Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-lg font-semibold">Edit Test</h3>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingTest(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={handleUpdate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title (must match Google Sheet tab)
                  </label>
                  <input 
                    value={prForm.title} 
                    onChange={(e) => setPrForm({ ...prForm, title: e.target.value })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    required 
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea 
                    value={prForm.description} 
                    onChange={(e) => setPrForm({ ...prForm, description: e.target.value })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    rows="3"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select 
                    value={prForm.department} 
                    onChange={(e) => setPrForm({ ...prForm, department: e.target.value })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    required
                  >
                    <option value="">Select Department</option>
                    {['CSE','IT','ECE','MECH','PROD','IBT','EEE','CIVIL','EIE','ALL'].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                  <input 
                    type="number" 
                    min="1" 
                    value={prForm.durationMins} 
                    onChange={(e) => setPrForm({ ...prForm, durationMins: Number(e.target.value) })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    required 
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date (Optional)</label>
                    <input 
                      type="datetime-local" 
                      value={prForm.startAt} 
                      onChange={(e) => setPrForm({ ...prForm, startAt: e.target.value })} 
                      className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date (Optional)</label>
                    <input 
                      type="datetime-local" 
                      value={prForm.endAt} 
                      onChange={(e) => setPrForm({ ...prForm, endAt: e.target.value })} 
                      className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    />
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingTest(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Update Test
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add Resource Modal */}
      {showResourceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-lg font-semibold">Add Resource</h3>
                <button
                  onClick={() => setShowResourceModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={addResource} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input 
                    value={resourceForm.title} 
                    onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    required 
                    placeholder="Resource title"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select 
                    value={resourceForm.type} 
                    onChange={(e) => setResourceForm({ ...resourceForm, type: e.target.value })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    required
                  >
                    <option value="link">Link</option>
                    <option value="pdf">PDF</option>
                    <option value="video">Video</option>
                    <option value="sample_test">Sample Test</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL or Path</label>
                  <input 
                    value={resourceForm.urlOrPath} 
                    onChange={(e) => setResourceForm({ ...resourceForm, urlOrPath: e.target.value })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    required 
                    placeholder="https://example.com or file path"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select 
                    value={resourceForm.department} 
                    onChange={(e) => setResourceForm({ ...resourceForm, department: e.target.value })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    required
                  >
                    <option value="ALL">All Departments</option>
                    {['CSE','IT','ECE','MECH','PROD','IBT','EEE','CIVIL','EIE'].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                  <textarea 
                    value={resourceForm.description} 
                    onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })} 
                    className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                    rows="3"
                    placeholder="Brief description of the resource"
                  />
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowResourceModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                  >
                    Add Resource
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}