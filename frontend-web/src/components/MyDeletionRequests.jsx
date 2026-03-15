import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import {
  useDeletionRequestUpdates,
  useSocketConnection,
} from "../hooks/useSocket";

const API_BASE = process.env.REACT_APP_API_BASE;

const MyDeletionRequests = () => {
  const { user } = useAuth();
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  // Socket connection and real-time updates
  useSocketConnection(user?.role);

  // Handle real-time deletion request updates
  useDeletionRequestUpdates((data) => {
    const { action } = data;

    // Refetch data when deletion requests are approved or rejected
    if (action === "approved" || action === "rejected") {
      if (user?.role === "placement_representative" || user?.role === "pr") {
        fetchMyDeletionRequests();
      }
    }
  });

  useEffect(() => {
    if (user?.role === "placement_representative" || user?.role === "pr") {
      fetchMyDeletionRequests();
    }
  }, [user]);

  const fetchMyDeletionRequests = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_BASE}/api/deletion-requests/my-requests`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setDeletionRequests(response.data.deletionRequests || []);
    } catch (error) {
      console.error("Error fetching my deletion requests:", error);
      toast.error("Failed to fetch deletion requests");
    } finally {
      setLoading(false);
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

  if (
    !user ||
    (user.role !== "placement_representative" && user.role !== "pr")
  ) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (deletionRequests.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          My Deletion Requests
        </h3>
        <p className="text-gray-500 text-center py-4">
          No deletion requests submitted yet.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        My Deletion Requests
      </h3>

      <div className="space-y-4">
        {deletionRequests.slice(0, 3).map((request) => (
          <div
            key={request._id}
            className="border border-gray-200 rounded-lg p-4"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">
                  {request.jobDrive?.companyName} - {request.jobDrive?.role}
                </h4>
                <p className="text-sm text-gray-600 mt-1">
                  Requested: {formatDate(request.createdAt)}
                </p>
              </div>
              <div className="ml-4">{getStatusBadge(request.status)}</div>
            </div>

            <div className="text-sm text-gray-700 mb-2">
              <strong>Reason:</strong> {request.reason}
            </div>

            {request.status !== "pending" && request.reviewedBy && (
              <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                <strong>Reviewed by:</strong>{" "}
                {request.reviewedBy?.profile?.name || request.reviewedBy?.email}
                <br />
                <strong>Reviewed at:</strong> {formatDate(request.reviewedAt)}
                {request.reviewComments && (
                  <>
                    <br />
                    <strong>Comments:</strong> {request.reviewComments}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {deletionRequests.length > 3 && (
        <div className="mt-4 text-center">
          <button
            onClick={() => (window.location.href = "/my-deletion-requests")}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            View All ({deletionRequests.length} total)
          </button>
        </div>
      )}
    </div>
  );
};

export default MyDeletionRequests;
