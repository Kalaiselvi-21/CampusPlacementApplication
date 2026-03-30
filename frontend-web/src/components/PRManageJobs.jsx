import { API_BASE } from '../config/api';
import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";

const PRManageJobs = () => {
    const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  // Deletion modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState(null);
  const [deleteJobName, setDeleteJobName] = useState("");

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_BASE}/api/job-drives/pr-jobs`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setJobs(response.data.jobs || []);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      toast.error("Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteJob = async (jobId) => {
    const job = jobs.find((j) => j._id === jobId);
    const jobName = job ? `${job.companyName} - ${job.role}` : "this job";

    setDeleteJobId(jobId);
    setDeleteJobName(jobName);
    setShowDeleteModal(true);
  };

  const confirmDeleteJob = async () => {
    if (!deleteJobId) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API_BASE}/api/job-drives/${deleteJobId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      toast.success("Job deleted successfully");
      fetchJobs();

      // Close modal and reset state
      setShowDeleteModal(false);
      setDeleteJobId(null);
      setDeleteJobName("");
    } catch (error) {
      toast.error("Failed to delete job");
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteJobId(null);
    setDeleteJobName("");
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
    };
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${
          statusConfig[status] || "bg-gray-100 text-gray-800"
        }`}
      >
        {status}
      </span>
    );
  };

  const filteredJobs = jobs.filter((job) => {
    if (filter === "all") return true;
    return job.approvalStatus === filter;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">Loading...</div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img
              src="/gct_logo.png"
              alt="GCT Logo"
              className="w-16 h-16 object-contain"
            />
            <h1 className="text-3xl font-bold text-gray-900">
              Manage Job Postings
            </h1>
          </div>
          <button
            onClick={() => navigate("/pr/create-job")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Create New Job
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {["all", "pending", "approved", "rejected"].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                  filter === status
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {status} (
                {
                  jobs.filter(
                    (j) => status === "all" || j.approvalStatus === status
                  ).length
                }
                )
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Jobs List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        {filteredJobs.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900">No jobs found</h3>
            <p className="text-gray-500">
              Create your first job posting to get started.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredJobs.map((job) => (
              <li key={job._id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-medium text-gray-900">
                        {job.role}
                      </h3>
                      {getStatusBadge(job.approvalStatus)}
                      {job.isDreamJob && (
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-medium">
                          Dream Job
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600">{job.companyName}</p>
                    <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                      <span>📍 {job.location}</span>
                      <span>💰 ₹{job.ctc} LPA</span>
                      <span>📅 {new Date(job.date).toLocaleDateString()}</span>
                      <span>
                        ⏰ Deadline:{" "}
                        {new Date(job.deadline).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => navigate(`/job-drives/${job._id}`)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View
                    </button>
                    <button
                      onClick={() =>
                        navigate(
                          `/pr/edit-job/${job._id}?returnTo=/pr-manage-jobs`
                        )
                      }
                      className="text-green-600 hover:text-green-800 text-sm font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteJob(job._id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Deletion Confirmation Modal */}
      {showDeleteModal && (
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
                  Delete Job
                </h3>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to delete {deleteJobName}? This action
                cannot be undone.
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteJob}
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

export default PRManageJobs;
