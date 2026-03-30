import { API_BASE } from '../config/api';
import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import {
  useJobDriveUpdates,
  useDeletionRequestUpdates,
  useApplicationUpdates,
  useSocketConnection,
  useCGPAUpdates,
} from "../hooks/useSocket";


const PODashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalDrives: 0,
    upcomingDrives: 0,
    totalStudentsPlaced: 0,
  });
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [studentsDetails, setStudentsDetails] = useState([]);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [placementFilter, setPlacementFilter] = useState("all");
  const [availableDepartments, setAvailableDepartments] = useState([]);
  const [allowlistSummary, setAllowlistSummary] = useState({
    pending: 0,
    recentPending: [],
  });

  // Box File Upload Settings
  const [boxFileUploadEnabled, setBoxFileUploadEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Template Modal States
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateFiles, setTemplateFiles] = useState({
    spoc: null,
    expenditure: null,
    box: null,
  });
  const [existingTemplates, setExistingTemplates] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  // Deletion modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showApplicationsModal, setShowApplicationsModal] = useState(false);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [selectedDriveName, setSelectedDriveName] = useState("");
  const [selectedApplicants, setSelectedApplicants] = useState([]);

  // Socket connection and real-time updates
  useSocketConnection(user?.role);

  // Handle real-time job drive updates
  useJobDriveUpdates((data) => {
    const { action } = data;

    // Refetch data to get the latest information
    if (
      action === "created" ||
      action === "updated" ||
      action === "deleted" ||
      action === "application_submitted"
    ) {
      fetchAllDrives();
      fetchStats();
      fetchAllowlistSummary();
    }
  });

  // Handle real-time deletion request updates
  useDeletionRequestUpdates((data) => {
    const { action } = data;

    // Refetch data when deletion is approved
    if (action === "approved") {
      fetchAllDrives();
      fetchStats();
      fetchAllowlistSummary();
    }
  });

  // Handle real-time application updates
  useApplicationUpdates((data) => {
    // Refetch data when application status changes
    fetchAllDrives();
    fetchStats();
  });

  // Handle real-time CGPA updates
  useCGPAUpdates((data) => {
    // Refresh student details if modal is open
    if (showStudentsModal) {
      fetchStudentsDetails();
    }
  });

  // Function to check if drive has ended (for filtering purposes)
  const isDriveEnded = (drive) => {
    if (!drive.date) return false;

    const driveDate = new Date(drive.date);
    const currentDate = new Date();

    // If drive has time, use it for comparison
    if (drive.time) {
      const [hours, minutes] = drive.time.split(":").map(Number);
      driveDate.setHours(hours, minutes, 0, 0);
      return currentDate > driveDate;
    } else {
      // If no time specified, consider drive ended at end of day
      driveDate.setHours(23, 59, 59, 999);
      return currentDate > driveDate;
    }
  };

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchStats();
    fetchAllDrives();
    fetchAllowlistSummary();
    fetchSettings();
  }, [authLoading, user]);

  const fetchAllowlistSummary = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_BASE}/api/auth/allowlist`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const entries = Array.isArray(response.data?.entries)
        ? response.data.entries
        : [];
      const pendingEntries = entries.filter((entry) => entry.status === "pending");

      setAllowlistSummary({
        pending: response.data?.stats?.pending ?? pendingEntries.length,
        recentPending: pendingEntries.slice(0, 5),
      });
    } catch (error) {
      console.error("Error fetching allowlist summary:", error);
    }
  };

  // ✅ ADDED
  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_BASE}/api/box-files/toggle-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBoxFileUploadEnabled(Boolean(response.data?.enabled));
    } catch (error) {
      console.error("Error fetching box file settings:", error);
    }
  };

  // ✅ ADDED
  const handleToggleUpload = async () => {
    setSettingsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const nextEnabled = !boxFileUploadEnabled;
      await axios.post(
        `${API_BASE}/api/box-files/toggle`,
        { enabled: nextEnabled },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBoxFileUploadEnabled(nextEnabled);
      toast.success(`Box file upload ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update box file setting");
    } finally {
      setSettingsLoading(false);
    }
  };

  // ✅ ADDED
  const fetchTemplates = async () => {
    setTemplateLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_BASE}/api/templates/latest`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setExistingTemplates(response.data?.templates || null);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to fetch templates");
    } finally {
      setTemplateLoading(false);
    }
  };

  // ✅ ADDED
  const handleTemplateFileChange = (e, type) => {
    const file = e.target.files?.[0] || null;
    setTemplateFiles((prev) => ({ ...prev, [type]: file }));
  };

  // ✅ ADDED
  const handleUploadTemplates = async (e) => {
    e.preventDefault();
    const { spoc, expenditure, box } = templateFiles;

    if (!spoc && !expenditure && !box) {
      toast.error("Please select at least one file to upload.");
      return;
    }

    const formData = new FormData();
    if (spoc) formData.append("spoc", spoc);
    if (expenditure) formData.append("expenditure", expenditure);
    if (box) formData.append("box", box);

    setTemplateLoading(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API_BASE}/api/templates/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      toast.success("Templates uploaded successfully");
      setTemplateFiles({ spoc: null, expenditure: null, box: null });
      await fetchTemplates();
    } catch (error) {
      console.error("Template upload error:", error);
      toast.error(error.response?.data?.message || "Failed to upload templates");
    } finally {
      setTemplateLoading(false);
    }
  };

  // ✅ ADDED
  const handleDownloadFile = async (fileUrl, fileName) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download file");
    }
  };

  // ✅ ADDED
  const openTemplateModal = () => {
    setShowTemplateModal(true);
    fetchTemplates();
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("token");

      console.log("Fetching stats...");

      // Fetch all drives
      const drivesResponse = await axios.get(
        `${API_BASE}/api/job-drives`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      console.log("Drives response:", drivesResponse.data);

      const drives = drivesResponse.data.jobDrives || [];
      const totalDrives = drives.length;

      console.log("Total drives found:", totalDrives);

      // Calculate upcoming drives using same logic as JobDrives.jsx
      const upcomingDrives = drives.filter((drive) => {
        if (!drive.date) return false;

        const driveDate = new Date(drive.date);
        const currentDate = new Date();

        // If drive has time, use it for comparison
        if (drive.time) {
          const [hours, minutes] = drive.time.split(":").map(Number);
          driveDate.setHours(hours, minutes, 0, 0);
          return currentDate <= driveDate;
        } else {
          // If no time specified, consider drive ended at end of day
          driveDate.setHours(23, 59, 59, 999);
          return currentDate <= driveDate;
        }
      }).length;

      console.log("Upcoming drives:", upcomingDrives);

      // Calculate total students placed - count each placement instance
      // Same logic as in ManageDrives.jsx for counting placed students
      const totalStudentsPlaced = drives.reduce((total, drive) => {
        let driveCount = 0;

        // Only count from selection rounds if drive has ended
        const driveEnded = isDriveEnded(drive);
        if (driveEnded && drive.selectionRounds && drive.selectionRounds.length > 0) {
          const lastRound =
            drive.selectionRounds[drive.selectionRounds.length - 1];
          driveCount = lastRound.selectedStudents?.length || 0;
        } else if (drive.placedStudents && drive.placedStudents.length > 0) {
          // Fallback to manual placed students
          driveCount = drive.placedStudents.length;
        }

        console.log(
          `Drive ${drive.companyName}: ${driveCount} placed students`
        );
        return total + driveCount;
      }, 0);

      console.log("Total students placed:", totalStudentsPlaced);

      setStats({
        totalDrives,
        upcomingDrives,
        totalStudentsPlaced,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchAllDrives = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      const response = await axios.get(`${API_BASE}/api/job-drives`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      // Process drives to ensure all fields are properly set
      const processedDrives = (response.data.jobDrives || []).map((drive) => ({
        ...drive,
        displayLocation:
          drive.location ||
          (drive.locations && drive.locations.length > 0
            ? drive.locations.join(", ")
            : "Not specified"),
        displayType:
          drive.type === "full-time"
            ? "Full Time"
            : drive.type === "internship"
            ? "Internship"
            : "Full Time",
      }));

      setDrives(processedDrives);
    } catch (error) {
      console.error("Error fetching drives:", error);
      toast.error("Failed to fetch drives");
    } finally {
      setLoading(false);
    }
  };

  const handleCSVUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }

    const formData = new FormData();
    formData.append("csvFile", file);

    setUploadLoading(true);
    try {
      const response = await axios.post(
        `${API_BASE}/api/users/upload-cgpa`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      toast.success(
        `Successfully updated CGPA for ${response.data.updatedCount} students`
      );
      event.target.value = "";
    } catch (error) {
      console.error("CSV upload error:", error);
      toast.error(error.response?.data?.message || "Failed to upload CSV");
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDeleteDrive = async (driveId) => {
    // Get drive details for the confirmation
    const drive = drives.find((d) => (d._id || d.id) === driveId);
    const driveName = drive
      ? `${drive.companyName} - ${drive.role}`
      : "this job drive";

    // Set up deletion target and show modal
    setDeleteTarget({
      id: driveId,
      name: driveName,
      drive: drive,
    });
    setShowDeleteModal(true);
  };

  const confirmDeleteDrive = async () => {
    if (!deleteTarget) return;

    try {
      const token = localStorage.getItem("token");
      console.log("Deleting drive:", deleteTarget.id);
      console.log("User role:", user?.role);

      // POs can delete directly using the new deletion request API
      await axios.post(
        `${API_BASE}/api/deletion-requests/request`,
        {
          jobDriveId: deleteTarget.id,
          reason: "Administrative deletion by Placement Officer",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      toast.success("Drive deleted successfully");
      fetchAllDrives();
      fetchStats(); // Refresh stats as well

      // Close modal and reset state
      setShowDeleteModal(false);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Delete error:", error);
      if (error.response?.status === 403) {
        toast.error("Access denied - Only authorized users can delete drives");
      } else if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error("Failed to delete drive");
      }
    }
  };

  const cancelDeleteDrive = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const fetchJobDriveStudents = async (jobDriveId, companyName) => {
    try {
      setApplicationsLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_BASE}/api/job-drives/${jobDriveId}/students`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const applicants = Array.isArray(response.data?.students)
        ? response.data.students
        : [];
      setSelectedApplicants(applicants);
      setSelectedDriveName(companyName);
      setShowApplicationsModal(true);
    } catch (error) {
      console.error("Error fetching job drive students:", error);
      toast.error("Failed to fetch student applications");
    } finally {
      setApplicationsLoading(false);
    }
  };

  const downloadApplicantsCSV = () => {
    if (!selectedApplicants?.length) {
      toast.error("No data to download");
      return;
    }

    const headers = [
      "S.No",
      "Name",
      "Roll Number",
      "Department",
      "Email",
      "CGPA",
      "Mobile",
      "Applied On",
    ];

    const csvContent = [
      headers.join(","),
      ...selectedApplicants.map((student, index) =>
        [
          index + 1,
          `"${student.name || student.profile?.name || "N/A"}"`,
          `"${student.rollNumber || student.profile?.rollNumber || "N/A"}"`,
          `"${student.department || student.profile?.department || "N/A"}"`,
          `"${student.email || "N/A"}"`,
          `"${student.cgpa || student.profile?.cgpa || "N/A"}"`,
          `"${
            student.phoneNumber ||
            student.phone ||
            student.mobileNumber ||
            student.profile?.mobileNumber ||
            student.profile?.phoneNumber ||
            "N/A"
          }"`,
          `"${
            student.appliedAt
              ? new Date(student.appliedAt).toLocaleDateString()
              : "N/A"
          }"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${selectedDriveName || "job_drive"}_applied_students.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Add function to fetch students details
  const fetchStudentsDetails = async () => {
    setStudentsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_BASE}/api/users/students-details`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const students = response.data.students || [];
      setStudentsDetails(students);
      setAvailableDepartments(getUniqueDepartments(students));
      console.log("Students details fetched:", students.length);
    } catch (error) {
      console.error("Error fetching students details:", error);
      toast.error("Failed to fetch students details");
    } finally {
      setStudentsLoading(false);
    }
  };

  // Add function to get unique departments
  const getUniqueDepartments = (students) => {
    const departments = students
      .map((student) => student.department)
      .filter((dept) => dept && dept.trim() !== "")
      .filter((dept, index, arr) => arr.indexOf(dept) === index)
      .sort();
    return departments;
  };

  // Add function to get filtered students
  const getFilteredStudents = () => {
    return studentsDetails.filter((student) => {
      // Department filter
      const departmentMatch =
        departmentFilter === "all" || student.department === departmentFilter;

      // Placement filter
      let placementMatch = true;
      if (placementFilter === "placed") {
        placementMatch = student.placementStatus === "Placed";
      } else if (placementFilter === "unplaced") {
        placementMatch =
          student.placementStatus === "Not Placed" || !student.placementStatus;
      }

      return departmentMatch && placementMatch;
    });
  };

  // Add CSV download function for students details
  const downloadStudentsCSV = () => {
    const filteredStudents = getFilteredStudents();

    if (!filteredStudents?.length) {
      toast.error("No student data to download");
      return;
    }

    const headers = [
      "S.No",
      "Name",
      "Roll Number",
      "Department",
      "Degree",
      "Graduation Year",
      "CGPA",
      "Gender",
      "Date of Birth",
      "Personal Email",
      "College Email",
      "Phone Number",
      "Address",
      "10th Percentage",
      "12th Percentage",
      "Diploma Percentage",
      "LinkedIn URL",
      "GitHub URL",
      "Current Backlogs",
      "Backlog History",
      "About Me",
      "Skills",
      "Placement Status",
      "Consent Status",
      "Profile Complete",
      "Registered Date",
      "Last Updated",
    ];

    const csvContent = [
      headers.join(","),
      ...filteredStudents.map((student, index) =>
        [
          index + 1,
          `"${student.name}"`,
          `"${student.rollNumber}"`,
          `"${student.department}"`,
          `"${student.degree}"`,
          `"${student.graduationYear}"`,
          `"${student.cgpa}"`,
          `"${student.gender}"`,
          `"${
            student.dateOfBirth !== "N/A"
              ? new Date(student.dateOfBirth).toLocaleDateString()
              : "N/A"
          }"`,
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
          `"${
            Array.isArray(student.historyOfBacklogs)
              ? student.historyOfBacklogs
                  .map((b) => `${b.subject}-${b.semester}`)
                  .join("; ")
              : "None"
          }"`,
          `"${student.aboutMe}"`,
          `"${
            Array.isArray(student.skills)
              ? student.skills.join("; ")
              : student.skills
          }"`,
          `"${student.placementStatus}"`,
          `"${
            student.placementConsent?.hasConsented ? "Signed" : "Not Signed"
          }"`,
          `"${student.otpVerified ? "OTP Verified" : "OTP Not Verified"}"`,
          `"${student.profileComplete ? "Complete" : "Incomplete"}"`,
          `"${
            student.registeredAt
              ? new Date(student.registeredAt).toLocaleDateString()
              : "N/A"
          }"`,
          `"${
            student.lastUpdated
              ? new Date(student.lastUpdated).toLocaleDateString()
              : "N/A"
          }"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);

    // Include filter info in filename
    const filterSuffix =
      departmentFilter !== "all" || placementFilter !== "all"
        ? `_${
            departmentFilter !== "all"
              ? departmentFilter.replace(/\s+/g, "_")
              : "AllDepts"
          }_${placementFilter !== "all" ? placementFilter : "AllStatus"}`
        : "";

    link.setAttribute(
      "download",
      `students_details${filterSuffix}_${
        new Date().toISOString().split("T")[0]
      }.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Downloaded ${filteredStudents.length} student records`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img
              src="/gct_logo.png"
              alt="GCT Logo"
              className="w-16 h-16 object-contain"
            />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Placement Officer Dashboard
              </h1>
              <p className="text-gray-600">Welcome back, {user?.name}!</p>
            </div>
          </div>
          <div className="flex space-x-3">
            <Link
              to="/pr-create-job"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create New Drive
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Total Drives
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {stats.totalDrives}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-green-100 text-green-600">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Upcoming Drives
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {stats.upcomingDrives}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-purple-100 text-purple-600">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Total Placed
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {stats.totalStudentsPlaced}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-orange-100 text-orange-600">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Pending PR/PO Requests
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {allowlistSummary.pending}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ ADDED: Box File Management */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Box File Management</h2>
              <p className="text-sm text-gray-600">Control PR box file uploads and view the board</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Enable Box File Upload:</span>
                <button
                  onClick={handleToggleUpload}
                  disabled={settingsLoading}
                  className={`${boxFileUploadEnabled ? "bg-green-600" : "bg-gray-400"} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-60`}
                >
                  <span
                    className={`${boxFileUploadEnabled ? "translate-x-5" : "translate-x-0"} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                  />
                </button>
              </div>
              <button
                onClick={() => navigate("/box-file-board")}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Box File Board
              </button>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div
            onClick={openTemplateModal}
            className="bg-teal-600 text-white p-6 rounded-lg hover:bg-teal-700 transition-colors cursor-pointer"
          >
            <h3 className="text-lg font-semibold mb-2">Upload Templates</h3>
            <p className="text-teal-100">Manage and upload placement templates</p>
          </div>

          <Link
            to="/pr-create-job"
            className="bg-blue-600 text-white p-6 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <h3 className="text-lg font-semibold mb-2">Create New Drive</h3>
            <p className="text-blue-100">Add a new job drive for companies</p>
          </Link>
          <Link
            to="/po-manage-registrations"
            className="bg-orange-600 text-white p-6 rounded-lg hover:bg-orange-700 transition-colors"
          >
            <h3 className="text-lg font-semibold mb-2">PR/PO Requests</h3>
            <p className="text-orange-100">Approve PR/PO registration requests</p>
          </Link>
          <Link
            to="/manage-drives"
            className="bg-green-600 text-white p-6 rounded-lg hover:bg-green-700 transition-colors"
          >
            <h3 className="text-lg font-semibold mb-2">Manage Drives</h3>
            <p className="text-green-100">View and manage all job drives</p>
          </Link>
          <Link
            to="/job-drives"
            className="bg-purple-600 text-white p-6 rounded-lg hover:bg-purple-700 transition-colors"
          >
            <h3 className="text-lg font-semibold mb-2">View All Drives</h3>
            <p className="text-purple-100">Browse all available job drives</p>
          </Link>
          <div className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">
                  Placement Analytics
                </h3>
                <p className="text-gray-600">View batch-wise analytics</p>
              </div>
              <div className="text-purple-500">
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
            </div>
            <button
              onClick={() => navigate("/placement-analytics")}
              className="mt-4 text-purple-600 hover:text-purple-800 font-medium"
            >
              View Analytics →
            </button>
          </div>

          <div className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">All Drive Files</h3>
            <p className="text-gray-600">View SPOC & Expenditure files for all drives</p>
            <button
              onClick={() => navigate("/job-drive-files")}
              className="mt-4 text-blue-600 hover:text-blue-800 font-medium"
            >
              View All Files →
            </button>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Recent PR/PO Requests</h2>
              <p className="text-sm text-gray-600">New registration requests from PR/PO users</p>
            </div>
            <Link
              to="/po-manage-registrations"
              className="text-orange-600 hover:text-orange-700 font-medium"
            >
              Manage all requests
            </Link>
          </div>
          <div className="p-6">
            {allowlistSummary.recentPending.length === 0 ? (
              <p className="text-gray-500">No pending registration requests.</p>
            ) : (
              <div className="space-y-3">
                {allowlistSummary.recentPending.map((entry) => (
                  <div
                    key={entry.id || entry._id || entry.email}
                    className="border border-orange-100 rounded-lg px-4 py-3 bg-orange-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{entry.email}</p>
                        <p className="text-sm text-gray-600">
                          {entry.role === "placement_representative" ? "PR" : "PO"}
                          {entry.department ? ` - ${entry.department}` : ""}
                        </p>
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-orange-700 bg-orange-200 px-2 py-1 rounded">
                        Pending
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CGPA Upload Section */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Upload Student & PR CGPA
            </h2>
            <p className="text-sm text-gray-600">
              Upload CSV file with roll numbers and CGPA for students and
              placement representatives
            </p>
          </div>
          <div className="p-6">
            <div className="flex items-center space-x-4">
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                disabled={uploadLoading}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {uploadLoading && (
                <span className="text-blue-600">Uploading...</span>
              )}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              <p>CSV should contain columns: ROLL NO, CGPA</p>
              <p>
                This will update CGPA for both students and placement
                representatives
              </p>
            </div>
          </div>
        </div>

        {/* Job Drives Section */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Job Drives</h2>
          </div>

          <div className="p-6">
            {drives.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No drives created yet
              </p>
            ) : (
              <div className="space-y-4">
                {drives.map((drive) => (
                  <div
                    key={drive._id || drive.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {drive.companyName}
                        </h3>
                        <p className="text-gray-600">{drive.role}</p>
                        <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                          <span>
                            📍{" "}
                            {drive.displayLocation ||
                              drive.location ||
                              (drive.locations && drive.locations.length > 0
                                ? drive.locations.join(", ")
                                : "Not specified")}
                          </span>
                          <span>
                            💼{" "}
                            {drive.displayType ||
                              drive.type ||
                              drive.jobType ||
                              "Not specified"}
                          </span>
                          <span>
                            💰{" "}
                            {drive.ctc ? `${drive.ctc} LPA` : "Not specified"}
                          </span>
                          <span>
                            📅 {new Date(drive.date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4 flex space-x-2">
                        <button
                          onClick={() =>
                            fetchJobDriveStudents(
                              drive._id || drive.id,
                              drive.companyName
                            )
                          }
                          className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200"
                        >
                          View Applications
                        </button>
                        <button
                          onClick={() => handleDeleteDrive(drive._id || drive.id)}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drive Applications Modal */}
        {showApplicationsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-5xl w-full max-h-[85vh] overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Students Applied - {selectedDriveName}
                </h2>
                <button
                  onClick={() => {
                    setShowApplicationsModal(false);
                    setSelectedApplicants([]);
                    setSelectedDriveName("");
                  }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh]">
                {applicationsLoading ? (
                  <div className="text-center py-8 text-gray-500">
                    Loading applicants...
                  </div>
                ) : selectedApplicants.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No students have applied for this drive yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">S.No</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Roll Number</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">CGPA</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applied On</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {selectedApplicants.map((student, index) => (
                          <tr key={student._id || index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 text-sm font-medium">{student.name || student.profile?.name || "N/A"}</td>
                            <td className="px-4 py-3 text-sm">{student.rollNumber || student.profile?.rollNumber || "N/A"}</td>
                            <td className="px-4 py-3 text-sm">{student.department || student.profile?.department || "N/A"}</td>
                            <td className="px-4 py-3 text-sm">{student.email || "N/A"}</td>
                            <td className="px-4 py-3 text-sm">{student.cgpa || student.profile?.cgpa || "N/A"}</td>
                            <td className="px-4 py-3 text-sm">
                              {student.phoneNumber ||
                                student.phone ||
                                student.mobileNumber ||
                                student.profile?.mobileNumber ||
                                student.profile?.phoneNumber ||
                                "N/A"}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {student.appliedAt
                                ? new Date(student.appliedAt).toLocaleDateString()
                                : "N/A"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
                <button
                  onClick={downloadApplicantsCSV}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                >
                  Download CSV
                </button>
                <button
                  onClick={() => {
                    setShowApplicationsModal(false);
                    setSelectedApplicants([]);
                    setSelectedDriveName("");
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Students Details Modal */}
        {showStudentsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-hidden">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Students Details</h3>
                <button
                  onClick={() => setShowStudentsModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              {/* Filters Section */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">
                      Department:
                    </label>
                    <select
                      value={departmentFilter}
                      onChange={(e) => setDepartmentFilter(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Departments</option>
                      {availableDepartments.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">
                      Placement Status:
                    </label>
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
                      Showing {getFilteredStudents().length} of{" "}
                      {studentsDetails.length} students
                    </span>
                    <button
                      onClick={() => {
                        setDepartmentFilter("all");
                        setPlacementFilter("all");
                      }}
                      className="px-3 py-1 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded text-sm"
                    >
                      Clear Filters
                    </button>
                  </div>
                </div>
              </div>

              {studentsLoading ? (
                <div className="text-center py-8">
                  <p>Loading students...</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[60vh]">
                  <div className="mb-4 flex justify-between items-center">
                    <h4 className="font-semibold">
                      Students List ({getFilteredStudents().length} students)
                    </h4>
                    <button
                      onClick={downloadStudentsCSV}
                      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                    >
                      Download CSV
                    </button>
                  </div>

                  {getFilteredStudents().length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500">
                        {studentsDetails.length === 0
                          ? "No students found"
                          : "No students match the selected filters"}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white border border-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              S.No
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Name
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Roll Number
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Department
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              CGPA
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Placement Status
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Profile Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {getFilteredStudents().map((student, index) => (
                            <tr key={student._id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                {index + 1}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                                {student.name}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                {student.rollNumber}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                {student.department}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                {student.cgpa}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <span
                                  className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                    student.placementStatus === "Placed"
                                      ? "bg-green-100 text-green-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {student.placementStatus || "Not Placed"}
                                </span>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <span
                                  className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                    student.profileComplete
                                      ? "bg-green-100 text-green-800"
                                      : "bg-yellow-100 text-yellow-800"
                                  }`}
                                >
                                  {student.profileComplete
                                    ? "Complete"
                                    : "Incomplete"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ✅ ADDED: Template Management Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Manage Placement Templates</h3>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={handleUploadTemplates} className="mb-8 bg-gray-50 p-6 rounded-lg border border-gray-200">
                <h4 className="text-lg font-semibold mb-4 text-gray-800">Update Templates</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">SPOC File</label>
                    <input
                      type="file"
                      onChange={(e) => handleTemplateFileChange(e, "spoc")}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Expenditure File</label>
                    <input
                      type="file"
                      onChange={(e) => handleTemplateFileChange(e, "expenditure")}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Box File</label>
                    <input
                      type="file"
                      onChange={(e) => handleTemplateFileChange(e, "box")}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={templateLoading}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {templateLoading ? "Uploading..." : "Upload Files"}
                  </button>
                </div>
              </form>

              <h4 className="text-lg font-semibold mb-4 text-gray-800">Current Templates</h4>
              {templateLoading && !existingTemplates ? (
                <div className="text-center py-8">Loading...</div>
              ) : existingTemplates ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {["spoc", "expenditure", "box"].map((type) => {
                    const template = existingTemplates[type];
                    return (
                      <div key={type} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <h5 className="font-bold text-gray-700 uppercase mb-2">{type}</h5>
                        {template ? (
                          <div className="space-y-2">
                            <p className="text-sm font-medium truncate" title={template.file_name}>
                              {template.file_name}
                            </p>
                            <p className="text-xs text-gray-500">
                              Updated: {template.created_at ? new Date(template.created_at).toLocaleDateString() : "N/A"}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-3">
                              <a
                                href={template.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 border border-blue-200"
                              >
                                View
                              </a>
                              <button
                                onClick={() => handleDownloadFile(template.file_url, template.file_name)}
                                className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100 border border-green-200"
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No file uploaded</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-gray-500">No templates available.</p>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-right">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
                  Delete Job Drive
                </h3>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to delete {deleteTarget.name}? This action
                will be performed immediately.
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDeleteDrive}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteDrive}
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

export default PODashboard;