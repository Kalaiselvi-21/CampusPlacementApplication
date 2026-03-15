import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
  const API_BASE = process.env.REACT_APP_API_BASE;

const DeletionRequestsBadge = ({ className = "" }) => {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (user?.role === "po" || user?.role === "placement_officer") {
      fetchPendingCount();

      // Poll for updates every 30 seconds
      const interval = setInterval(fetchPendingCount, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchPendingCount = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_BASE}/api/deletion-requests/pending`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setPendingCount(response.data.deletionRequests?.length || 0);
    } catch (error) {
      console.error("Error fetching pending deletion requests count:", error);
    }
  };

  if (
    !user ||
    (user.role !== "po" && user.role !== "placement_officer") ||
    pendingCount === 0
  ) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-1 mr-2 text-xs font-bold leading-none text-white bg-red-600 rounded-full ${className}`}
    >
      {pendingCount}
    </span>
  );
};

export default DeletionRequestsBadge;
