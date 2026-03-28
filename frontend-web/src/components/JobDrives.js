import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import {
  useJobDriveUpdates,
  useDeletionRequestUpdates,
  useApplicationUpdates,
  useSocketConnection,
  useModalUpdates,
} from "../hooks/useSocket";

const JobDrives = () => {
  const API_BASE = process.env.REACT_APP_API_BASE;
  const { user } = useAuth();
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

  // Debug student data immediately
  console.log("=== JOBDRIVES COMPONENT LOADED ===");
  console.log("User role:", user?.role);
  console.log("User profile:", user?.profile);

  if (user?.role === "student" && user?.profile) {
    console.log("=== STUDENT PROFILE DETAILS ===");
    console.log("CGPA:", user.profile.cgpa, typeof user.profile.cgpa);
    console.log("Department:", user.profile.department);
    console.log("Batch:", user.profile.batch);
    console.log("Current Backlogs:", user.profile.currentBacklogs);
    console.log("Backlogs:", user.profile.backlogs);
    console.log("Is Placed:", user.profile.isPlaced);
    console.log("Placement Status:", user.profile.placementStatus);
  }

  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [showPlacedStudentsViewModal, setShowPlacedStudentsViewModal] =
    useState(false);
  const [selectedDriveForView, setSelectedDriveForView] = useState(null);
  const [showRoundStudentsModal, setShowRoundStudentsModal] = useState(false);
  const [selectedRound, setSelectedRound] = useState(null);
  const [selectedRoundIndex, setSelectedRoundIndex] = useState(null);
  const [selectedJobForRoundView, setSelectedJobForRoundView] = useState(null);
  // Deletion modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  // Eligibility modal states
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [selectedDriveForEligibility, setSelectedDriveForEligibility] = useState(null);
  const [driveFilesAvailability, setDriveFilesAvailability] = useState({});
  const [showDriveFilesModal, setShowDriveFilesModal] = useState(false);
  const [selectedDriveForFiles, setSelectedDriveForFiles] = useState(null);
  const [selectedDriveFiles, setSelectedDriveFiles] = useState([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const fromPR = location?.state?.fromPR || false;

  // Socket connection and real-time updates
  useSocketConnection(user?.role);

  // Handle real-time job drive updates
  useJobDriveUpdates((data) => {
    const { action } = data;

    // Refetch job drives to get the latest data for all actions including applications
    if (
      action === "created" ||
      action === "updated" ||
      action === "deleted" ||
      action === "application_submitted"
    ) {
      fetchJobDrives();
    }
  });

  // Handle real-time deletion request updates
  useDeletionRequestUpdates((data) => {
    const { action } = data;

    // Refetch job drives when deletion is approved
    if (action === "approved") {
      fetchJobDrives();
    }
  });

  // Handle real-time application updates
  useApplicationUpdates((data) => {
    // Refetch drives when application status changes
    fetchJobDrives();
  });

  // Function to get detailed eligibility reasons
  const getEligibilityReasons = (drive) => {
    if (!user?.profile) {
      return ['Profile information is incomplete'];
    }

    const reasons = [];
    const userCGPA = parseFloat(user.profile.cgpa) || 0;
    const userBacklogs = parseInt(user.profile.currentBacklogs || user.profile.backlogs) || 0;
    const userDepartment = user.profile.department;
    
    // Map graduation year to batch if batch is undefined
    let userBatch = user.profile.batch;
    if (!userBatch && user.profile.graduationYear) {
      userBatch = user.profile.graduationYear.toString();
    }
    
    const isUserPlaced = user.profile.isPlaced || user.profile.placementStatus === 'placed';
    const driveCTC = parseFloat(drive.ctc) || 0;

    // Check CGPA requirement
    if (drive.eligibility?.minCGPA && drive.eligibility.minCGPA > userCGPA) {
      reasons.push(`CGPA requirement not met: Required ${drive.eligibility.minCGPA}, You have ${userCGPA}`);
    }

    // Check backlogs requirement
    if (drive.eligibility?.maxBacklogs !== undefined && drive.eligibility.maxBacklogs < userBacklogs) {
      reasons.push(`Backlogs exceed limit: Maximum allowed ${drive.eligibility.maxBacklogs}, You have ${userBacklogs}`);
    }

    // Check department requirement
    if (drive.eligibility?.allowedDepartments && drive.eligibility.allowedDepartments.length > 0) {
      if (!drive.eligibility.allowedDepartments.includes(userDepartment)) {
        reasons.push(`Department not eligible: This drive is only for ${drive.eligibility.allowedDepartments.join(', ')}`);
      }
    }

    // Check batch requirement
    if (drive.eligibility?.allowedBatches && drive.eligibility.allowedBatches.length > 0) {
      if (!userBatch || !drive.eligibility.allowedBatches.includes(userBatch)) {
        reasons.push(`Batch not eligible: This drive is only for batches ${drive.eligibility.allowedBatches.join(', ')}`);
      }
    }

    // Check placement status for placed students
    if (isUserPlaced && driveCTC <= 10) {
      reasons.push(`CTC too low for placed students: This drive offers ${driveCTC} LPA (minimum 10+ LPA required for placed students)`);
    }

    // Check unplaced only requirement
    if (drive.unplacedOnly && isUserPlaced) {
      reasons.push('This drive is only for unplaced students');
    }

    return reasons.length > 0 ? reasons : ['You are eligible for this drive'];
  };

  // Function to show eligibility modal
  const showEligibilityReasons = (drive) => {
    setSelectedDriveForEligibility(drive);
    setShowEligibilityModal(true);
  };

  // Function to close eligibility modal
  const closeEligibilityModal = () => {
    setShowEligibilityModal(false);
    setSelectedDriveForEligibility(null);
  };

  // Define isApplicationDeadlinePassed function inside the component
  const isApplicationDeadlinePassed = (drive) => {
    const checkDate = drive.deadline || drive.date;
    if (!checkDate) return false;
    const deadlineDateTime = new Date(checkDate);
    if (drive.applicationDeadlineTime) { // Use applicationDeadlineTime if available
      try {
        const [hours, minutes] = drive.applicationDeadlineTime.split(":");
        deadlineDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      } catch (timeError) {
        console.error("Error parsing time:", drive.time, timeError);
      }
    } else {
        deadlineDateTime.setHours(23, 59, 59, 999);
    }
    const currentDateTime = new Date();

    console.log("=== FRONTEND DEADLINE CHECK ===");
    console.log("Drive:", drive.companyName);
    console.log("Raw checkDate:", checkDate);
    console.log("Parsed deadlineDate:", deadlineDateTime.toISOString());
    console.log("Current date:", currentDateTime.toISOString());
    console.log("Drive time:", drive.time);
    console.log("Has deadline:", !!drive.deadline);
    console.log("Deadline passed:", currentDateTime > deadlineDateTime);

    return currentDateTime > deadlineDateTime;
  };

  useEffect(() => {
    if (user?.role === "student") {
      if (!user.profile?.isProfileComplete) {
        navigate("/complete-profile");
        return;
      }
      if (!user.placementPolicyConsent?.hasAgreed) {
        navigate("/placement-consent");
        return;
      }
      if (!user.verificationStatus?.otpVerified) {
        navigate("/otp-verification");
        return;
      }
    }

    console.log("JobDrives component mounted");
    console.log("Current user:", user);
    console.log("User profile:", user?.profile);
    console.log("User role:", user?.role);

    // Debug student profile data
    if (user?.role === "student" && user?.profile) {
      console.log("=== STUDENT PROFILE DEBUG ===");
      console.log("CGPA:", user.profile.cgpa);
      console.log("Department:", user.profile.department);
      console.log("Batch:", user.profile.batch);
      console.log("Current Backlogs:", user.profile.currentBacklogs);
      console.log("Backlogs:", user.profile.backlogs);
      console.log("Is Placed:", user.profile.isPlaced);
      console.log("Placement Status:", user.profile.placementStatus);
      console.log("=== END STUDENT PROFILE ===");
    }

    if (user) {
      fetchJobDrives();
    }
  }, [user, navigate]);

  // Add this useEffect to debug the data
  useEffect(() => {
    if (drives.length > 0 && user) {
      console.log("=== DEBUG DATA ===");
      console.log("User object:", user);
      console.log("User ID:", user.id);
      console.log("User _id:", user._id);
      console.log("First drive applications:", drives[0]?.applications);
      drives.forEach((drive, index) => {
        console.log(
          `Drive ${index} (${drive.companyName}) applications:`,
          drive.applications
        );
      });
      console.log("=== END DEBUG ===");
    }
  }, [drives, user]);

  // Add this useEffect to debug the applications data
  useEffect(() => {
    if (drives.length > 0 && user) {
      console.log("=== CHECKING APPLICATIONS ===");
      drives.forEach((drive) => {
        console.log(`Drive: ${drive.companyName}`);
        console.log("Applications:", drive.applications);
        console.log("User ID:", user?.id || user?._id);
        console.log("Has Applied:", hasApplied(drive));
        console.log("---");
      });
    }
  }, [drives, user]);

  const fetchJobDrives = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      if (!token) {
        toast.error("Please login first");
        return;
      }

      console.log("=== JOB DRIVES FETCH ===");
      console.log("User role:", user?.role);

      // Use the same endpoint that shows all drives for the department
      const endpoint = `${API_BASE}/api/job-drives/all`;

      const response = await axios.get(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("Raw API response:", response.data);

      let fetchedDrives = response.data.jobDrives || response.data.drives || [];

      console.log("Fetched drives before filtering:", fetchedDrives.length);

      // For students, filter by department but show all drives (like dashboard)
      if (user?.role === "student" && user?.profile?.department) {
        const userDepartment = user.profile.department;

        fetchedDrives = fetchedDrives.filter((drive) => {
          // If no department restrictions, show to all departments
          if (
            !drive.eligibility?.allowedDepartments ||
            drive.eligibility.allowedDepartments.length === 0
          ) {
            return true;
          }
          // Check if user's department is in allowed departments
          return drive.eligibility.allowedDepartments.includes(userDepartment);
        });
      } else if (
        (user?.role === "placement_representative" || user?.role === "pr") &&
        user?.profile?.department
      ) {
        // For PRs, filter by department
        const userDepartment = user.profile.department;

        fetchedDrives = fetchedDrives.filter((drive) => {
          if (
            !drive.eligibility?.allowedDepartments ||
            drive.eligibility.allowedDepartments.length === 0
          ) {
            return true;
          }
          return drive.eligibility.allowedDepartments.includes(userDepartment);
        });
      }

      console.log(
        "Fetched drives after department filtering:",
        fetchedDrives.length
      );
      setDrives(fetchedDrives);

      const poRole = user?.role === "po" || user?.role === "placement_officer";
      if (poRole) {
        await fetchDriveFilesAvailability(fetchedDrives, token);
      } else {
        setDriveFilesAvailability({});
      }
    } catch (error) {
      console.error("Fetch drives error:", error);
      if (error.response?.status === 401) {
        toast.error("Session expired. Please login again.");
        localStorage.removeItem("token");
        window.location.href = "/login";
      } else {
        toast.error("Failed to fetch job drives");
      }
      setDrives([]);
      setDriveFilesAvailability({});
    } finally {
      setLoading(false);
    }
  };

  const fetchDriveFilesAvailability = async (drivesList, token) => {
    if (!Array.isArray(drivesList) || drivesList.length === 0) {
      setDriveFilesAvailability({});
      return;
    }

    try {
      const checks = await Promise.all(
        drivesList.map(async (drive) => {
          const driveId = drive?._id;
          if (!driveId) return [driveId, false];

          try {
            const response = await axios.get(`${API_BASE}/api/drive-files/${driveId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const files = Array.isArray(response.data?.files) ? response.data.files : [];
            return [driveId, files.length > 0];
          } catch (error) {
            return [driveId, false];
          }
        })
      );

      const availabilityMap = {};
      checks.forEach(([driveId, hasFiles]) => {
        if (driveId) {
          availabilityMap[driveId] = Boolean(hasFiles);
        }
      });
      setDriveFilesAvailability(availabilityMap);
    } catch (error) {
      console.error("Error preparing drive file availability:", error);
      setDriveFilesAvailability({});
    }
  };

  const openDriveFilesModal = async (drive) => {
    if (!drive?._id) return;

    try {
      setSelectedDriveForFiles(drive);
      setShowDriveFilesModal(true);
      setDriveFilesLoading(true);

      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_BASE}/api/drive-files/${drive._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSelectedDriveFiles(Array.isArray(response.data?.files) ? response.data.files : []);
    } catch (error) {
      console.error("Error loading drive files:", error);
      setSelectedDriveFiles([]);
      toast.error("Failed to load drive files");
    } finally {
      setDriveFilesLoading(false);
    }
  };

  const closeDriveFilesModal = () => {
    setShowDriveFilesModal(false);
    setSelectedDriveForFiles(null);
    setSelectedDriveFiles([]);
  };

  const handleDriveFileDownload = async (fileUrl, fileName) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName || "drive-file");
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Drive file download error:", error);
      toast.error("Failed to download file");
    }
  };

  const handleApply = async (driveId) => {
    try {
      // Find the drive to check deadline locally first
      const drive = drives.find(d => d._id === driveId);
      if (drive && isApplicationDeadlinePassed(drive)) {
        toast.error("Application Deadline has passed.");
        return;
      }

      const token = localStorage.getItem("token");

      console.log("Applying to drive:", driveId);
      console.log("User:", user);

      const response = await axios.post(
        `${API_BASE}/api/job-drives/${driveId}/apply`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      toast.success("Application submitted successfully!");

      // Update local state immediately
      setDrives((prevDrives) => {
        return prevDrives.map((drive) => {
          if (drive._id === driveId) {
            const userId = user?.id || user?._id;
            const newApplication = {
              student: userId,
              appliedAt: new Date(),
              status: "applied",
            };

            console.log("Adding application:", newApplication);

            return {
              ...drive,
              applications: [...(drive.applications || []), newApplication],
            };
          }
          return drive;
        });
      });
    } catch (error) {
      console.error("Apply error:", error);
      if (error.response?.status === 400) {
        toast.error(
          error.response?.data?.message || "Already applied to this drive"
        );
      } else if (error.response?.status === 403) {
        toast.error("You are not eligible for this drive");
      } else {
        toast.error("Failed to apply. Please try again.");
      }
    }
  };

  // Add this test function after handleApply
  const testHasApplied = (drive) => {
    console.log("=== TEST HAS APPLIED ===");
    console.log("Drive:", drive.companyName);
    console.log("Drive applications:", drive.applications);
    console.log("User ID:", user?.id);
    console.log("User _id:", user?._id);

    if (!drive.applications) {
      console.log("No applications array");
      return false;
    }

    const result = drive.applications.some((app) => {
      console.log("Checking application:", app);
      console.log("App student:", app.student);
      console.log("User ID match:", app.student === user?.id);
      console.log("User _id match:", app.student === user?._id);
      return app.student === user?.id || app.student === user?._id;
    });

    console.log("Final result:", result);
    return result;
  };

  // Add this function to filter drives based on date and eligibility
  const getFilteredDrives = () => {
    console.log("=== FILTERING DRIVES ===");
    console.log("Total drives:", drives.length);
    console.log("Current filter:", filter);
    console.log("User role:", user?.role);

    const isPOUser = user?.role === "po" || user?.role === "placement_officer";

    let filtered = drives.filter((drive) => {
      if (isPOUser && selectedDepartment) {
        const normalizedSelectedDepartment = selectedDepartment.toLowerCase().trim();
        const allowedDepartments = Array.isArray(drive?.eligibility?.allowedDepartments)
          ? drive.eligibility.allowedDepartments
              .map((department) => String(department).toLowerCase().trim())
              .filter(Boolean)
          : [];

        const spocDepartment = String(drive?.spocDept || "")
          .toLowerCase()
          .trim();

        const departmentMatches =
          (allowedDepartments.length === 0 && !spocDepartment) ||
          allowedDepartments.includes(normalizedSelectedDepartment) ||
          spocDepartment === normalizedSelectedDepartment;

        if (!departmentMatches) {
          return false;
        }
      }

      const driveEnded = isDriveEnded(drive);
      console.log(
        `Drive ${drive.companyName}: ended=${driveEnded}, date=${drive.date}, time=${drive.time}`
      );

      if (filter === "upcoming") {
        return !driveEnded; // Not ended yet
      } else if (filter === "past") {
        return driveEnded; // Drive has ended
      }
      return true; // 'all' filter
    });

    console.log("After date filter:", filtered.length);
    console.log("Final filtered count:", filtered.length);
    return filtered;
  };

  const isPOUser = user?.role === "po" || user?.role === "placement_officer";

  const drivesForSelectedDepartment = isPOUser && selectedDepartment
    ? drives.filter((drive) => {
        const normalizedSelectedDepartment = selectedDepartment.toLowerCase().trim();
        const allowedDepartments = Array.isArray(drive?.eligibility?.allowedDepartments)
          ? drive.eligibility.allowedDepartments
              .map((department) => String(department).toLowerCase().trim())
              .filter(Boolean)
          : [];

        const spocDepartment = String(drive?.spocDept || "")
          .toLowerCase()
          .trim();

        return (
          (allowedDepartments.length === 0 && !spocDepartment) ||
          allowedDepartments.includes(normalizedSelectedDepartment) ||
          spocDepartment === normalizedSelectedDepartment
        );
      })
    : drives;

  const hasApplied = (drive) => {
    if (!drive.applications || !user) return false;

    const userId = user.id || user._id;
    return drive.applications.some((app) => {
      const appStudentId = app.student?._id || app.student?.id || app.student;
      return appStudentId === userId;
    });
  };

  // Add this test function
  const testAllEndpoints = async () => {
    const token = localStorage.getItem("token");
    console.log("=== TESTING ALL ENDPOINTS ===");

    const endpoints = [
      `${API_BASE}/api/job-drives/test-all`,
      `${API_BASE}/api/job-drives/debug/all`,
      `${API_BASE}/api/job-drives`,
      `${API_BASE}/api/job-drives/all`,
      `${API_BASE}/api/job-drives/student-drives`,
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`Testing: ${endpoint}`);
        const response = await axios.get(endpoint, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        console.log(`✅ ${endpoint}:`, response.data);
      } catch (error) {
        console.log(`❌ ${endpoint}:`, error.response?.data || error.message);
      }
    }
  };

  // Check if user is eligible for a specific drive
  const isEligibleForDrive = (drive) => {
    if (!user?.profile) {
      return false;
    }

    const userCGPA = parseFloat(user.profile.cgpa) || 0;
    const userBacklogs =
      parseInt(user.profile.currentBacklogs || user.profile.backlogs) || 0;
    const userDepartment = user.profile.department;
    const userBatch = user.profile.batch;
    const isUserPlaced =
      user.profile.isPlaced || user.profile.placementStatus === "placed";

    // Check CGPA requirement
    if (drive.eligibility?.minCGPA && drive.eligibility.minCGPA > userCGPA) {
      return false;
    }

    // Check department requirement
    if (
      drive.eligibility?.allowedDepartments &&
      drive.eligibility.allowedDepartments.length > 0 &&
      !drive.eligibility.allowedDepartments.includes(userDepartment)
    ) {
      return false;
    }

    // Check backlog requirement
    if (
      drive.eligibility?.maxBacklogs !== undefined &&
      drive.eligibility.maxBacklogs < userBacklogs
    ) {
      return false;
    }

    // Check batch eligibility
    if (
      drive.eligibility?.allowedBatches &&
      drive.eligibility.allowedBatches.length > 0 &&
      !drive.eligibility.allowedBatches.includes(userBatch)
    ) {
      return false;
    }

    // Check placement status eligibility
    const driveCTC = parseFloat(drive.ctc) || 0;

    // If user is placed, only show drives with CTC > 10 LPA
    if (isUserPlaced && driveCTC <= 10) {
      return false;
    }

    // If drive is for unplaced only, check placement status
    if (drive.unplacedOnly && isUserPlaced) {
      return false;
    }

    return true;
  };

  // Check if drive has ended (improved logic)
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

  const handleViewPlacedStudents = async (drive) => {
    try {
      const driveEnded = isDriveEnded(drive);
      
      // Only try to get students from selection rounds if drive has ended
      if (driveEnded && drive.selectionRounds && drive.selectionRounds.length > 0) {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `${API_BASE}/api/job-drives/${drive._id}/last-round-students`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.students && data.students.length > 0) {
            // Create a drive object with the selection round students for modal display
            const driveWithRoundStudents = {
              ...drive,
              placedStudents: data.students, // Use students from final round
            };
            setSelectedDriveForView(driveWithRoundStudents);
            setShowPlacedStudentsViewModal(true);
            return;
          }
        }
      }

      // Always allow viewing manual placed students (regardless of drive end date)
      if (drive.placedStudents && drive.placedStudents.length > 0) {
        setSelectedDriveForView(drive);
        setShowPlacedStudentsViewModal(true);
        return;
      }

      // If no placed students found from either source
      toast.error("No placed students found for this drive");
    } catch (error) {
      console.error("Error fetching placed students:", error);
      // Fallback to showing manual placed students if API call fails
      if (drive.placedStudents && drive.placedStudents.length > 0) {
        setSelectedDriveForView(drive);
        setShowPlacedStudentsViewModal(true);
      } else {
        toast.error("Failed to fetch placed students");
      }
    }
  };

  const filteredDrives = getFilteredDrives();

  const handleViewDrive = (drive) => {
    console.log("Selected drive for view:", drive); // Debug log
    setSelectedDrive(drive);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedDrive(null);
  };

  const handleEditDrive = (driveId) => {
    if (user?.role === "placement_representative") {
      navigate(`/pr/edit-job/${driveId}?returnTo=/job-drives`);
    } else if (user?.role === "po" || user?.role === "placement_officer") {
      navigate(`/edit-job-drive/${driveId}?returnTo=/job-drives`);
    }
  };

  const handleDeleteDrive = async (driveId) => {
    // Get drive details for the confirmation
    const drive = drives.find((d) => d._id === driveId);
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

    // For PRs, validate reason
    if (
      (user?.role === "placement_representative" || user?.role === "pr") &&
      (!deleteReason || deleteReason.trim() === "")
    ) {
      toast.error("Reason is required for deletion request");
      return;
    }

    try {
      const token = localStorage.getItem("token");

      // Use the new deletion request API
      await axios.post(
        `${API_BASE}/api/deletion-requests/request`,
        {
          jobDriveId: deleteTarget.id,
          reason: deleteReason || "Administrative deletion",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (user?.role === "po" || user?.role === "placement_officer") {
        toast.success("Job drive deleted successfully");
        fetchJobDrives(); // Refresh the list
      } else {
        toast.success(
          "Deletion request submitted successfully. Awaiting PO approval."
        );
        // Don't refresh list as drive is pending approval
      }

      // Close modal and reset state
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setDeleteReason("");
    } catch (error) {
      console.error("Delete error:", error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error("Failed to process deletion request");
      }
    }
  };

  const cancelDeleteDrive = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
    setDeleteReason("");
  };

  const handleViewRoundStudents = (drive, round, roundIndex) => {
    setSelectedJobForRoundView(drive);
    setSelectedRound(round);
    setSelectedRoundIndex(roundIndex);
    setShowRoundStudentsModal(true);
  };

  const closeRoundStudentsModal = () => {
    setShowRoundStudentsModal(false);
    setSelectedRound(null);
    setSelectedRoundIndex(null);
    setSelectedJobForRoundView(null);
  };

  // Update the canManageDrive function to be more explicit with department checking
  const canManageDrive = (drive) => {
    // Students and POs cannot manage any drives
    if (
      user?.role === "student" ||
      user?.role === "po" ||
      user?.role === "placement_officer"
    ) {
      return false;
    }

    if (user?.role === "placement_representative" || user?.role === "pr") {
      // Check if user created the drive
      if (drive.createdBy?._id === user.id) {
        console.log("✅ Drive creator - full access granted");
        return true;
      }

      // Check if same department - NORMALIZE both departments
      const userDept = user.profile?.department?.toLowerCase().trim();
      const creatorDept = drive.createdBy?.profile?.department
        ?.toLowerCase()
        .trim();

      console.log("=== FRONTEND DEPARTMENT ACCESS CHECK ===");
      console.log("Current User:", user.email);
      console.log("User Dept (raw):", user.profile?.department);
      console.log("User Dept (normalized):", userDept);
      console.log("Drive Creator:", drive.createdBy?.email);
      console.log("Creator Dept (raw):", drive.createdBy?.profile?.department);
      console.log("Creator Dept (normalized):", creatorDept);
      console.log("Departments match:", userDept === creatorDept);

      // Only allow if departments match exactly after normalization
      if (userDept && creatorDept && userDept === creatorDept) {
        console.log("✅ Same department - management access granted");
        return true;
      } else {
        console.log("❌ Different department - access denied");
        return false;
      }
    }

    return false;
  };

  // Add view-only check
  const isViewOnly = (drive) => {
    if (
      user?.role === "student" ||
      user?.role === "po" ||
      user?.role === "placement_officer"
    ) {
      return true;
    }

    return !canManageDrive(drive);
  };

  // Add function to check if student is eligible (for display purposes only)
  const isStudentEligible = (drive) => {
    console.log("=== STUDENT ELIGIBILITY CHECK ===");
    console.log("Drive:", drive.companyName);
    console.log("User Profile:", user?.profile);

    const userCGPA = parseFloat(user?.profile?.cgpa || 0);
    const userBacklogs = parseInt(user?.profile?.currentBacklogs || 0);
    const userDepartment = user?.profile?.department;

    // Map graduation year to batch if batch is undefined
    let userBatch = user?.profile?.batch;
    if (!userBatch && user?.profile?.graduationYear) {
      userBatch = user.profile.graduationYear.toString();
      console.log("📅 Mapped graduation year to batch:", userBatch);
    }

    const userPlaced = user?.profile?.isPlaced || false;

    console.log("User CGPA:", userCGPA);
    console.log("User Backlogs:", userBacklogs);
    console.log("User Department:", userDepartment);
    console.log("User Batch:", userBatch);
    console.log("User Placed:", userPlaced);
    console.log("Drive Eligibility:", drive.eligibility);

    // Check CGPA requirement
    if (drive.eligibility?.minCGPA && drive.eligibility.minCGPA > userCGPA) {
      console.log("❌ CGPA not met:", drive.eligibility.minCGPA, ">", userCGPA);
      return false;
    }

    // Check backlog requirement
    if (
      drive.eligibility?.maxBacklogs !== undefined &&
      drive.eligibility.maxBacklogs < userBacklogs
    ) {
      console.log(
        "❌ Too many backlogs:",
        userBacklogs,
        ">",
        drive.eligibility.maxBacklogs
      );
      return false;
    }

    // Check batch eligibility
    if (
      drive.eligibility?.allowedBatches &&
      drive.eligibility.allowedBatches.length > 0 &&
      !drive.eligibility.allowedBatches.includes(userBatch)
    ) {
      console.log(
        "❌ Batch not allowed:",
        userBatch,
        "not in",
        drive.eligibility.allowedBatches
      );
      return false;
    }

    // Check department eligibility
    if (
      drive.eligibility?.allowedDepartments &&
      drive.eligibility.allowedDepartments.length > 0 &&
      !drive.eligibility.allowedDepartments.includes(userDepartment)
    ) {
      console.log(
        "❌ Department not allowed:",
        userDepartment,
        "not in",
        drive.eligibility.allowedDepartments
      );
      return false;
    }

    // Check placement status eligibility
    const driveCTC = parseFloat(drive.ctc) || 0;
    if (userPlaced && driveCTC <= 10) {
      console.log("❌ User placed, CTC too low:", driveCTC, "<=", 10);
      return false;
    }

    // Check unplaced only requirement
    if (drive.unplacedOnly && userPlaced) {
      console.log("❌ Drive for unplaced only, user is placed");
      return false;
    }

    console.log("✅ Student is eligible for drive");
    return true;
  };

  // Add function to check if PR is eligible (for display purposes only)
  const isPReligible = (drive) => {
    if (user?.role !== "placement_representative" && user?.role !== "pr") {
      return true; // Not a PR, skip check
    }

    console.log("=== PR ELIGIBILITY CHECK ===");
    console.log("Drive:", drive.companyName);
    console.log("User Profile:", user?.profile);

    const userCGPA = parseFloat(user?.profile?.cgpa || 0);
    const userBacklogs = parseInt(user?.profile?.currentBacklogs || 0);
    const userDepartment = user?.profile?.department;

    // Map graduation year to batch if batch is undefined
    let userBatch = user?.profile?.batch;
    if (!userBatch && user?.profile?.graduationYear) {
      userBatch = user.profile.graduationYear.toString();
      console.log("📅 Mapped graduation year to batch:", userBatch);
    }

    const userPlaced = user?.profile?.isPlaced || false;

    console.log("PR CGPA:", userCGPA);
    console.log("PR Backlogs:", userBacklogs);
    console.log("PR Department:", userDepartment);
    console.log("PR Batch:", userBatch);
    console.log("PR Placed:", userPlaced);
    console.log("Drive Eligibility:", drive.eligibility);

    // Check CGPA requirement
    if (drive.eligibility?.minCGPA && drive.eligibility.minCGPA > userCGPA) {
      console.log(
        "❌ PR CGPA not met:",
        drive.eligibility.minCGPA,
        ">",
        userCGPA
      );
      return false;
    }

    // Check backlog requirement
    if (
      drive.eligibility?.maxBacklogs !== undefined &&
      drive.eligibility.maxBacklogs < userBacklogs
    ) {
      console.log(
        "❌ PR Too many backlogs:",
        userBacklogs,
        ">",
        drive.eligibility.maxBacklogs
      );
      return false;
    }

    // Check batch eligibility
    if (
      drive.eligibility?.allowedBatches &&
      drive.eligibility.allowedBatches.length > 0 &&
      !drive.eligibility.allowedBatches.includes(userBatch)
    ) {
      console.log(
        "❌ PR Batch not allowed:",
        userBatch,
        "not in",
        drive.eligibility.allowedBatches
      );
      return false;
    }

    // Check department eligibility
    if (
      drive.eligibility?.allowedDepartments &&
      drive.eligibility.allowedDepartments.length > 0 &&
      !drive.eligibility.allowedDepartments.includes(userDepartment)
    ) {
      console.log(
        "❌ PR Department not allowed:",
        userDepartment,
        "not in",
        drive.eligibility.allowedDepartments
      );
      return false;
    }

    // Check placement status eligibility
    const driveCTC = parseFloat(drive.ctc) || 0;
    if (userPlaced && driveCTC <= 10) {
      console.log("❌ PR User placed, CTC too low:", driveCTC, "<=", 10);
      return false;
    }

    // Check unplaced only requirement
    if (drive.unplacedOnly && userPlaced) {
      console.log("❌ Drive for unplaced only, PR is placed");
      return false;
    }

    console.log("✅ PR is eligible for drive");
    return true;
  };

  // Modal component
  const DriveModal = ({ drive, onClose }) => {
    if (!drive) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-y-auto m-4">
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b">
            <div className="flex-1 pr-4">
              <h2 className="text-2xl font-bold text-gray-900 break-words">
                {drive.companyName}
              </h2>
              <p className="text-lg text-gray-600 break-words">{drive.role}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold flex-shrink-0"
            >
              ×
            </button>
          </div>

          {/* Content - Two Column Layout */}
          <div className="p-6">
            <div className="grid grid-cols-2 gap-8">
              {/* Left Column */}
              <div className="space-y-6 min-w-0">
                {/* Company Details */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Company Details
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap">
                      <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                        Name:
                      </span>
                      <span className="text-gray-600 break-words flex-1">
                        {drive.companyName}
                      </span>
                    </div>
                    {drive.companyWebsite && (
                      <div className="flex flex-wrap">
                        <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                          Website:
                        </span>
                        <a
                          href={drive.companyWebsite}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline break-all flex-1"
                        >
                          {drive.companyWebsite}
                        </a>
                      </div>
                    )}
                    {drive.companyDescription && (
                      <div>
                        <span className="font-medium text-gray-700">
                          Company Description:
                        </span>
                        <p className="text-gray-600 mt-1 text-justify leading-relaxed break-words word-wrap">
                          {drive.companyDescription}
                        </p>
                      </div>
                    )}
                  {drive.spocDept && (
                    <div>
                      <span className="font-medium text-gray-700">
                        SPOC Department:
                      </span>
                      <p className="text-gray-600 mt-1">{drive.spocDept}</p>
                    </div>
                  )}
                  </div>
                </div>

                {/* Job Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Job Information
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap">
                      <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                        Type:
                      </span>
                      <span className="text-gray-600 break-words">
                        {drive.type || drive.jobType || "Full Time"}
                      </span>
                    </div>
                    <div className="flex flex-wrap">
                      <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                        Location:
                      </span>
                      <span className="text-gray-600 break-words flex-1">
                        {drive.location ||
                          drive.locations?.join(", ") ||
                          "Not specified"}
                      </span>
                    </div>
                    <div className="flex flex-wrap">
                      <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                        CTC:
                      </span>
                      <span className="text-gray-600">
                        ₹{drive.ctc || "Not disclosed"} LPA
                      </span>
                    </div>
                    <div className="flex flex-wrap">
                      <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                        Drive Date:
                      </span>
                      <span className="text-gray-600">
                        {new Date(drive.date).toLocaleDateString()}
                      </span>
                    </div>
                    {drive.time && (
                      <div className="flex flex-wrap">
                        <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                          Drive Time:
                        </span>
                        <span className="text-gray-600">{drive.time}</span>
                      </div>
                    )}
                    <div className="flex flex-wrap">
                      <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                        Application Deadline:
                      </span>
                      <span className="text-gray-600">
                        {drive.deadline
                          ? new Date(drive.deadline).toLocaleDateString()
                          : "Not specified"}
                      </span>
                    </div>
                    {drive.applicationDeadlineTime && (
                      <div className="flex flex-wrap">
                        <span className="font-medium text-gray-700 w-24 flex-shrink-0">Deadline Time:</span>
                        <span className="text-gray-600">{drive.applicationDeadlineTime}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* CTC Breakdown */}
                {drive.ctcBreakdown &&
                  (drive.ctcBreakdown.baseSalary ||
                    drive.ctcBreakdown.variablePay ||
                    drive.ctcBreakdown.joiningBonus ||
                    drive.ctcBreakdown.otherBenefits) && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">
                        CTC Breakdown
                      </h3>
                      <div className="space-y-2 text-sm">
                        {drive.ctcBreakdown.baseSalary && (
                          <div className="flex flex-wrap">
                            <span className="font-medium text-gray-700 w-32 flex-shrink-0">
                              Base Salary:
                            </span>
                            <span className="text-gray-600">
                              ₹{drive.ctcBreakdown.baseSalary} LPA
                            </span>
                          </div>
                        )}
                        {drive.ctcBreakdown.variablePay && (
                          <div className="flex flex-wrap">
                            <span className="font-medium text-gray-700 w-32 flex-shrink-0">
                              Variable Pay:
                            </span>
                            <span className="text-gray-600">
                              ₹{drive.ctcBreakdown.variablePay} LPA
                            </span>
                          </div>
                        )}
                        {drive.ctcBreakdown.joiningBonus && (
                          <div className="flex flex-wrap">
                            <span className="font-medium text-gray-700 w-32 flex-shrink-0">
                              Joining Bonus:
                            </span>
                            <span className="text-gray-600">
                              ₹{drive.ctcBreakdown.joiningBonus} LPA
                            </span>
                          </div>
                        )}
                        {drive.ctcBreakdown.otherBenefits && (
                          <div>
                            <span className="font-medium text-gray-700">
                              Other Benefits:
                            </span>
                            <p className="text-gray-600 mt-1 text-justify break-words word-wrap">
                              {drive.ctcBreakdown.otherBenefits}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                {/* Drive Details */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Drive Details
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap">
                      <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                        Mode:
                      </span>
                      <span className="text-gray-600">
                        {drive.driveMode || "On Campus"}
                      </span>
                    </div>
                    {drive.venue && (
                      <div className="flex flex-wrap">
                        <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                          Venue:
                        </span>
                        <span className="text-gray-600 break-words flex-1">
                          {drive.venue}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-wrap">
                      <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                        Applications:
                      </span>
                      <span className="text-gray-600">
                        {drive.applications?.length || 0}
                      </span>
                    </div>
                    {drive.placedStudents &&
                      drive.placedStudents.length > 0 && (
                        <div className="flex flex-wrap">
                          <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                            Placed:
                          </span>
                          <span className="text-gray-600">
                            {drive.placedStudents.length}
                          </span>
                        </div>
                      )}
                  </div>
                </div>
                {/* Description */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Description
                  </h3>
                  <p className="text-sm text-gray-600 text-justify leading-relaxed break-words word-wrap overflow-wrap-anywhere">
                    {drive.description || "No description provided"}
                  </p>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6 min-w-0">
                {/* Requirements */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Requirements
                  </h3>
                  <p className="text-sm text-gray-600 text-justify leading-relaxed break-words word-wrap overflow-wrap-anywhere">
                    {drive.requirements || "No specific requirements mentioned"}
                  </p>
                </div>

                {/* Required Skills */}
                {drive.skills && drive.skills.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Required Skills
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {(Array.isArray(drive.skills)
                        ? drive.skills
                        : drive.skills.split(",")
                      ).map((skill, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm break-words"
                        >
                          {skill.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Eligibility Criteria */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Eligibility Criteria
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap">
                      <span className="font-medium text-gray-700 w-32 flex-shrink-0">
                        Min CGPA:
                      </span>
                      <span className="text-gray-600">
                        {drive.eligibility?.minCGPA ||
                          drive.eligibility?.cgpa ||
                          "Not specified"}
                      </span>
                    </div>
                    <div className="flex flex-wrap">
                      <span className="font-medium text-gray-700 w-32 flex-shrink-0">
                        Max Backlogs:
                      </span>
                      <span className="text-gray-600">
                        {drive.eligibility?.maxBacklogs || "Not specified"}
                      </span>
                    </div>
                    {drive.eligibility?.allowedDepartments &&
                      drive.eligibility.allowedDepartments.length > 0 && (
                        <div>
                          <span className="font-medium text-gray-700">
                            Departments:
                          </span>
                          <p className="text-gray-600 mt-1 text-justify break-words word-wrap">
                            {drive.eligibility.allowedDepartments.join(", ")}
                          </p>
                        </div>
                      )}
                    {drive.eligibility?.allowedBatches &&
                      drive.eligibility.allowedBatches.length > 0 && (
                        <div>
                          <span className="font-medium text-gray-700">
                            Batches:
                          </span>
                          <p className="text-gray-600 mt-1 break-words">
                            {drive.eligibility.allowedBatches.join(", ")}
                          </p>
                        </div>
                      )}
                  </div>
                </div>

                {/* Selection Process */}
                {(drive.rounds ||
                  drive.testDetails ||
                  drive.interviewProcess) && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Selection Process
                    </h3>
                    {drive.rounds && (
                      <div className="mb-3">
                        <span className="font-medium text-gray-700 text-sm">
                          Rounds:
                        </span>
                        <div className="mt-1">
                          {(Array.isArray(drive.rounds)
                            ? drive.rounds
                            : drive.rounds.split(",")
                          ).map((round, index) => (
                            <div
                              key={index}
                              className="text-sm text-gray-600 break-words"
                            >
                              {index + 1}. {round.trim()}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {drive.testDetails && (
                      <div className="mb-3">
                        <span className="font-medium text-gray-700 text-sm">
                          Test Details:
                        </span>
                        <p className="text-sm text-gray-600 mt-1 text-justify break-words word-wrap">
                          {drive.testDetails}
                        </p>
                      </div>
                    )}
                    {drive.interviewProcess && (
                      <div>
                        <span className="font-medium text-gray-700 text-sm">
                          Interview Process:
                        </span>
                        <p className="text-sm text-gray-600 mt-1 text-justify break-words word-wrap">
                          {drive.interviewProcess}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Bond Information */}
                {(drive.bond ||
                  (drive.bondDetails &&
                    (drive.bondDetails.amount ||
                      drive.bondDetails.duration))) && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Bond Information
                    </h3>
                    <div className="space-y-2 text-sm">
                      {drive.bond && (
                        <div>
                          <span className="font-medium text-gray-700">
                            Details:
                          </span>
                          <p className="text-gray-600 mt-1 text-justify break-words word-wrap">
                            {drive.bond}
                          </p>
                        </div>
                      )}
                      {drive.bondDetails?.amount && (
                        <div className="flex flex-wrap">
                          <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                            Amount:
                          </span>
                          <span className="text-gray-600">
                            ₹{drive.bondDetails.amount}
                          </span>
                        </div>
                      )}
                      {drive.bondDetails?.duration && (
                        <div className="flex flex-wrap">
                          <span className="font-medium text-gray-700 w-24 flex-shrink-0">
                            Duration:
                          </span>
                          <span className="text-gray-600 break-words">
                            {drive.bondDetails.duration}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Job Flags */}
                {(drive.isDreamJob || drive.unplacedOnly) && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Job Flags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {drive.isDreamJob && (
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                          ⭐ Dream Job
                        </span>
                      )}
                      {drive.unplacedOnly && (
                        <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
                          👥 Unplaced Only
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-4 border-t flex justify-between items-center">
              <div className="text-sm text-gray-500">
                <span>
                  Created by:{" "}
                  {drive.createdBy?.profile?.name ||
                    drive.createdBy?.name ||
                    drive.createdBy?.email ||
                    (drive.createdBy ? "Unknown User" : "System Generated")}
                </span>
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Add this new component for viewing selected students in a round
  const RoundStudentsModal = ({
    isOpen,
    onClose,
    round,
    roundIndex,
    jobDrive,
    fromPR,
  }) => {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      if (
        isOpen &&
        round &&
        round.selectedStudents &&
        round.selectedStudents.length > 0
      ) {
        fetchSelectedStudents();
      }
    }, [isOpen, round]);

    const fetchSelectedStudents = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("token");
        const response = await axios.post(
          `${API_BASE}/api/job-drives/${jobDrive._id}/get-students-by-ids`,
          { studentIds: round.selectedStudents },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setStudents(response.data.students || []);
      } catch (error) {
        console.error("Error fetching selected students:", error);
        toast.error("Failed to fetch selected students");
      } finally {
        setLoading(false);
      }
    };

    const downloadCSV = () => {
      if (!students || students.length === 0) {
        toast.error("No data to download");
        return;
      }

      const headers = [
        "S.No",
        "Name",
        "Roll No",
        "Department",
        "Email",
        "CGPA",
        "Mobile No",
      ];

      const csvContent = [
        headers.join(","),
        ...students.map((student, index) =>
          [
            index + 1,
            `"${student.profile?.name || student.name || "N/A"}"`,
            `"${student.profile?.rollNumber || student.rollNumber || "N/A"}"`,
            `"${student.profile?.department || student.department || "N/A"}"`,
            `"${student.email || "N/A"}"`,
            `"${student.profile?.cgpa || student.cgpa || "N/A"}"`,
            `"${student.profile?.mobileNumber || student.profile?.phoneNumber || student.mobileNumber || student.phoneNumber || "N/A"}"`,
          ].join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `${jobDrive.companyName}_${round.name || `Round_${roundIndex + 1}`}_selected_students.csv`
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">
              Selected Students - {round.name || `Round ${roundIndex + 1}`}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Company:</strong> {jobDrive.companyName} |
              <strong> Round:</strong> {round.name || `Round ${roundIndex + 1}`}{" "}
              |<strong> Selected:</strong> {round.selectedStudents?.length || 0}{" "}
              students
            </p>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading selected students...</p>
            </div>
          ) : students.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No student details found for this round.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      S.No
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      Roll No
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      Department
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      CGPA
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      Mobile No
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {students.map((student, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{index + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {student.profile?.name || student.name || "N/A"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {student.profile?.rollNumber ||
                          student.rollNumber ||
                          "N/A"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {student.profile?.department ||
                          student.department ||
                          "N/A"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {student.email || "N/A"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {student.profile?.cgpa || student.cgpa || "N/A"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {student.profile?.mobileNumber ||
                          student.profile?.phoneNumber ||
                          student.mobileNumber ||
                          student.phoneNumber ||
                          "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex justify-between items-center">
            {!fromPR && students.length > 0 && (
              <button
                onClick={downloadCSV}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center space-x-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span>Download CSV</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Add PlacedStudentsViewModal component
  const PlacedStudentsViewModal = ({ drive, onClose }) => {
    if (!drive) return null;

    const downloadCSV = () => {
      if (!drive.placedStudents || drive.placedStudents.length === 0) {
        toast.error("No data to download");
        return;
      }

      const headers = [
        "S.No",
        "Name",
        "Roll No",
        "Department",
        "CGPA",
        "Email",
        "Mobile",
        "Added On",
      ];

      const csvContent = [
        headers.join(","),
        ...drive.placedStudents.map((student, index) =>
          [
            index + 1,
            `"${student.name}"`,
            `"${student.rollNumber}"`,
            `"${student.department}"`,
            `"${student.cgpa || "N/A"}"`,
            `"${student.email}"`,
            `"${student.mobileNumber || "N/A"}"`,
            `"${student.addedAt ? new Date(student.addedAt).toLocaleDateString() : "N/A"}"`,
          ].join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `${drive.companyName}_placed_students.csv`
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">
              Placed Students - {drive.companyName}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

          {!drive.placedStudents || drive.placedStudents.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No students have been placed for this job drive yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      S.No
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      Roll No
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      Department
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      CGPA
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      Mobile
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
                      Added On
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {drive.placedStudents.map((student, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{index + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {student.name}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {student.rollNumber}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {student.department}
                      </td>
                      <td className="px-4 py-3 text-sm">{student.cgpa || "N/A"}</td>
                      <td className="px-4 py-3 text-sm">{student.email}</td>
                      <td className="px-4 py-3 text-sm">
                        {student.mobileNumber || "N/A"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {student.addedAt
                          ? new Date(student.addedAt).toLocaleDateString()
                          : "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            {drive.placedStudents && drive.placedStudents.length > 0 && (
              <button
                onClick={downloadCSV}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading job drives...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Job Drives</h1>
          <p className="mt-2 text-gray-600">
            {user?.role === "student"
              ? "Browse and apply to job opportunities"
              : "Manage job drives and applications"}
          </p>
        </div>

        {isPOUser && (
          <div className="bg-white rounded-lg shadow mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Manage Drives by Department
              </h2>
            </div>
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                List of Departments
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {DEPARTMENTS.map((department) => (
                  <button
                    key={department}
                    onClick={() =>
                      setSelectedDepartment((current) =>
                        current === department ? "" : department
                      )
                    }
                    className={`p-4 text-left border rounded-lg hover:bg-blue-50 transition-colors ${
                      selectedDepartment === department
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="font-medium text-gray-900">{department}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filter Buttons - same as placement representative */}
        <div className="mb-6 flex flex-wrap gap-2">
          {["all", "upcoming", "past"].map((filterType) => (
            <button
              key={filterType}
              onClick={() => setFilter(filterType)}
              className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors ${
                filter === filterType
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"
              }`}
            >
              {filterType} (
              {
                drivesForSelectedDepartment.filter((drive) => {
                  const driveEnded = isDriveEnded(drive);

                  if (filterType === "upcoming") return !driveEnded;
                  if (filterType === "past") return driveEnded;
                  return true;
                }).length
              }
              )
            </button>
          ))}
        </div>

        {/* Drives List */}
        {loading ? (
          <div className="text-center py-8">
            <div className="text-lg">Loading job drives...</div>
          </div>
        ) : filteredDrives.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">
              No job drives found for "{filter}" filter
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredDrives.map((drive) => {
              const driveEnded = isDriveEnded(drive);
              const hasSelectionRounds =
                drive.selectionRounds &&
                Array.isArray(drive.selectionRounds) &&
                drive.selectionRounds.length > 0;
              const canManage = canManageDrive(drive);
              const viewOnly = isViewOnly(drive);
              const hasDriveFiles = Boolean(driveFilesAvailability[drive._id]);

              // Check eligibility for both students and PRs
              let isEligible = true;
              if (user?.role === "student") {
                console.log(
                  "=== CHECKING ELIGIBILITY FOR:",
                  drive.companyName,
                  "==="
                );
                console.log("Student profile:", user?.profile);
                isEligible = isStudentEligible(drive);
                console.log("Final eligibility result:", isEligible);
              } else if (
                user?.role === "placement_representative" ||
                user?.role === "pr"
              ) {
                console.log(
                  "=== CHECKING PR ELIGIBILITY FOR:",
                  drive.companyName,
                  "==="
                );
                console.log("PR profile:", user?.profile);
                isEligible = isPReligible(drive);
                console.log("Final PR eligibility result:", isEligible);
              }

              return (
                <div
                  key={drive._id}
                  className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold text-gray-900">
                          {drive.companyName}
                        </h3>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            driveEnded
                              ? "bg-red-100 text-red-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {driveEnded ? "Ended" : "Active"}
                        </span>

                        {/* Show eligibility status for both students and PRs */}
                        {(user?.role === "student" ||
                          user?.role === "placement_representative" ||
                          user?.role === "pr") &&
                          !isEligible && (
                            <button
                              onClick={() => showEligibilityReasons(drive)}
                              className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 hover:bg-orange-200 transition-colors"
                            >
                              Not Eligible
                            </button>
                          )}
                      </div>

                      <p className="text-lg text-gray-700 mb-2">{drive.role}</p>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          📅 {new Date(drive.date).toLocaleDateString()}
                        </span>
                        {drive.time && (
                          <span className="flex items-center gap-1">
                            🕒 {drive.time}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          📍 {drive.location || drive.venue || "TBD"}
                        </span>
                        <span className="flex items-center gap-1">
                          💰 {drive.salary || drive.ctc || "Not disclosed"}
                        </span>
                        <span className="flex items-center gap-1">
                          👥 {drive.applications?.length || 0} applications
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col space-y-2 ml-4">
                      <button
                        onClick={() => handleViewDrive(drive)}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                      >
                        View Details
                      </button>

                      {isPOUser && (
                        <button
                          onClick={() => hasDriveFiles && openDriveFilesModal(drive)}
                          disabled={!hasDriveFiles}
                          className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                            hasDriveFiles
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : "bg-gray-200 text-gray-400 cursor-not-allowed"
                          }`}
                        >
                          View Files
                        </button>
                      )}

                      {/* Student-specific buttons */}
                      {user?.role === "student" && !driveEnded && (
                        <div>
                          {hasApplied(drive) ? (
                            <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium text-center block">
                              Applied ✓
                            </span>
                          ) : isApplicationDeadlinePassed(drive) ? (
                            <span className="px-4 py-2 bg-red-100 text-red-800 rounded-lg text-sm font-medium text-center block">
                              Deadline Passed
                            </span>
                          ) : isEligible ? (
                            <button
                              onClick={() => handleApply(drive._id)}
                              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm w-full"
                            >
                              Apply Now
                            </button>
                          ) : (
                            <button
                              onClick={() => showEligibilityReasons(drive)}
                              className="px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium text-center block w-full transition-colors"
                            >
                              Not Eligible
                            </button>
                          )}
                        </div>
                      )}

                      {/* PR-specific buttons */}
                      {(user?.role === "placement_representative" ||
                        user?.role === "pr") && (
                        <div className="space-y-2">
                          {/* Show Apply button for eligible PRs */}
                          {!driveEnded &&
                            isEligible &&
                            !hasApplied(drive) &&
                            !isApplicationDeadlinePassed(drive) && (
                              <button
                                onClick={() => handleApply(drive._id)}
                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm w-full"
                              >
                                Apply Now
                              </button>
                            )}

                          {/* Show deadline passed status */}
                          {!driveEnded &&
                            isApplicationDeadlinePassed(drive) &&
                            !hasApplied(drive) && (
                              <span className="px-4 py-2 bg-red-100 text-red-800 rounded-lg text-sm font-medium text-center block">
                                Deadline Passed
                              </span>
                            )}

                          {/* Show Applied status */}
                          {hasApplied(drive) && (
                            <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium text-center block">
                              Applied
                            </span>
                          )}

                          {/* Show eligibility status for PRs */}
                          {!driveEnded && !isEligible && (
                            <button
                              onClick={() => showEligibilityReasons(drive)}
                              className="px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium text-center block w-full transition-colors"
                            >
                              Not Eligible to Apply
                            </button>
                          )}

                          {/* Show drive ended status */}
                          {driveEnded && (
                            <span className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium text-center block">
                              Drive Ended
                            </span>
                          )}
                        </div>
                      )}

                      {/* View placed students button for ALL USERS - UPDATED LOGIC */}
                      {(() => {
                        const driveEnded = isDriveEnded(drive);
                        // Show button if there are manual placed students OR if drive ended and has selection round students
                        const hasManualPlaced = drive.placedStudents && drive.placedStudents.length > 0;
                        const hasSelectionRoundPlaced =
                          driveEnded && 
                          drive.selectionRounds && 
                          drive.selectionRounds.length > 0 &&
                          drive.selectionRounds[drive.selectionRounds.length - 1]?.selectedStudents?.length > 0;
                        
                        if (hasManualPlaced || hasSelectionRoundPlaced) {
                          // Show count from appropriate source
                          let count = 0;
                          if (hasSelectionRoundPlaced) {
                            count = drive.selectionRounds[drive.selectionRounds.length - 1].selectedStudents.length;
                          } else {
                            count = drive.placedStudents.length;
                          }
                          
                          return (
                            <button
                              onClick={() => handleViewPlacedStudents(drive)}
                              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm"
                            >
                              View Placed ({count})
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* Selection rounds info */}
                  {hasSelectionRounds && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-3">
                        Selection Rounds:
                      </h4>
                      <div className="space-y-2">
                        {drive.selectionRounds.map((round, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-white rounded-lg border"
                          >
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                {round.name || `Round ${index + 1}`}
                              </span>
                              {round.selectedStudents &&
                                round.selectedStudents.length > 0 && (
                                  <span className="text-sm text-gray-600">
                                    ({round.selectedStudents.length} selected)
                                  </span>
                                )}
                            </div>

                            {/* View selected students button for each round - WITH PROPER HANDLER */}
                            {round.selectedStudents &&
                              round.selectedStudents.length > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    console.log(
                                      "=== VIEW SELECTED CLICKED ==="
                                    );
                                    console.log("Drive:", drive.companyName);
                                    console.log(
                                      "Round:",
                                      round.name || `Round ${index + 1}`
                                    );
                                    console.log(
                                      "Selected Students:",
                                      round.selectedStudents
                                    );
                                    handleViewRoundStudents(
                                      drive,
                                      round,
                                      index
                                    );
                                  }}
                                  className="px-3 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg text-sm font-medium transition-colors"
                                >
                                  View Selected
                                </button>
                              )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && selectedDrive && (
        <DriveModal drive={selectedDrive} onClose={closeModal} />
      )}

      {showDriveFilesModal && selectedDriveForFiles && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">
                Uploaded Files - {selectedDriveForFiles.companyName}
              </h2>
              <button
                onClick={closeDriveFilesModal}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6">
              {driveFilesLoading ? (
                <div className="text-center py-8 text-gray-500">Loading files...</div>
              ) : selectedDriveFiles.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No files uploaded for this drive yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded By (PR)</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedDriveFiles.map((file) => (
                        <tr key={file.id}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 uppercase">
                            {file.file_type || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{file.file_name || "-"}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {file.uploader_name || "Unknown"}
                            <div className="text-xs text-gray-400">{file.uploader_email || ""}</div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {file.file_url ? (
                              <div className="flex items-center gap-3">
                                <a
                                  href={file.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  View
                                </a>
                                <button
                                  onClick={() => handleDriveFileDownload(file.file_url, file.file_name)}
                                  className="text-green-600 hover:text-green-800"
                                >
                                  Download
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={closeDriveFilesModal}
                className="px-5 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlacedStudentsViewModal && selectedDriveForView && (
        <PlacedStudentsViewModal
          drive={selectedDriveForView}
          onClose={() => {
            setShowPlacedStudentsViewModal(false);
            setSelectedDriveForView(null);
          }}
        />
      )}

      {showRoundStudentsModal && selectedRound && selectedJobForRoundView && (
        <RoundStudentsModal
          isOpen={showRoundStudentsModal}
          round={selectedRound}
          roundIndex={selectedRoundIndex}
          jobDrive={selectedJobForRoundView}
          onClose={closeRoundStudentsModal}
          fromPR={fromPR}
        />
      )}

      {/* Eligibility Modal */}
      {showEligibilityModal && selectedDriveForEligibility && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <svg
                  className="h-6 w-6 text-orange-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">
                  Eligibility Requirements
                </h3>
              </div>
            </div>

            <div className="mb-4">
              <h4 className="text-md font-semibold text-gray-800 mb-2">
                {selectedDriveForEligibility.companyName} - {selectedDriveForEligibility.role}
              </h4>
              <p className="text-sm text-gray-600 mb-4">
                Here are the reasons why you're not eligible for this position:
              </p>
              
              <div className="space-y-2">
                {getEligibilityReasons(selectedDriveForEligibility).map((reason, index) => (
                  <div key={index} className="flex items-start">
                    <div className="flex-shrink-0 mt-1">
                      <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <p className="ml-2 text-sm text-gray-700">{reason}</p>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Tip:</strong> Contact your placement officer or update your profile if you believe this information is incorrect.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={closeEligibilityModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
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
                  {user?.role === "po" || user?.role === "placement_officer"
                    ? "Delete Job Drive"
                    : "Request Job Drive Deletion"}
                </h3>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600">
                {user?.role === "po" || user?.role === "placement_officer"
                  ? `Are you sure you want to delete ${deleteTarget.name}? This action will be performed immediately.`
                  : `Are you sure you want to request deletion of ${deleteTarget.name}? This will require PO approval.`}
              </p>
            </div>

            {/* Reason input for PRs */}
            {(user?.role === "placement_representative" ||
              user?.role === "pr") && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for deletion request *
                </label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="3"
                  placeholder="Please provide a reason for the deletion request..."
                  required
                />
              </div>
            )}

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
                {user?.role === "po" || user?.role === "placement_officer"
                  ? "Delete"
                  : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDrives;
