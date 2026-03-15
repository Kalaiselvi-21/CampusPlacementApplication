import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
  const API_BASE = process.env.REACT_APP_API_BASE;

const StudentDetails = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [studentsDetails, setStudentsDetails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [placementFilter, setPlacementFilter] = useState('all');
  const [availableDepartments, setAvailableDepartments] = useState([]);
  const [deletingStudentId, setDeletingStudentId] = useState(null);

  const getUniqueDepartments = (students) => {
    const departments = students
      .map(student => student.department)
      .filter(dept => dept && dept.trim() !== '')
      .filter((dept, index, arr) => arr.indexOf(dept) === index)
      .sort();
    return departments;
  };

  const getFilteredStudents = () => {
    return studentsDetails.filter(student => {
      // Department filter
      const departmentMatch = departmentFilter === 'all' || student.department === departmentFilter;
      
      // Placement filter - match the logic used in the table display
      let placementMatch = true;
      if (placementFilter === 'placed') {
        placementMatch = student.placementStatus === 'placed' || student.isPlaced;
      } else if (placementFilter === 'unplaced') {
        placementMatch = !(student.placementStatus === 'placed' || student.isPlaced);
      }
      
      return departmentMatch && placementMatch;
    });
  };

  useEffect(() => {
    if (!user || (user.role !== 'po' && user.role !== 'placement_officer')) {
      navigate('/login');
      return;
    }
    fetchStudentsDetails();
  }, [user, navigate]);

  const fetchStudentsDetails = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      console.log('Fetching students details...');
      
      const response = await axios.get(`${API_BASE}/api/users/students-details`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      console.log('Students response:', response.data);
      const students = response.data.students || [];
      setStudentsDetails(students);
      setAvailableDepartments(getUniqueDepartments(students));
      
      if (students?.length > 0) {
        console.log('Sample student data:', students[0]);
      }
    } catch (error) {
      console.error('Error fetching students details:', error);
      toast.error('Failed to fetch students details');
    } finally {
      setLoading(false);
    }
  };

  const downloadStudentsCSV = () => {
    const filteredStudents = getFilteredStudents();
    
    if (!filteredStudents?.length) {
      toast.error('No student data to download');
      return;
    }

    const headers = [
      'S.No', 'Name', 'Roll Number', 'Department', 'Degree', 'Graduation Year', 'CGPA',
      'Gender', 'Date of Birth', 'Personal Email', 'College Email', 'Phone Number',
      'Address', '10th Percentage', '12th Percentage', 'Diploma Percentage',
      'LinkedIn URL', 'GitHub URL', 'Current Backlogs', 'Backlog History',
      'About Me', 'Skills', 'Placement Status', 'Consent Status', 'Profile Complete',
      'Registered Date', 'Last Updated'
    ];

    const csvContent = [
      headers.join(','),
      ...filteredStudents.map((student, index) => [
        index + 1,
        `"${student.name}"`,
        `"${student.rollNumber}"`,
        `"${student.department}"`,
        `"${student.degree}"`,
        `"${student.graduationYear}"`,
        `"${student.cgpa}"`,
        `"${student.gender}"`,
        `"${student.dateOfBirth !== 'N/A' ? new Date(student.dateOfBirth).toLocaleDateString() : 'N/A'}"`,
        `"${student.personalEmail}"`,
        `"${student.collegeEmail}"`,
        `"${student.phoneNumber}"`,
        `"${student.address}"`,
        `"${student.tenthPercentage}"`,
        `"${student.twelfthPercentage}"`,
        `"${student.diplomaPercentage}"`,
        `"${student.linkedinUrl}"`,
        `"${student.githubUrl}"`,
        `"${student.currentBacklogs}"`,
        `"${Array.isArray(student.historyOfBacklogs) ? student.historyOfBacklogs.map(b => `${b.subject}-${b.semester}`).join('; ') : 'None'}"`,
        `"${student.aboutMe}"`,
        `"${Array.isArray(student.skills) ? student.skills.join('; ') : student.skills}"`,
        `"${student.placementStatus}"`,
        `"${student.consentStatus?.hasAgreed ? 'Signed' : 'Not Signed'}"`,
        `"${student.profileComplete ? 'Complete' : 'Incomplete'}"`,
        `"${student.registeredAt ? new Date(student.registeredAt).toLocaleDateString() : 'N/A'}"`,
        `"${student.lastUpdated ? new Date(student.lastUpdated).toLocaleDateString() : 'N/A'}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    // Include filter info in filename
    const filterSuffix = departmentFilter !== 'all' || placementFilter !== 'all' 
      ? `_${departmentFilter !== 'all' ? departmentFilter.replace(/\s+/g, '_') : 'AllDepts'}_${placementFilter !== 'all' ? placementFilter : 'AllStatus'}`
      : '';
    
    link.setAttribute('download', `students_details${filterSuffix}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`Downloaded ${filteredStudents.length} student records`);
  };

  const handleDeleteStudent = async (student) => {
    const studentId = student?._id || student?.id;
    if (!studentId) {
      toast.error('Invalid student id');
      return;
    }

    const studentName = student?.name || 'this student';
    if (!window.confirm(`Are you sure you want to delete ${studentName}? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingStudentId(studentId);
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE}/api/users/delete/${studentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setStudentsDetails((prev) => prev.filter((s) => (s._id || s.id) !== studentId));
      toast.success('Student deleted successfully');
    } catch (error) {
      console.error('Error deleting student:', error);
      toast.error(error.response?.data?.message || 'Failed to delete student');
    } finally {
      setDeletingStudentId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <img
              src="/gct_logo.png"
              alt="GCT Logo"
              className="w-16 h-16 object-contain"
            />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Student Details</h1>
              <p className="text-gray-600 mt-1">
                Complete information of all registered students ({getFilteredStudents().length} of {studentsDetails.length} shown)
              </p>
            </div>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={downloadStudentsCSV}
              disabled={getFilteredStudents().length === 0}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Download CSV ({getFilteredStudents().length})</span>
            </button>
            <button
              onClick={() => navigate('/po-dashboard')}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        {/* Add Filters Section */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Department:</label>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Departments</option>
                {availableDepartments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Placement Status:</label>
              <select
                value={placementFilter}
                onChange={(e) => setPlacementFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Students</option>
                <option value="placed">Placed Only</option>
                <option value="unplaced">Unplaced Only</option>
              </select>
            </div>
            
            <div className="flex items-center space-x-2 ml-auto">
              <span className="text-sm text-gray-600">
                Showing {getFilteredStudents().length} of {studentsDetails.length} students
              </span>
              <button
                onClick={() => {
                  setDepartmentFilter('all');
                  setPlacementFilter('all');
                }}
                className="px-3 py-1 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded text-sm"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden">
          {getFilteredStudents().length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">
                {studentsDetails.length === 0 
                  ? 'No students found' 
                  : 'No students match the selected filters'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Roll No</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Degree</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grad Year</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CGPA</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gender</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DOB</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Personal Email</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">College Email</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">10th %</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">12th %</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Diploma %</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LinkedIn</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GitHub</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Backlogs</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Backlog History</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">About Me</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Skills</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Placement Status</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Consent Status</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Digital Signature</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OTP Verified</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profile Status</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registered</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {getFilteredStudents().map((student, index) => (
                    <tr key={student._id} className="hover:bg-gray-50">
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{student.name}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.rollNumber}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.department}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.degree}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.graduationYear}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.cgpa}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.gender}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {student.dateOfBirth !== 'N/A' ? new Date(student.dateOfBirth).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.personalEmail}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.collegeEmail}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.phoneNumber}</td>
                      <td className="px-3 py-4 text-sm text-gray-900 max-w-xs truncate" title={student.address}>
                        {student.address}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.tenthPercentage}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.twelfthPercentage}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.diplomaPercentage}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {student.linkedinUrl !== 'N/A' ? (
                          <a href={student.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            View
                          </a>
                        ) : 'N/A'}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {student.githubUrl !== 'N/A' ? (
                          <a href={student.githubUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            View
                          </a>
                        ) : 'N/A'}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{student.currentBacklogs}</td>
                      <td className="px-3 py-4 text-sm text-gray-900 max-w-xs">
                        {Array.isArray(student.historyOfBacklogs) && student.historyOfBacklogs.length > 0 
                          ? student.historyOfBacklogs.map(b => `${b.subject}-${b.semester}`).join(', ')
                          : 'None'
                        }
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-900 max-w-xs truncate" title={student.aboutMe}>
                        {student.aboutMe}
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-900 max-w-xs">
                        {Array.isArray(student.skills) ? student.skills.join(', ') : student.skills}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          student.placementStatus === 'placed' || student.isPlaced ? 'bg-green-100 text-green-800' :
                          student.placementStatus === 'unplaced' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {student.placementStatus === 'placed' || student.isPlaced ? 'Placed' : 'Unplaced'}
                        </span>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          student.consentStatus?.hasAgreed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {student.consentStatus?.hasAgreed ? 'Signed' : 'Not Signed'}
                        </span>
                        {student.consentStatus?.agreedAt && (
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(student.consentStatus.agreedAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {student.consentStatus?.signature ? (
                          <a 
                            href={`${API_BASE}/uploads/signatures/${student.consentStatus.signature}`}
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-600 hover:underline"
                          >
                            View Signature
                          </a>
                        ) : (
                          <span className="text-gray-400">No Signature</span>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          student.otpVerified ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {student.otpVerified ? 'Verified' : 'Not Verified'}
                        </span>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          student.profileComplete ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {student.profileComplete ? 'Complete' : 'Incomplete'}
                        </span>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {student.registeredAt ? new Date(student.registeredAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        <button
                          onClick={() => handleDeleteStudent(student)}
                          disabled={deletingStudentId === (student._id || student.id)}
                          className="px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                        >
                          {deletingStudentId === (student._id || student.id) ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
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

export default StudentDetails;
