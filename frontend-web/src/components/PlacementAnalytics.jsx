import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  useAnalyticsUpdates,
  useSocketConnection,
  usePlacementDataUpdates,
} from "../hooks/useSocket";

const API_BASE = process.env.REACT_APP_API_BASE;

// Function to abbreviate department names
const abbreviateDepartment = (department) => {
  if (!department) return "";

  // Common department abbreviations
  const abbreviations = {
    "Computer Science": "CSE",
    "Information Technology": "IT",
    "Electronics and Communication Engineering": "ECE",
    "Electrical and Electronics Engineering": "EEE",
    "Mechanical Engineering": "MECH",
    "Civil Engineering": "CIVIL",
    "Electrical Engineering": "EE",
    "Industrial Biotechnology": "IBT",
    "Electrical and Instrumentation": "EIE",
    "Production Engineering": "PROD",
    "Instrumentation Engineering": "IE",
    "Metallurgical Engineering": "MT",
    "Mining Engineering": "MN",
    "Aerospace Engineering": "AE",
    "Chemical Engineering": "CH",
    Biotechnology: "BT",
    Architecture: "AR",
  };

  // Return abbreviated name if available
  if (abbreviations[department]) {
    return abbreviations[department];
  }

  // For other departments, take first letter of each word
  return department
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase();
};

