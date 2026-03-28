import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";

const API_BASE = process.env.REACT_APP_API_BASE;

const DEPARTMENTS = [
  "Computer Science and Engineering",
  "Information Technology",
  "Electronics and Communication Engineering",
  "Electrical and Electronics Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Production Engineering",
  "Industrial Biotechnology",
  "Electronic and Instrumentation Engineering",
];

const JobDriveFiles = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submissionMatrix, setSubmissionMatrix] = useState([]);
  const [allFilesLoading, setAllFilesLoading] = useState(false);
  const [fileTypeFilter, setFileTypeFilter] = useState("all");
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState("all");
  const [spocDepartmentFilter, setSpocDepartmentFilter] = useState("all"); // 'all' or specific department
  const [availableSpocDepartments, setAvailableSpocDepartments] = useState([]);

  const fetchAllDriveFilesSummary = useCallback(async () => {
    setAllFilesLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_BASE}/api/drive-files/all-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data.matrix || response.data.summary || [];
      setSubmissionMatrix(data);

      // Extract unique departments for filter from the fetched data
      const departments = new Set();
      data.forEach(entry => {
        if (entry.uploader_department && entry.uploader_department !== 'N/A') {
          departments.add(entry.uploader_department);
        }
      });
      // Add all predefined departments to ensure they are available in the filter
      DEPARTMENTS.forEach(dept => departments.add(dept));
      setAvailableSpocDepartments(Array.from(departments).sort());

    } catch (error) {
      console.error("Error fetching all drive files summary:", error);
      toast.error("Failed to load all drive files");
    } finally {
      setAllFilesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAllDriveFilesSummary();
  }, [fetchAllDriveFilesSummary]);

  const getFilteredDriveFiles = () => {
    return submissionMatrix.filter(file => {
      const fileTypeMatch = fileTypeFilter === 'all' || file.file_type?.toLowerCase() === fileTypeFilter.toLowerCase();
      const submissionStatusMatch = submissionStatusFilter === 'all' || file.submission_status === submissionStatusFilter;
      
      const fileDept = String(file.uploader_department || "").trim().toLowerCase();
      const filterDept = String(spocDepartmentFilter).trim().toLowerCase();
      
      const spocDepartmentMatch = spocDepartmentFilter === 'all' || fileDept === filterDept;

      return fileTypeMatch && submissionStatusMatch && spocDepartmentMatch;
    });
  };

  const handleDownloadFile = async (fileUrl, fileName) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download file");
    }
  };

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
              <h1 className="text-3xl font-bold text-gray-900">All Job Drive Files</h1>
              <p className="text-gray-600 mt-1">View SPOC & Expenditure files for all drives</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/po-dashboard")}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          {/* Filters */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">File Type:</label>
              <select
                value={fileTypeFilter}
                onChange={(e) => setFileTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                <option value="spoc">SPOC File</option>
                <option value="expenditure">Expenditure File</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Submission Status:</label>
              <select
                value={submissionStatusFilter}
                onChange={(e) => setSubmissionStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="Submitted">Submitted</option>
                <option value="Not Submitted">Not Submitted</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">SPOC Department:</label>
              <select
                value={spocDepartmentFilter}
                onChange={(e) => setSpocDepartmentFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Departments</option>
                {availableSpocDepartments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {allFilesLoading ? (
          <div className="text-center py-8">Loading files...</div>
        ) : getFilteredDriveFiles().length === 0 ? (
          <p className="text-center text-gray-500 py-8">No files match the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Drive</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dept</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Drive Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {getFilteredDriveFiles().map((file, index) => (
                  <tr key={`${file.drive_id}-${file.uploader_department}-${file.file_type}-${index}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {file.company_name} <br/> 
                      <span className="text-xs text-gray-500 font-normal">{file.role}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {file.uploader_department || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 uppercase">
                      {file.file_type}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${file.file_name !== '-' ? 'text-gray-500' : 'text-gray-400 font-bold'}`}>
                      {file.file_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${file.is_drive_complete ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                        {file.is_drive_complete ? 'Complete' : 'Incomplete'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {file.file_url ? (
                        <>
                          <a href={file.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-900 mr-2">View</a>
                          <button onClick={() => handleDownloadFile(file.file_url, file.file_name)} className="text-green-600 hover:text-green-900">Download</button>
                        </>
                      ) : (
                        <span className="text-gray-400 font-bold">-</span>
                      )}
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

export default JobDriveFiles;