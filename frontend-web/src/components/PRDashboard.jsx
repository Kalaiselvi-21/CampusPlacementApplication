import { API_BASE } from '../config/api';
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import CarouselBanner from "./CarouselBanner";
import { downloadSignedFile } from "../services/downloadSignedFile";

const PRDashboard = () => {
    const { user } = useAuth();
  const navigate = useNavigate();
  const [allDrives, setAllDrives] = useState([]);
  const [eligibleDrives, setEligibleDrives] = useState([]);
  const [departmentApplications, setDepartmentApplications] = useState(0);
  const [myTestsCount, setMyTestsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // ✅ ADDED: Box file states
  const [boxFileUploadEnabled, setBoxFileUploadEnabled] = useState(false);
  const [boxFileBatch, setBoxFileBatch] = useState("");
  const [existingBoxFile, setExistingBoxFile] = useState(null);
  const [boxFileUploadLoading, setBoxFileUploadLoading] = useState(false);
  const [boxFileMetadataLoading, setBoxFileMetadataLoading] = useState(false);
  const [boxFileReplaceMode, setBoxFileReplaceMode] = useState(false);
  const [boxFileDeletedNotice, setBoxFileDeletedNotice] = useState(false);

  // ✅ ADDED: Templates modal states
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [templates, setTemplates] = useState(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const handleViewDrive = (drive) => {
    setSelectedDrive(drive);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedDrive(null);
  };

  const getAppliedStudentsCount = (drive) => {
    if (Number.isFinite(Number(drive?.applicationCount))) {
      return Number(drive.applicationCount);
    }

    return Array.isArray(drive?.applications) ? drive.applications.length : 0;
  };

  const handleManageDrive = () => {
    navigate("/all-job-drives", { state: { fromPR: true } });
  };

  // ✅ ADDED
  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_BASE}/api/templates/latest`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTemplates(response.data?.templates || null);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to fetch templates");
    } finally {
      setTemplatesLoading(false);
    }
  };

  // ✅ ADDED
  const handleDownloadFile = (downloadUrl, fallbackUrl) => {
    try {
      downloadSignedFile(downloadUrl, fallbackUrl);
    } catch (error) {
      toast.error("No download link available");
    }
  };

  // ✅ ADDED
  const openTemplateModal = () => {
    setShowTemplatesModal(true);
    fetchTemplates();
  };

  // ✅ ADDED
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
  };

  // 🔁 MODIFIED: normalize Postgres array-like batch values such as {"2023-2027","2023-2027"}.
  const formatBatch = (batch) => {
    if (Array.isArray(batch)) {
      return [...new Set(batch)].join(", ");
    }

    if (typeof batch === "string") {
      const trimmed = batch.trim();

      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        const batches = trimmed
          .substring(1, trimmed.length - 1)
          .split(",")
          .map((value) => value.trim().replace(/"/g, ""))
          .filter(Boolean);

        return [...new Set(batches)].join(", ");
      }
    }

    return batch;
  };

  // ✅ ADDED
  const fetchBoxFileStatus = async () => {
    try {
      const token = localStorage.getItem("token");
      const settingsRes = await axios.get(`${API_BASE}/api/box-files/toggle-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBoxFileUploadEnabled(Boolean(settingsRes.data?.enabled));

      if (settingsRes.data?.enabled) {
        const fileRes = await axios.get(`${API_BASE}/api/box-files/my-file`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fileRes.data?.file) {
          setExistingBoxFile(fileRes.data.file);
          setBoxFileBatch(formatBatch(fileRes.data.file.batch || fileRes.data.file.batch_name || ""));
          setBoxFileDeletedNotice(false);
        } else {
          // Clear stale file card when backend says record no longer exists (e.g. deleted by PO).
          if (existingBoxFile) {
            setBoxFileDeletedNotice(true);
          }
          setExistingBoxFile(null);
          setBoxFileReplaceMode(false);
        }
      }
    } catch (error) {
      console.error("Error fetching box file status:", error);
    }
  };

  // ✅ ADDED
  const handleBoxFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const batchRegex = /^\d{4}-\d{4}$/;
    if (!batchRegex.test(boxFileBatch)) {
      toast.error("Please enter batch in YYYY-YYYY format (e.g., 2023-2027)");
      return;
    }

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only PDF and DOCX files are allowed");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("batch", boxFileBatch);
    formData.append("department", user?.profile?.department || "");

    setBoxFileUploadLoading(true);
    const toastId = toast.loading(existingBoxFile ? "Replacing file..." : "Uploading file...");

    try {
      const token = localStorage.getItem("token");
      const fileId = existingBoxFile?.id || existingBoxFile?._id || existingBoxFile?.file_id;
      const endpoint = existingBoxFile && fileId
        ? `${API_BASE}/api/box-files/replace/${fileId}`
        : `${API_BASE}/api/box-files/upload`;

      const response = await axios.post(endpoint, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      setExistingBoxFile(response.data?.file || null);
      setBoxFileBatch(formatBatch(response.data?.file?.batch || response.data?.file?.batch_name || boxFileBatch));
      setBoxFileReplaceMode(false);
      setBoxFileDeletedNotice(false);
      toast.success(response.data?.message || "File saved successfully", { id: toastId });
    } catch (error) {
      const backendMessage = error.response?.data?.message || "Upload failed";

      if (
        error.response?.status === 404 ||
        error.response?.status === 409 ||
        /file record not found/i.test(backendMessage) ||
        /stale/i.test(backendMessage)
      ) {
        // The row was removed (typically by PO delete). Reset stale client state and allow fresh upload.
        setExistingBoxFile(null);
        setBoxFileReplaceMode(false);
        setBoxFileDeletedNotice(true);
        await fetchBoxFileStatus();
        toast.error("Your box file record changed or was deleted. Please refresh and try again.", { id: toastId });
      } else {
        toast.error(backendMessage, { id: toastId });
      }
    } finally {
      setBoxFileUploadLoading(false);
      event.target.value = "";
    }
  };

  const handleBatchMetadataUpdate = async () => {
    const fileId = existingBoxFile?.id || existingBoxFile?._id || existingBoxFile?.file_id;
    if (!fileId) {
      toast.error("No existing box file found to update");
      return;
    }

    const batchRegex = /^\d{4}-\d{4}$/;
    if (!batchRegex.test(boxFileBatch)) {
      toast.error("Please enter batch in YYYY-YYYY format (e.g., 2023-2027)");
      return;
    }

    const currentBatch = formatBatch(
      existingBoxFile?.batch || existingBoxFile?.batch_name || ""
    );
    if (String(currentBatch || "").trim() === String(boxFileBatch || "").trim()) {
      toast("Batch is already up to date");
      return;
    }

    setBoxFileMetadataLoading(true);
    const toastId = toast.loading("Updating batch...");

    try {
      const token = localStorage.getItem("token");
      const response = await axios.patch(
        `${API_BASE}/api/box-files/${fileId}`,
        { batch: boxFileBatch },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      setExistingBoxFile(response.data?.file || null);
      setBoxFileBatch(
        formatBatch(response.data?.file?.batch || response.data?.file?.batch_name || boxFileBatch)
      );
      setBoxFileDeletedNotice(false);
      toast.success(response.data?.message || "Batch updated successfully", { id: toastId });
    } catch (error) {
      const backendMessage = error.response?.data?.message || "Failed to update batch";

      if (
        error.response?.status === 404 ||
        error.response?.status === 409 ||
        /deleted/i.test(backendMessage) ||
        /stale/i.test(backendMessage)
      ) {
        setExistingBoxFile(null);
        setBoxFileReplaceMode(false);
        setBoxFileDeletedNotice(true);
        await fetchBoxFileStatus();
      }

      toast.error(backendMessage, { id: toastId });
    } finally {
      setBoxFileMetadataLoading(false);
    }
  };

  // Add helper function to check if drive is active (not ended)
  const isDriveActive = (drive) => {
    if (!drive.date) return false;

    const driveDate = new Date(drive.date);
    const currentDate = new Date();

    // If drive has time, use it for comparison
    if (drive.time) {
      const [hours, minutes] = drive.time.split(":").map(Number);
      driveDate.setHours(hours, minutes, 0, 0);
      return currentDate <= driveDate && drive.isActive !== false;
    } else {
      // If no time specified, consider drive active until end of day
      driveDate.setHours(23, 59, 59, 999);
      return currentDate <= driveDate && drive.isActive !== false;
    }
  };

  // Modal component
  const DriveModal = ({ drive, onClose }) => {
    if (!drive) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {drive.companyName}
                </h2>
                <p className="text-xl text-gray-600">{drive.role}</p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900">Job Details</h3>
                  <div className="mt-2 space-y-2 text-sm">
                    <p>
                      <span className="font-medium">Type:</span>{" "}
                      {drive.type === "full-time"
                        ? "Full Time"
                        : drive.type === "internship"
                        ? "Internship"
                        : drive.jobType === "full-time"
                        ? "Full Time"
                        : drive.jobType === "internship"
                        ? "Internship"
                        : "Full Time"}
                    </p>
                    <p>
                      <span className="font-medium">Location:</span>{" "}
                      {drive.location ||
                        drive.locations?.join(", ") ||
                        "Not specified"}
                    </p>
                    <p>
                      <span className="font-medium">CTC:</span>{" "}
                      {drive.ctc ? `₹${drive.ctc} LPA` : "Not specified"}
                    </p>
                    <p>
                      <span className="font-medium">Date:</span>{" "}
                      {drive.date
                        ? new Date(drive.date).toLocaleDateString()
                        : "Not specified"}
                    </p>
                    <p>
                      <span className="font-medium">Deadline:</span>{" "}
                      {drive.deadline
                        ? new Date(drive.deadline).toLocaleDateString()
                        : "Not specified"}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900">
                    Eligibility Criteria
                  </h3>
                  <div className="mt-2 space-y-1 text-sm">
                    <p>
                      <span className="font-medium">Min CGPA:</span>{" "}
                      {drive.eligibility?.minCGPA || 0}
                    </p>
                    <p>
                      <span className="font-medium">Max Backlogs:</span>{" "}
                      {drive.eligibility?.maxBacklogs || 0}
                    </p>
                    <p>
                      <span className="font-medium">Departments:</span>{" "}
                      {drive.eligibility?.allowedDepartments?.join(", ") ||
                        "All"}
                    </p>
                    <p>
                      <span className="font-medium">Batches:</span>{" "}
                      {drive.eligibility?.allowedBatches?.join(", ") || "All"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900">Description</h3>
                  <p className="mt-2 text-sm text-gray-700">
                    {drive.description || "No description provided"}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900">Requirements</h3>
                  <p className="mt-2 text-sm text-gray-700">
                    {drive.requirements && drive.requirements.trim() !== ""
                      ? drive.requirements
                      : "No specific requirements mentioned"}
                  </p>
                </div>

                {drive.skills && drive.skills.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Required Skills
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {drive.skills.map((skill, index) => (
                        <span
                          key={index}
                          className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {drive.bond && (
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Bond Details
                    </h3>
                    <p className="mt-2 text-sm text-gray-700">{drive.bond}</p>
                  </div>
                )}

                {drive.rounds && drive.rounds.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Selection Rounds
                    </h3>
                    <div className="mt-2 space-y-1">
                      {drive.rounds.map((round, index) => (
                        <p key={index} className="text-sm text-gray-700">
                          {index + 1}. {round}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">
                  <p>Applications: {getAppliedStudentsCount(drive)}</p>
                  <p>
                    Created by:{" "}
                    {drive.createdBy?.profile?.name ||
                      drive.createdBy?.email ||
                      (drive.createdBy ? "Unknown User" : "System Generated")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!user || user.role !== "placement_representative") {
      navigate("/login");
      return;
    }

    if (!user.profile?.isProfileComplete) {
      navigate("/pr-profile-setup");
      return;
    }

    fetchAllData();
    fetchBoxFileStatus();
  }, [user, navigate]);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      // Fetch all drives
      const allDrivesResponse = await axios.get(
        `${API_BASE}/api/job-drives`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      setAllDrives(
        allDrivesResponse.data.jobDrives || allDrivesResponse.data || []
      );

      // Fetch PR-specific drives
      const prDrivesResponse = await axios.get(
        `${API_BASE}/api/job-drives/pr-jobs`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      setEligibleDrives(prDrivesResponse.data.jobs || []);

      // Calculate department-specific drives count using the same logic as display section
      const userDepartment = user?.profile?.department;
      const allJobDrives =
        allDrivesResponse.data.jobDrives || allDrivesResponse.data || [];

      const departmentDrives = allJobDrives.filter((drive) => {
        // Use exact same logic as in the display section
        const userDepartment = user?.profile?.department;
        if (!userDepartment) return false;

        // If no department restrictions, it's available to all departments
        if (
          !drive.eligibility?.allowedDepartments ||
          drive.eligibility.allowedDepartments.length === 0
        ) {
          return true;
        }
        // Check if user's department is in allowed departments
        return drive.eligibility.allowedDepartments.includes(userDepartment);
      });

      setDepartmentApplications(departmentDrives.length);

      // Fetch PR's own tests count
      try {
        const testsResponse = await axios.get(`${API_BASE}/api/prep/tests/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMyTestsCount((testsResponse.data.tests || []).length);
      } catch {
        setMyTestsCount(0);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      if (error.response?.status === 401) {
        console.log("Token expired, redirecting to login");
        localStorage.removeItem("token");
        navigate("/login");
        return;
      }
      // Set empty arrays for other errors
      setAllDrives([]);
      setEligibleDrives([]);
      setDepartmentApplications(0);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <CarouselBanner userRole="placement_representative" />
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <img
              src="/gct_logo.png"
              alt="GCT Logo"
              className="w-16 h-16 object-contain"
            />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Placement Representative Dashboard
              </h1>
              <p className="text-gray-600">
                Welcome, {user?.profile?.name || user?.name}!
              </p>
              <p className="text-sm text-gray-500">
                Department: {user?.profile?.department}
              </p>
            </div>
          </div>
          <div className="flex space-x-4">
            <button
              onClick={openTemplateModal}
              className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors"
            >
              View Templates
            </button>
            <button
              onClick={() => navigate("/edit-profile")}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              Edit Profile
            </button>
          </div>
        </div>

        {/* Stats Cards - Fix the calculations */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900">
              All Available Drives
            </h3>
            <p className="text-3xl font-bold text-blue-600">
              {allDrives.length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900">
              My Eligible Drives
            </h3>
            <p className="text-3xl font-bold text-green-600">
              {departmentApplications}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900">
              {user?.profile?.department} Available Drives
            </h3>
            <p className="text-3xl font-bold text-purple-600">
              {departmentApplications}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Job drives available for your department
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900">
              Active Drives
            </h3>
            <p className="text-3xl font-bold text-orange-600">
              {allDrives.filter((drive) => isDriveActive(drive)).length}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Currently ongoing drives
            </p>
          </div>
          <div
            className="bg-white p-6 rounded-lg shadow cursor-pointer hover:shadow-md transition"
            onClick={() => navigate("/placement-preparation")}
          >
            <h3 className="text-lg font-semibold text-gray-900">
              My Tests
            </h3>
            <p className="text-3xl font-bold text-indigo-600">
              {myTestsCount}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Manage &amp; view past tests
            </p>
          </div>
        </div>

        {/* ✅ ADDED: Box File Upload Section */}
        {boxFileUploadEnabled && (
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Upload Box File</h2>
              <p className="text-sm text-gray-600">Submit your department's box file for the current batch</p>
            </div>
            <div className="p-6">
              {boxFileDeletedNotice && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Your previously uploaded box file was deleted by PO. Please reupload the file for this batch.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Batch *</label>
                  <input
                    type="text"
                    value={boxFileBatch}
                    onChange={(e) => setBoxFileBatch(e.target.value)}
                    placeholder="YYYY-YYYY (e.g., 2023-2027)"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    disabled={boxFileUploadLoading || boxFileMetadataLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={user?.profile?.department || ""}
                    className="w-full px-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-500"
                    disabled
                  />
                </div>
              </div>

              {!existingBoxFile || boxFileReplaceMode ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select File (PDF/DOCX) *</label>
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      onChange={handleBoxFileUpload}
                      disabled={boxFileUploadLoading || !boxFileBatch}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                    />
                  </div>
                  {boxFileReplaceMode && (
                    <button onClick={() => setBoxFileReplaceMode(false)} className="text-sm text-gray-600 underline">
                      Cancel replacement
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-indigo-50 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg text-indigo-600">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-indigo-900">
                        {existingBoxFile.fileName || existingBoxFile.file_name || "Unknown File"}
                      </p>
                      <p className="text-sm text-indigo-700">
                        Uploaded on {formatDate(existingBoxFile.uploadedAt || existingBoxFile.uploaded_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={existingBoxFile.fileUrl || existingBoxFile.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-white text-indigo-600 border border-indigo-200 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors"
                    >
                      View File
                    </a>
                    <button
                      onClick={handleBatchMetadataUpdate}
                      disabled={boxFileMetadataLoading}
                      className="px-4 py-2 bg-white text-indigo-700 border border-indigo-200 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors disabled:opacity-60"
                    >
                      {boxFileMetadataLoading ? "Updating..." : "Update Batch"}
                    </button>
                    <button
                      onClick={() => setBoxFileReplaceMode(true)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors"
                    >
                      Replace File
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* All Available Drives - Fix the filtering */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">
              All Available Job Drives
            </h2>
          </div>
          <div className="p-6">
            {allDrives.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No job drives available yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {allDrives
                  .filter((drive) => {
                    // Only show upcoming/active drives
                    const isActive = isDriveActive(drive);

                    // Filter by department eligibility
                    const userDepartment = user?.profile?.department;
                    if (!userDepartment) return isActive;

                    // If no department restrictions, it's available to all departments
                    if (
                      !drive.eligibility?.allowedDepartments ||
                      drive.eligibility.allowedDepartments.length === 0
                    ) {
                      return isActive;
                    }
                    // Check if user's department is in allowed departments
                    return (
                      drive.eligibility.allowedDepartments.includes(
                        userDepartment
                      ) && isActive
                    );
                  })
                  .sort((a, b) => new Date(a.date) - new Date(b.date)) // Sort by date (earliest first)
                  .slice(0, 2) // Show only 2 drives
                  .map((drive) => (
                    <div
                      key={drive._id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {drive.companyName}
                          </h3>
                          <p className="text-gray-600">{drive.role}</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-500 mb-4">
                            <div>
                              <span className="font-medium">Location:</span>{" "}
                              {drive.location ||
                                drive.locations?.join(", ") ||
                                "Not specified"}
                            </div>
                            <div>
                              <span className="font-medium">Type:</span>{" "}
                              {drive.type === "full-time"
                                ? "Full Time"
                                : drive.type === "internship"
                                ? "Internship"
                                : drive.jobType === "full-time"
                                ? "Full Time"
                                : drive.jobType === "internship"
                                ? "Internship"
                                : "Full Time"}
                            </div>
                            <div>
                              <span className="font-medium">CTC:</span>
                              {drive.ctc
                                ? `₹${drive.ctc} LPA`
                                : "Not specified"}
                            </div>
                            <div>
                              <span className="font-medium">Date:</span>{" "}
                              {drive.date
                                ? new Date(drive.date).toLocaleDateString()
                                : "Not specified"}
                            </div>
                          </div>
                          <p className="text-sm text-gray-500">
                            Applications: {getAppliedStudentsCount(drive)}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleViewDrive(drive)}
                            className="px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded text-sm font-medium"
                          >
                            View
                          </button>
                          <button
                            onClick={handleManageDrive}
                            className="px-3 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded text-sm font-medium"
                          >
                            Manage Drive
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                {/* Show message if no department-specific upcoming drives */}
                {allDrives.filter((drive) => {
                  const isActive = isDriveActive(drive);
                  const userDepartment = user?.profile?.department;

                  if (!userDepartment) return isActive;

                  if (
                    !drive.eligibility?.allowedDepartments ||
                    drive.eligibility.allowedDepartments.length === 0
                  ) {
                    return isActive;
                  }
                  return (
                    drive.eligibility.allowedDepartments.includes(
                      userDepartment
                    ) && isActive
                  );
                }).length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-gray-500">
                      No upcoming job drives available for your department.
                    </p>
                  </div>
                )}

                <div className="text-center">
                  <div className="flex justify-center space-x-4">
                    <button
                      onClick={() =>
                        navigate("/job-drives", { state: { fromPR: true } })
                      }
                      className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
                    >
                      View My Eligible Drives
                    </button>
                    <button
                      onClick={() =>
                        navigate("/all-job-drives", { state: { fromPR: true } })
                      }
                      className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700"
                    >
                      View All Job Drives
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ✅ ADDED: Templates Modal */}
      {showTemplatesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Placement Templates</h3>
              <button
                onClick={() => setShowTemplatesModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              {templatesLoading ? (
                <div className="text-center py-8">Loading templates...</div>
              ) : templates ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {["spoc", "expenditure", "box"].map((type) => {
                    const template = templates[type];
                    return (
                      <div key={type} className="bg-gray-50 p-5 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                        <div className="flex flex-col h-full">
                          <h5 className="font-bold text-gray-800 uppercase mb-3 border-b pb-2">{type} File</h5>
                          {template ? (
                            <div className="flex-1 flex flex-col">
                              <p className="text-sm font-medium text-gray-900 mb-1 break-words" title={template.file_name}>
                                {template.file_name}
                              </p>
                              <p className="text-xs text-gray-500 mb-4">
                                Updated: {formatDate(template.created_at || template.updated_at)}
                              </p>
                              <div className="mt-auto flex gap-2">
                                <a
                                  href={template.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 bg-blue-600 text-white text-center py-2 px-4 rounded text-sm hover:bg-blue-700 transition-colors"
                                >
                                  View
                                </a>
                                <button
                                  onClick={() => handleDownloadFile(template.download_url, template.file_url)}
                                  className="flex-1 bg-teal-600 text-white text-center py-2 px-4 rounded text-sm hover:bg-teal-700 transition-colors"
                                >
                                  Download
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center justify-center text-gray-400 italic py-4">
                              No file uploaded
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">No templates available at the moment.</p>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-right">
              <button
                onClick={() => setShowTemplatesModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && <DriveModal drive={selectedDrive} onClose={closeModal} />}
    </div>
  );
};

export default PRDashboard;