const PlacementAnalytics = () => {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [newBatch, setNewBatch] = useState("");
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [searchDepartment, setSearchDepartment] = useState("");
  const [viewMode, setViewMode] = useState("tabular"); // 'tabular' or 'graphical'
  // Deletion modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Check authorization - only PO and admin can access
  const isAuthorized = user?.role === 'placement_officer' || user?.role === 'po' || user?.role === 'admin';

  // Show unauthorized message if not authorized
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 18.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <h3 className="mt-2 text-lg font-medium text-gray-900">Access Denied</h3>
              <p className="mt-1 text-sm text-gray-500">
                Only Placement Officers and Administrators can access placement analytics.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Socket connection and real-time updates
  useSocketConnection(user?.role);

  // Handle real-time analytics updates
  useAnalyticsUpdates((data) => {
    // Refresh analytics when data is updated
    if (selectedBatch) {
      fetchAnalytics(selectedBatch);
    }
  });

  // Handle real-time placement data updates
  usePlacementDataUpdates((data) => {
    const { action } = data;

    // Refresh batches and analytics based on action
    if (action === "batch_added" || action === "batch_deleted") {
      fetchBatches();
      if (action === "batch_deleted" && selectedBatch === data.data.batch) {
        setSelectedBatch("");
        setAnalytics(null);
      }
    }

    if (action === "data_uploaded" && selectedBatch === data.data.batch) {
      fetchAnalytics(selectedBatch);
    }
  });

  // Chart colors
  const COLORS = [
    "#0088FE",
    "#00C49F",
    "#FFBB28",
    "#FF8042",
    "#8884D8",
    "#82CA9D",
    "#FFC658",
    "#FF6B6B",
  ];

  useEffect(() => {
    fetchBatches();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      fetchAnalytics(selectedBatch);
    }
  }, [selectedBatch]);

  const fetchBatches = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_BASE}/api/placement-analytics/batches`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setBatches(response.data.batches || []);
    } catch (error) {
      console.error("Error fetching batches:", error);
      toast.error("Error fetching batches");
    }
  };

  const fetchAnalytics = async (batch) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_BASE}/api/placement-analytics/${batch}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setAnalytics(response.data.analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      setAnalytics(null);
      if (error.response?.status !== 404) {
        toast.error("Error fetching analytics");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddBatch = async () => {
    if (!newBatch.trim()) {
      toast.error("Please enter a batch name");
      return;
    }

    // Validate batch format
    if (!/^\d{4}(-\d{4})?$/.test(newBatch.trim())) {
      toast.error("Batch name must be in format YYYY or YYYY-YYYY (e.g., 2024 or 2024-2025)");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_BASE}/api/placement-analytics/batches`,
        { batchName: newBatch.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Batch added successfully");
      setNewBatch("");
      setShowAddBatch(false);
      fetchBatches();
    } catch (error) {
      toast.error(error.response?.data?.message || "Error adding batch");
    }
  };

  const handleFileUpload = async () => {
    if (!selectedBatch) {
      toast.error("Please select a batch first");
      return;
    }

    if (!file) {
      toast.error("Please select a file to upload");
      return;
    }

    // Validate file type
    const allowedExtensions = [".csv"];
    const fileName = file.name.toLowerCase();
    const isValidType = allowedExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValidType) {
      toast.error("Only CSV files are supported");
      return;
    }

    // Validate file size
    const maxSize = 10 * 1024 * 1024; // 10MB
    const minSize = 100; // 100 bytes
    
    if (file.size > maxSize) {
      toast.error("File size must be less than 10MB");
      return;
    }
    
    if (file.size < minSize) {
      toast.error("File is too small or empty");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("batch", selectedBatch);

    try {
      setUploadLoading(true);
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_BASE}/api/placement-analytics/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      toast.success("File uploaded and analytics generated successfully");
      setFile(null);
      // Reset file input
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
      
      // Fetch updated analytics
      await fetchAnalytics(selectedBatch);
    } catch (error) {
      toast.error(error.response?.data?.message || "Error uploading file");
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDeleteAnalytics = async () => {
    if (!selectedBatch) return;
    setShowDeleteModal(true);
  };

  const confirmDeleteAnalytics = async () => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API_BASE}/api/placement-analytics/${selectedBatch}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success("Analytics deleted successfully");
      setAnalytics(null);
      setShowDeleteModal(false);
    } catch (error) {
      toast.error(error.response?.data?.message || "Error deleting analytics");
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
  };

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
            <h1 className="text-2xl font-bold text-gray-900">
              Placement Analytics
            </h1>
          </div>

          <div className="p-6">
            {/* Batch Management */}
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
                <h2 className="text-lg font-medium text-gray-900 whitespace-nowrap">
                  Select Batch
                </h2>
                <div className="max-w-xs">
                  <select
                    value={selectedBatch}
                    onChange={(e) => setSelectedBatch(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="">Select a batch</option>
                    {batches.map((batch) => (
                      <option key={batch} value={batch}>
                        {batch}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setShowAddBatch(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 whitespace-nowrap"
                >
                  Add New Batch
                </button>
              </div>

              {showAddBatch && (
                <div className="mb-4 p-4 bg-gray-50 rounded-md">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <input
                      type="text"
                      value={newBatch}
                      onChange={(e) => setNewBatch(e.target.value)}
                      placeholder="Enter batch name (e.g., 2024)"
                      className="w-full sm:max-w-xs border border-gray-300 rounded-md px-3 py-2"
                    />
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <button
                        onClick={handleAddBatch}
                        className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 w-full sm:w-auto"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setShowAddBatch(false);
                          setNewBatch("");
                        }}
                        className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 w-full sm:w-auto"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* File Upload */}
            {selectedBatch && (
              <div className="mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-2">
                  <h2 className="text-lg font-medium text-gray-900 whitespace-nowrap">
                    Upload Placement Data
                  </h2>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="max-w-sm">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => setFile(e.target.files[0])}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                    </div>
                    <button
                      onClick={handleFileUpload}
                      disabled={uploadLoading || !file}
                      className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                    >
                      {uploadLoading ? "Uploading..." : "Upload"}
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-500">
                  Supported formats: CSV (Max size: 10MB)
                </p>
              </div>
            )}

            {/* Analytics Display */}
            {selectedBatch && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium text-gray-900">
                    Analytics for {selectedBatch}
                  </h2>
                  {analytics && (
                    <button
                      onClick={handleDeleteAnalytics}
                      className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
                    >
                      Delete Analytics
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">Loading analytics...</p>
                  </div>
                ) : analytics ? (
                  <div className="space-y-8">
                    {/* Top Summary Section - Ordered as requested */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="bg-blue-50 p-6 rounded-lg border-l-4 border-blue-500">
                        <h3 className="text-lg font-medium text-blue-900">
                          Total Students
                        </h3>
                        <p className="text-3xl font-bold text-blue-600 mt-2">
                          {analytics.totalStudents || 0}
                        </p>
                        <p className="text-sm text-blue-700 mt-1">
                          All registered students
                        </p>
                      </div>
                      <div className="bg-green-50 p-6 rounded-lg border-l-4 border-green-500">
                        <h3 className="text-lg font-medium text-green-900">
                          Placed Students
                        </h3>
                        <p className="text-3xl font-bold text-green-600 mt-2">
                          {analytics.placedStudents || 0}
                        </p>
                        <p className="text-sm text-green-700 mt-1">
                          Successfully placed
                        </p>
                      </div>
                      <div className="bg-yellow-50 p-6 rounded-lg border-l-4 border-yellow-500">
                        <h3 className="text-lg font-medium text-yellow-900">
                          Placement Rate
                        </h3>
                        <p className="text-3xl font-bold text-yellow-600 mt-2">
                          {analytics.placementRate || 0}%
                        </p>
                        <p className="text-sm text-yellow-700 mt-1">
                          Overall success rate
                        </p>
                      </div>
                      <div className="bg-purple-50 p-6 rounded-lg border-l-4 border-purple-500">
                        <h3 className="text-lg font-medium text-purple-900">
                          Total Companies
                        </h3>
                        <p className="text-3xl font-bold text-purple-600 mt-2">
                          {analytics.totalCompanies || 0}
                        </p>
                        <p className="text-sm text-purple-700 mt-1">
                          Recruiting partners
                        </p>
                      </div>
                    </div>

                    {/* Enhanced Statistics Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {/* Highest Package Card */}
                      <div className="bg-gradient-to-br from-green-50 to-emerald-100 p-4 rounded-lg border border-green-200 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-semibold text-green-900">
                            Highest Package
                          </h3>
                          <span className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                            PEAK
                          </span>
                        </div>
                        <div className="mb-3">
                          <p className="text-3xl font-bold text-green-700 mb-1">
                            ₹{analytics.highestPackage || 0}L
                          </p>
                          <p className="text-sm text-green-600">
                            Annual Package
                          </p>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm text-green-700 font-medium mb-2">
                            Top Package Recruiters:
                          </div>
                          {analytics.departmentStats &&
                          analytics.departmentStats.length > 0 ? (
                            analytics.departmentStats
                              .flatMap((dept) => dept.companies || [])
                              .filter(
                                (company) =>
                                  company.averagePackage >=
                                  (analytics.highestPackage || 0) * 0.8
                              )
                              .sort(
                                (a, b) => b.averagePackage - a.averagePackage
                              )
                              .slice(0, 3)
                              .map((company, index) => (
                                <div
                                  key={index}
                                  className="flex justify-between items-center bg-green-100 px-3 py-2 rounded-md"
                                >
                                  <span className="text-green-800 font-medium text-sm">
                                    {company.name}
                                  </span>
                                  <span className="text-green-700 text-xs bg-green-200 px-2 py-1 rounded-full">
                                    ₹{company.averagePackage}L
                                  </span>
                                </div>
                              ))
                          ) : (
                            <div className="text-green-600 text-sm italic">
                              Data will appear after uploading placement records
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Average Package Card */}
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-100 p-4 rounded-lg border border-blue-200 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-semibold text-blue-900">
                            Average Package
                          </h3>
                          <span className="bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                            AVG
                          </span>
                        </div>
                        <div className="mb-3">
                          <p className="text-3xl font-bold text-blue-700 mb-1">
                            ₹{analytics.averagePackage || 0}L
                          </p>
                          <p className="text-sm text-blue-600">
                            Mean Salary Offered
                          </p>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm text-blue-700 font-medium mb-2">
                            Average Range Recruiters:
                          </div>
                          {analytics.departmentStats &&
                          analytics.departmentStats.length > 0 ? (
                            analytics.departmentStats
                              .flatMap((dept) => dept.companies || [])
                              .filter(
                                (company) =>
                                  company.averagePackage >=
                                    (analytics.averagePackage || 0) * 0.8 &&
                                  company.averagePackage <=
                                    (analytics.averagePackage || 0) * 1.2
                              )
                              .sort(
                                (a, b) => b.averagePackage - a.averagePackage
                              )
                              .slice(0, 3)
                              .map((company, index) => (
                                <div
                                  key={index}
                                  className="flex justify-between items-center bg-blue-100 px-3 py-2 rounded-md"
                                >
                                  <span className="text-blue-800 font-medium text-sm">
                                    {company.name}
                                  </span>
                                  <span className="text-blue-700 text-xs bg-blue-200 px-2 py-1 rounded-full">
                                    ₹{company.averagePackage}L
                                  </span>
                                </div>
                              ))
                          ) : (
                            <div className="text-blue-600 text-sm italic">
                              Data will appear after uploading placement records
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Lowest Package Card */}
                      <div className="bg-gradient-to-br from-orange-50 to-amber-100 p-4 rounded-lg border border-orange-200 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-semibold text-orange-900">
                            Lowest Package
                          </h3>
                          <span className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                            MIN
                          </span>
                        </div>
                        <div className="mb-3">
                          <p className="text-3xl font-bold text-orange-700 mb-1">
                            ₹{analytics.lowestPackage || 0}L
                          </p>
                          <p className="text-sm text-orange-600">
                            Starting Package
                          </p>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm text-orange-700 font-medium mb-2">
                            Entry Level Recruiters:
                          </div>
                          {analytics.departmentStats &&
                          analytics.departmentStats.length > 0 ? (
                            analytics.departmentStats
                              .flatMap((dept) => dept.companies || [])
                              .filter(
                                (company) =>
                                  company.averagePackage <=
                                  (analytics.lowestPackage || 0) * 1.5
                              )
                              .sort(
                                (a, b) => b.averagePackage - a.averagePackage
                              )
                              .slice(0, 3)
                              .map((company, index) => (
                                <div
                                  key={index}
                                  className="flex justify-between items-center bg-orange-100 px-3 py-2 rounded-md"
                                >
                                  <span className="text-orange-800 font-medium text-sm">
                                    {company.name}
                                  </span>
                                  <span className="text-orange-700 text-xs bg-orange-200 px-2 py-1 rounded-full">
                                    ₹{company.averagePackage}L
                                  </span>
                                </div>
                              ))
                          ) : (
                            <div className="text-orange-600 text-sm italic">
                              Data will appear after uploading placement records
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Department-wise Placement Section */}
                    {analytics.departmentStats &&
                      analytics.departmentStats.length > 0 && (
                        <div className="bg-white p-6 rounded-lg shadow">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                            <h3 className="text-xl font-bold text-gray-900">
                              Department-wise Placement Analysis
                            </h3>
                            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                              {/* Department Filter */}
                              <div className="relative">
                                <select
                                  value={searchDepartment}
                                  onChange={(e) =>
                                    setSearchDepartment(e.target.value)
                                  }
                                  className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                >
                                  <option value="">All departments</option>
                                  {analytics.departmentStats
                                    .map((dept) => dept.department)
                                    .sort((a, b) => a.localeCompare(b))
                                    .map((dept) => (
                                      <option key={dept} value={dept}>
                                        {dept}
                                      </option>
                                    ))}
                                </select>
                              </div>

                              {/* View Toggle */}
                              <div className="flex bg-gray-100 rounded-lg p-1">
                                <button
                                  onClick={() => setViewMode("tabular")}
                                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                    viewMode === "tabular"
                                      ? "bg-white text-blue-600 shadow-sm"
                                      : "text-gray-600 hover:text-gray-900"
                                  }`}
                                >
                                  Table View
                                </button>
                                <button
                                  onClick={() => setViewMode("graphical")}
                                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                    viewMode === "graphical"
                                      ? "bg-white text-blue-600 shadow-sm"
                                      : "text-gray-600 hover:text-gray-900"
                                  }`}
                                >
                                  Chart View
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Filter departments based on search */}
                          {(() => {
                            const filteredDepartments =
                              analytics.departmentStats.filter((dept) =>
                                dept.department
                                  .toLowerCase()
                                  .includes(searchDepartment.toLowerCase().trim())
                              );

                            if (viewMode === "tabular") {
                              return (
                                <div className="space-y-6">
                                  {filteredDepartments.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500">
                                      No departments match your search
                                    </div>
                                  ) : (
                                    filteredDepartments.map((dept, index) => (
                                    <div
                                      key={index}
                                      className="border border-gray-200 rounded-lg overflow-hidden"
                                    >
                                      {/* Department Header with Statistics */}
                                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
                                        <h4 className="text-xl font-bold text-gray-800 mb-4">
                                          {dept.department}
                                        </h4>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                          <div className="text-center">
                                            <div className="text-2xl font-bold text-blue-600">
                                              {dept.totalStudents}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                              Total Students
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-2xl font-bold text-green-600">
                                              {dept.placedStudents}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                              Placed Students
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-2xl font-bold text-yellow-600">
                                              {dept.placementRate}%
                                            </div>
                                            <div className="text-sm text-gray-600">
                                              Placement Rate
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="flex items-center justify-center">
                                              <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full mr-1">
                                                HIGH
                                              </span>
                                              <span className="text-2xl font-bold text-green-600">
                                                ₹{dept.highestPackage || 0}L
                                              </span>
                                            </div>
                                            <div className="text-sm text-gray-600">
                                              Highest Package
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="flex items-center justify-center">
                                              <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2 py-1 rounded-full mr-1">
                                                LOW
                                              </span>
                                              <span className="text-2xl font-bold text-orange-600">
                                                ₹{dept.lowestPackage || 0}L
                                              </span>
                                            </div>
                                            <div className="text-sm text-gray-600">
                                              Lowest Package
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-2xl font-bold text-purple-600">
                                              {dept.totalCompanies || 0}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                              Total Companies
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Company Statistics Cards */}
                                      {dept.companies &&
                                        dept.companies.length > 0 && (
                                          <div className="p-6">
                                            <h5 className="text-lg font-semibold text-gray-800 mb-4">
                                              Company Statistics
                                            </h5>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                              {dept.companies.map(
                                                (company, cIndex) => (
                                                  <div
                                                    key={cIndex}
                                                    className="bg-gray-50 p-4 rounded-lg hover:shadow-md transition-shadow duration-200 border border-gray-100 hover:border-gray-200"
                                                  >
                                                    <div className="font-medium text-gray-900 mb-2">
                                                      {company.name}
                                                    </div>
                                                    <div className="text-sm text-gray-600">
                                                      Students Hired:{" "}
                                                      <span className="font-medium">
                                                        {company.studentsPlaced}
                                                      </span>
                                                    </div>
                                                    <div className="text-sm text-gray-600 mt-1">
                                                      Avg Package:{" "}
                                                      <span className="font-medium">
                                                        ₹
                                                        {company.averagePackage}
                                                        L
                                                      </span>
                                                    </div>
                                                  </div>
                                                )
                                              )}
                                            </div>
                                          </div>
                                        )}
                                    </div>
                                  ))
                                  )}
                                </div>
                              );
                            } else {
                              // Graphical View
                              if (filteredDepartments.length === 0) {
                                return (
                                  <div className="text-center py-8 text-gray-500">
                                    No departments match your search
                                  </div>
                                );
                              }
                              
                              return (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                  {/* Department-wise Placement Chart */}
                                  <div className="bg-white p-6 rounded-lg shadow">
                                    <h4 className="text-lg font-medium text-gray-900 mb-4">
                                      Placement Rate by Department
                                    </h4>
                                    <ResponsiveContainer
                                      width="100%"
                                      height={300}
                                    >
                                      <BarChart data={filteredDepartments}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                          dataKey="department"
                                          angle={-45}
                                          textAnchor="end"
                                          height={80}
                                          tickFormatter={(department) =>
                                            abbreviateDepartment(department)
                                          }
                                        />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Bar
                                          dataKey="placementRate"
                                          fill="#3B82F6"
                                          name="Placement Rate (%)"
                                        />
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>

                                  {/* Package Distribution Chart */}
                                  <div className="bg-white p-6 rounded-lg shadow">
                                    <h4 className="text-lg font-medium text-gray-900 mb-4">
                                      Package Range by Department
                                    </h4>
                                    <ResponsiveContainer
                                      width="100%"
                                      height={300}
                                    >
                                      <BarChart data={filteredDepartments}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                          dataKey="department"
                                          angle={-45}
                                          textAnchor="end"
                                          height={80}
                                          tickFormatter={(department) =>
                                            abbreviateDepartment(department)
                                          }
                                        />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Bar
                                          dataKey="highestPackage"
                                          fill="#10B981"
                                          name="Highest Package (LPA)"
                                        />
                                        <Bar
                                          dataKey="lowestPackage"
                                          fill="#F59E0B"
                                          name="Lowest Package (LPA)"
                                        />
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>

                                  {/* Students Distribution Pie Chart */}
                                  <div className="bg-white p-6 rounded-lg shadow lg:col-span-2">
                                    <h4 className="text-lg font-medium text-gray-900 mb-4">
                                      Student Distribution by Department
                                    </h4>
                                    <ResponsiveContainer
                                      width="100%"
                                      height={400}
                                    >
                                      <PieChart>
                                        <Pie
                                          data={filteredDepartments}
                                          cx="50%"
                                          cy="50%"
                                          labelLine={false}
                                          label={({
                                            department,
                                            totalStudents,
                                          }) =>
                                            `${department}: ${totalStudents}`
                                          }
                                          outerRadius={120}
                                          fill="#8884d8"
                                          dataKey="totalStudents"
                                          nameKey="department"
                                        >
                                          {filteredDepartments.map(
                                            (entry, index) => (
                                              <Cell
                                                key={`cell-${index}`}
                                                fill={
                                                  COLORS[index % COLORS.length]
                                                }
                                              />
                                            )
                                          )}
                                        </Pie>
                                        <Tooltip
                                          content={({ active, payload }) => {
                                            if (!active || !payload || payload.length === 0) {
                                              return null;
                                            }
                                            const { department, totalStudents, placedStudents } =
                                              payload[0].payload || {};
                                            const notPlaced =
                                              typeof totalStudents === "number" &&
                                              typeof placedStudents === "number"
                                                ? totalStudents - placedStudents
                                                : 0;
                                            return (
                                              <div className="bg-white border border-gray-200 rounded-md shadow-sm px-3 py-2">
                                                <div className="text-sm font-medium text-gray-900">
                                                  {department}
                                                </div>
                                                <div className="text-xs text-gray-600">
                                                  Placed: {placedStudents || 0}
                                                </div>
                                                <div className="text-xs text-gray-600">
                                                  Not Placed: {notPlaced}
                                                </div>
                                              </div>
                                            );
                                          }}
                                        />
                                      </PieChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>
                              );
                            }
                          })()}
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-600">
                      No analytics data available for this batch.
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      Upload a file to generate analytics.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
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
                    Delete Analytics
                  </h3>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Are you sure you want to delete analytics for batch{" "}
                  {selectedBatch}? This action cannot be undone.
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
                  onClick={confirmDeleteAnalytics}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlacementAnalytics;