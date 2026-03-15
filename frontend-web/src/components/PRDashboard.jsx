import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import CarouselBanner from "./CarouselBanner";

const PRDashboard = () => {
  const API_BASE = process.env.REACT_APP_API_BASE;
  const { user } = useAuth();
  const navigate = useNavigate();
  const [allDrives, setAllDrives] = useState([]);
  const [eligibleDrives, setEligibleDrives] = useState([]);
  const [departmentApplications, setDepartmentApplications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [showModal, setShowModal] = useState(false);

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
              onClick={() => navigate("/edit-profile")}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              Edit Profile
            </button>
          </div>
        </div>

        {/* Stats Cards - Fix the calculations */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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
        </div>

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

      {/* Modal */}
      {showModal && <DriveModal drive={selectedDrive} onClose={closeModal} />}
    </div>
  );
};

export default PRDashboard;