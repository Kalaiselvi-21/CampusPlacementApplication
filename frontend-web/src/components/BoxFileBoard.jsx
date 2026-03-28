import React, { useState, useEffect } from "react";
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

const BoxFileBoard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [batchFilter, setBatchFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || (user.role !== "po" && user.role !== "placement_officer")) {
      navigate("/login");
      return;
    }
    fetchBoxFiles();
  }, [user, navigate, authLoading]);

  const fetchBoxFiles = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_BASE}/api/box-files/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFiles(response.data?.files || []);
    } catch (error) {
      console.error("Error fetching box files:", error);
      toast.error("Failed to load box files");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (file) => {
    setDeleteTarget(file);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id || deleteTarget._id;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API_BASE}/api/box-files/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("File deleted successfully");
      setFiles(files.filter(f => (f.id || f._id) !== id));
    } catch (error) {
      toast.error("Failed to delete file");
    } finally {
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  const handleDownload = async (fileUrl, fileName) => {
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
      toast.error("Download failed");
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
  };

  const formatBatch = (batch) => {
    if (Array.isArray(batch)) {
      return [...new Set(batch)].join(', ');
    }
    if (typeof batch === 'string' && batch.startsWith('{') && batch.endsWith('}')) {
      // Remove curly braces, split by comma, trim each part, and remove quotes
      const batches = batch.substring(1, batch.length - 1).split(',').map(s => s.trim().replace(/"/g, ''));
      return [...new Set(batches)].join(', ');
    }
    return batch;
  };

  const getFilteredFiles = () => {
    if (!Array.isArray(files)) return [];
    return files.filter(file => {
      const fileBatch = file?.batch || "";
      const batchMatch = !batchFilter || fileBatch.toLowerCase().includes(batchFilter.toLowerCase());
      const deptMatch = deptFilter === 'all' || file.department === deptFilter;
      return batchMatch && deptMatch;
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <img src="/gct_logo.png" alt="GCT Logo" className="w-16 h-16 object-contain" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Box File Board</h1>
              <p className="text-gray-600 mt-1">Review box files uploaded by department PRs</p>
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
          <div className="flex flex-wrap gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Filter by Batch:</label>
              <input
                type="text"
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                placeholder="e.g. 2023-2027"
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Filter by Department:</label>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">All Departments</option>
                {DEPARTMENTS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">Loading files...</div>
          ) : getFilteredFiles().length === 0 ? (
            <div className="text-center py-12 text-gray-500">No files found matching current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {getFilteredFiles().map((file) => (
                    <tr key={file.id || file._id || file.batch}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{formatBatch(file.batch || file.batch_name)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{file.department}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {file.prName || file.pr_name || "Unknown"} <br/> 
                        <span className="text-xs text-gray-400">
                          on {formatDate(file.uploadedAt || file.uploaded_at)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 italic">{file.fileName || file.file_name || "N/A"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-3">
                          <a href={file.fileUrl || file.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-900">View</a>
                          <button onClick={() => handleDownload(file.fileUrl || file.file_url, file.fileName || file.file_name)} className="text-green-600 hover:text-green-900">Download</button>
                          <button onClick={() => handleDeleteClick(file)} className="text-red-600 hover:text-red-900">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Deletion Confirmation Modal */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <svg
                  className="h-6 w-6 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 18.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">
                  Delete Box File
                </h3>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to delete the box file for <strong>{deleteTarget.department} ({deleteTarget.batch || deleteTarget.batch_name})</strong>? This action will remove the file from S3 and the database immediately.
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoxFileBoard;