import { API_BASE } from '../config/api';
import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import {
  useDeletionRequestUpdates,
  useSocketConnection,
} from "../hooks/useSocket";


const DeletionRequests = () => {
  const { user } = useAuth();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("pending"); // 'pending' or 'all'
  const [reviewingRequest, setReviewingRequest] = useState(null);
  const [reviewComments, setReviewComments] = useState("");

  // Socket connection and real-time updates
  useSocketConnection(user?.role);

  // Handle real-time deletion request updates
  useDeletionRequestUpdates((data) => {
    const { action } = data;

    // Refetch data when deletion requests are created, approved, or rejected
    if (
      action === "created" ||
      action === "approved" ||
      action === "rejected"
    ) {
      fetchPendingRequests();
      fetchAllRequests();
    }
  });

  useEffect(() => {
    if (user?.role === "po" || user?.role === "placement_officer") {
      fetchPendingRequests();
      fetchAllRequests();
    }
  }, [user]);

  const fetchPendingRequests = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_BASE}/api/deletion-requests/pending`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setPendingRequests(response.data.deletionRequests || []);
    } catch (error) {
      console.error("Error fetching pending requests:", error);
      toast.error("Failed to fetch pending deletion requests");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllRequests = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_BASE}/api/deletion-requests/all`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setAllRequests(response.data.deletionRequests || []);
    } catch (error) {
      console.error("Error fetching all requests:", error);
      toast.error("Failed to fetch deletion requests");
    }
  };

  const handleReviewRequest = async (requestId, action) => {
    try {
      const token = localStorage.getItem("token");
      await axios.patch(
        `${API_BASE}/api/deletion-requests/${requestId}/review`,
        {
          action,
          comments: reviewComments,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success(
        `Deletion request ${
          action === "approve" ? "approved" : "rejected"
        } successfully`
      );
      setReviewingRequest(null);
      setReviewComments("");
      fetchPendingRequests();
      fetchAllRequests();
    } catch (error) {
      console.error("Error reviewing request:", error);
      toast.error(`Failed to ${action} deletion request`);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status) => {
    const statusStyles = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
    };

    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${statusStyles[status]}`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (user?.role !== "po" && user?.role !== "placement_officer") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-600">
            Only Placement Officers can view deletion requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-4">
            <img
              src="/gct_logo.png"
              alt="GCT Logo"
              className="w-12 h-12 object-contain"
            />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Drive Deletion Requests
              </h1>
              <p className="text-gray-600 mt-1">
                Review and manage deletion requests from Placement Representatives
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <button
                onClick={() => setActiveTab("pending")}
                className={`py-2 px-4 border-b-2 font-medium text-sm ${
                  activeTab === "pending"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Pending ({pendingRequests.length})
              </button>
              <button
                onClick={() => setActiveTab("all")}
                className={`py-2 px-4 border-b-2 font-medium text-sm ${
                  activeTab === "all"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                All Requests ({allRequests.length})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">
                  Loading deletion requests...
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {(activeTab === "pending" ? pendingRequests : allRequests)
                  .length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">
                      {activeTab === "pending"
                        ? "No pending deletion requests"
                        : "No deletion requests found"}
                    </p>
                  </div>
                ) : (
                  (activeTab === "pending" ? pendingRequests : allRequests).map(
                    (request) => (
                      <div
                        key={request._id}
                        className="bg-gray-50 rounded-lg p-6 border border-gray-200"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {request.jobDrive?.companyName ||
                                request.jobDriveDetails?.companyName}{" "}
                              -{" "}
                              {request.jobDrive?.role ||
                                request.jobDriveDetails?.role}
                            </h3>
                            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                              <span>
                                Drive Date:{" "}
                                {formatDate(
                                  request.jobDrive?.date ||
                                    request.jobDriveDetails?.date
                                ) || "Invalid Date"}
                              </span>
                              <span>•</span>
                              <span>
                                Requested by:{" "}
                                {request.requestedBy?.profile?.name ||
                                  request.requestedBy?.email}
                              </span>
                              <span>•</span>
                              <span>
                                Requested: {formatDate(request.createdAt)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {getStatusBadge(request.status)}
                          </div>
                        </div>

                        <div className="mb-4">
                          <h4 className="font-medium text-gray-900 mb-1">
                            Reason for Deletion:
                          </h4>
                          <p className="text-gray-700 bg-white p-3 rounded border">
                            {request.reason}
                          </p>
                        </div>

                        {request.status !== "pending" && request.reviewedBy && (
                          <div className="mb-4">
                            <h4 className="font-medium text-gray-900 mb-1">
                              Review Details:
                            </h4>
                            <div className="text-sm text-gray-600 bg-white p-3 rounded border">
                              <p>
                                <strong>Reviewed by:</strong>{" "}
                                {request.reviewedBy?.profile?.name ||
                                  request.reviewedBy?.email}
                              </p>
                              <p>
                                <strong>Reviewed at:</strong>{" "}
                                {formatDate(request.reviewedAt)}
                              </p>
                              {request.reviewComments && (
                                <p>
                                  <strong>Comments:</strong>{" "}
                                  {request.reviewComments}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {request.status === "pending" && (
                          <div className="flex justify-end space-x-3">
                            <button
                              onClick={() => setReviewingRequest(request._id)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            >
                              Review Request
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {reviewingRequest && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Review Deletion Request
              </h3>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comments (Optional)
                </label>
                <textarea
                  value={reviewComments}
                  onChange={(e) => setReviewComments(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Add any comments for this decision..."
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setReviewingRequest(null);
                    setReviewComments("");
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    handleReviewRequest(reviewingRequest, "reject")
                  }
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Reject
                </button>
                <button
                  onClick={() =>
                    handleReviewRequest(reviewingRequest, "approve")
                  }
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Approve & Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeletionRequests;
