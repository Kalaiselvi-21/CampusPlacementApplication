import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
const API_BASE = process.env.REACT_APP_API_BASE;

const PRProfileSetup = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [completionStatus, setCompletionStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  // Form data states - same as CompleteProfile
  const [formData, setFormData] = useState({
    name: user?.name || "",
    rollNumber: "",
    degree: "",
    department: "",
    graduationYear: "",
    cgpa: "",
    gender: "",
    dateOfBirth: "",
    personalEmail: "",
    collegeEmail: "",
    tenthPercentage: "",
    twelfthPercentage: "",
    diplomaPercentage: "",
    address: "",
    phoneNumber: "",
    linkedinUrl: "",
    githubUrl: "",
    resumeDriveLink: "",
    panCardDriveLink: "",
    aadharCardDriveLink: "",
    currentBacklogs: 0,
    historyOfBacklogs: [],
    aboutMe: "",
    skills: [],
    placementStatus: "unplaced", // Add placement status field
  });

  // Add state for managing backlog history
  const [backlogEntry, setBacklogEntry] = useState({
    subject: "",
    semester: "",
    cleared: false,
    clearedDate: "",
  });

  // Function to add backlog to history
  const addBacklogToHistory = () => {
    if (backlogEntry.subject && backlogEntry.semester) {
      setFormData((prev) => ({
        ...prev,
        historyOfBacklogs: [...prev.historyOfBacklogs, { ...backlogEntry }],
      }));
      setBacklogEntry({
        subject: "",
        semester: "",
        cleared: false,
        clearedDate: "",
      });
    }
  };

  // Function to remove backlog from history
  const removeBacklogFromHistory = (index) => {
    setFormData((prev) => ({
      ...prev,
      historyOfBacklogs: prev.historyOfBacklogs.filter((_, i) => i !== index),
    }));
  };

  const [files, setFiles] = useState({
    photo: null,
    resume: null,
    collegeIdCard: null,
    marksheets: [],
  });

  const departments = [
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

  const currentYear = new Date().getFullYear();
  const graduationYears = Array.from({ length: 6 }, (_, i) => currentYear + i);

  useEffect(() => {
    // Check if user is PR role
    if (!user || user.role !== "placement_representative") {
      navigate("/login");
      return;
    }
    fetchCompletionStatus();
  }, [user, navigate]);

  const fetchCompletionStatus = async () => {
    try {
      const response = await axios.get(
        `${API_BASE}/api/profile/completion-status`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        },
      );
      setCompletionStatus(response.data);
    } catch (error) {
      console.error("Failed to fetch completion status:", error);
      setCompletionStatus({
        percentage: 0,
        isComplete: false,
        missingFields: [],
      });
    }
  };

  const handleBasicInfoChange = (e) => {
    const { name, value } = e.target;
    if (name === "skills") {
      setFormData((prev) => ({
        ...prev,
        skills: value,
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e) => {
    const { name, files: selectedFiles } = e.target;
    if (name === "marksheets") {
      setFiles((prev) => ({ ...prev, marksheets: Array.from(selectedFiles) }));
    } else {
      setFiles((prev) => ({ ...prev, [name]: selectedFiles[0] }));
    }
  };
  const [validationErrors, setValidationErrors] = useState([]);
  const submitBasicInfo = async () => {
    setLoading(true);
    try {
      const dataToSend = {
        ...formData,
        skills:
          typeof formData.skills === "string"
            ? formData.skills
                .split(",")
                .map((skill) => skill.trim())
                .filter((skill) => skill.length > 0)
            : formData.skills,
      };

      const response = await axios.put(
        `${API_BASE}/api/profile/basic-info`,
        dataToSend,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        },
      );

      const responseUser = response.data.user;
      const updatedUser = {
        ...user,
        ...(responseUser || {}),
        placementPolicyConsent:
          responseUser?.placementPolicyConsent || user.placementPolicyConsent,
      };
      updateUser(updatedUser);
      toast.success("Basic information saved!");
      setValidationErrors([]);
      setCurrentStep(2);
    } catch (error) {
      console.log("Error response:", error.response?.data);

      // Handle validation errors from backend
      if (error.response?.data?.validationErrors) {
        const errors = error.response.data.validationErrors;
        setValidationErrors(errors);
        toast.error(`Invalid: ${errors.join(", ")}`);
      } else {
        toast.error(
          error.response?.data?.message || "Failed to save basic info",
        );
        setValidationErrors([]);
      }
    } finally {
      setLoading(false);
    }
  };
  const [fileValidationErrors, setFileValidationErrors] = useState([]);
  const submitFiles = async () => {
    setLoading(true);
    try {
      const errors = [];

      // Photo validation - required
      if (!files.photo) {
        errors.push("photo");
      }

      // Resume validation - required
      if (!files.resume) {
        errors.push("resume");
      }

      // College ID validation - required
      if (!files.collegeIdCard) {
        errors.push("collegeIdCard");
      }

      // Marksheets validation - required, at least 1 file
      if (!files.marksheets || files.marksheets.length === 0) {
        errors.push("marksheets");
      }

      // File size validation (10MB each)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (files.photo && files.photo.size > maxSize) {
        errors.push("photo_tooLarge");
      }
      if (files.resume && files.resume.size > maxSize) {
        errors.push("resume_tooLarge");
      }
      if (files.collegeIdCard && files.collegeIdCard.size > maxSize) {
        errors.push("collegeIdCard_tooLarge");
      }
      if (files.marksheets) {
        files.marksheets.forEach((file, index) => {
          if (file.size > maxSize) {
            errors.push(`marksheets_tooLarge_${index}`);
          }
        });
      }
      // If validation errors exist, show them
      if (errors.length > 0) {
        setFileValidationErrors(errors);
        toast.error(`Please fix: ${errors.join(", ")}`);
        setLoading(false);
        return;
      }

      const fileData = new FormData();

      if (files.photo) fileData.append("photo", files.photo);
      if (files.resume) fileData.append("resume", files.resume);
      if (files.collegeIdCard)
        fileData.append("collegeIdCard", files.collegeIdCard);

      files.marksheets.forEach((file) => {
        fileData.append("marksheets", file);
      });

      // Upload files if any are selected
      if (
        files.photo ||
        files.resume ||
        files.collegeIdCard ||
        files.marksheets.length > 0
      ) {
        await axios.post(`${API_BASE}/api/profile/upload-files`, fileData, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "multipart/form-data",
          },
        });
      }

      const dataToSend = {
        ...formData,
        skills:
          typeof formData.skills === "string"
            ? formData.skills
                .split(",")
                .map((skill) => skill.trim())
                .filter((skill) => skill.length > 0)
            : formData.skills,
        isProfileComplete: true,
      };

      // Update profile completion status in backend
      const response = await axios.put(
        `${API_BASE}/api/profile/basic-info`,
        dataToSend,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        },
      );

      // Mark profile as complete and update user
      const responseUser = response.data?.user;
      const updatedUser = responseUser
        ? {
            ...user,
            ...responseUser,
            placementPolicyConsent:
              responseUser.placementPolicyConsent ||
              user.placementPolicyConsent,
          }
        : {
            ...user,
            isProfileComplete: true,
            profile: { ...user.profile, isProfileComplete: true },
          };
      updateUser(updatedUser);

      toast.success("Profile completed successfully!");

      // Navigate to placement consent for PRs (same as students)
      if (!updatedUser.placementPolicyConsent?.hasAgreed) {
        console.log("PR Profile completed, navigating to placement consent");
        navigate("/placement-consent", { replace: true });
      } else {
        navigate("/pr-dashboard", { replace: true });
      }
    } catch (error) {
      console.error("File upload error:", error);
      toast.error(error.response?.data?.message || "Failed to upload files");
    } finally {
      setLoading(false);
    }
  };

  const renderProgressBar = () => {
    const percentage = completionStatus?.percentage || 0;
    return (
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Profile Completion</span>
          <span>{percentage}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        {/* {completionStatus?.missingFields?.length > 0 && (
          <div className="mt-2 text-sm text-red-600">
            Missing: {completionStatus.missingFields.join(", ")}
          </div>
        )} */}
      </div>
    );
  };

  const renderBasicInfoStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold mb-4">Basic Information</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Name *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Roll Number *
          </label>
          <input
            type="text"
            name="rollNumber"
            value={formData.rollNumber}
            onChange={handleBasicInfoChange}
            placeholder="e.g., 21CS001"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Gender *
          </label>
          <select
            name="gender"
            value={formData.gender}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          >
            <option value="">Select Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Date of Birth *
          </label>
          <input
            type="date"
            name="dateOfBirth"
            value={formData.dateOfBirth}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Personal Email *
          </label>
          <input
            type="email"
            name="personalEmail"
            value={formData.personalEmail}
            onChange={handleBasicInfoChange}
            placeholder="your.personal@email.com"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            College Email *
          </label>
          <input
            type="email"
            name="collegeEmail"
            value={formData.collegeEmail}
            onChange={handleBasicInfoChange}
            placeholder="your.name@gct.ac.in"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            10th Percentage *
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            name="tenthPercentage"
            value={formData.tenthPercentage}
            onWheel={(e) => e.target.blur()}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            12th Percentage (Optional)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            name="twelfthPercentage"
            value={formData.twelfthPercentage}
            onWheel={(e) => e.target.blur()}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Diploma Percentage (Optional)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            name="diplomaPercentage"
            value={formData.diplomaPercentage}
            onWheel={(e) => e.target.blur()}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Degree *
          </label>
          <select
            name="degree"
            value={formData.degree}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          >
            <option value="">Select Degree</option>
            <option value="B.E">B.E</option>
            <option value="B.TECH">B.TECH</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Department *
          </label>
          <select
            name="department"
            value={formData.department}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          >
            <option value="">Select Department</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Graduation Year *
          </label>
          <select
            name="graduationYear"
            value={formData.graduationYear}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          >
            <option value="">Select Year</option>
            {graduationYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            CGPA *
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="10"
            name="cgpa"
            value={formData.cgpa}
            onWheel={(e) => e.target.blur()}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        {/* Placement Status Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Placement Status *
          </label>
          <select
            name="placementStatus"
            value={formData.placementStatus}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          >
            <option value="unplaced">Unplaced</option>
            <option value="placed">Placed</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Current Backlogs *
          </label>
          <input
            type="number"
            min="0"
            name="currentBacklogs"
            value={formData.currentBacklogs}
            onWheel={(e) => e.target.blur()}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Phone Number *
          </label>
          <input
            type="tel"
            name="phoneNumber"
            value={formData.phoneNumber}
            onChange={handleBasicInfoChange}
            placeholder="10-digit mobile number"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            LinkedIn URL *
          </label>
          <input
            type="url"
            name="linkedinUrl"
            value={formData.linkedinUrl}
            onChange={handleBasicInfoChange}
            placeholder="https://linkedin.com/in/yourprofile"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            GitHub URL{" "}
            {[
              "Computer Science and Engineering",
              "Information Technology",
            ].includes(formData.department)
              ? "*"
              : "(Optional)"}
          </label>
          <input
            type="url"
            name="githubUrl"
            value={formData.githubUrl}
            onChange={handleBasicInfoChange}
            placeholder="https://github.com/yourusername"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required={["Computer Science", "Information Technology"].includes(
              formData.department,
            )}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Resume Drive Link *
          </label>
          <input
            type="url"
            name="resumeDriveLink"
            value={formData.resumeDriveLink}
            onChange={handleBasicInfoChange}
            placeholder="https://drive.google.com/file/d/.../view"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            PAN Card Drive Link *
          </label>
          <input
            type="url"
            name="panCardDriveLink"
            value={formData.panCardDriveLink}
            onChange={handleBasicInfoChange}
            placeholder="https://drive.google.com/file/d/.../view"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Aadhar Card Drive Link *
          </label>
          <input
            type="url"
            name="aadharCardDriveLink"
            value={formData.aadharCardDriveLink}
            onChange={handleBasicInfoChange}
            placeholder="https://drive.google.com/file/d/.../view"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Address *
        </label>
        <textarea
          name="address"
          value={formData.address}
          onChange={handleBasicInfoChange}
          rows="3"
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Skills * (minimum 3 with comma-separated)
        </label>
        <input
          type="text"
          name="skills"
          value={formData.skills}
          onChange={handleBasicInfoChange}
          placeholder="JavaScript, React, Node.js, Python"
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          About Me * (50-500 characters)
        </label>
        <textarea
          name="aboutMe"
          value={formData.aboutMe}
          onChange={handleBasicInfoChange}
          rows="4"
          minLength="50"
          maxLength="500"
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          required
        />
        <div className="text-sm text-gray-500 mt-1">
          {formData.aboutMe.length}/500 characters
        </div>
      </div>

      <div className="col-span-2">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          History of Backlogs (Optional)
        </label>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              type="text"
              placeholder="Subject"
              value={backlogEntry.subject}
              onChange={(e) =>
                setBacklogEntry((prev) => ({
                  ...prev,
                  subject: e.target.value,
                }))
              }
              className="border border-gray-300 rounded-md px-3 py-2"
            />
            <input
              type="text"
              placeholder="Semester"
              value={backlogEntry.semester}
              onChange={(e) =>
                setBacklogEntry((prev) => ({
                  ...prev,
                  semester: e.target.value,
                }))
              }
              className="border border-gray-300 rounded-md px-3 py-2"
            />
            <select
              value={backlogEntry.cleared}
              onChange={(e) =>
                setBacklogEntry((prev) => ({
                  ...prev,
                  cleared: e.target.value === "true",
                }))
              }
              className="border border-gray-300 rounded-md px-3 py-2"
            >
              <option value={false}>Not Cleared</option>
              <option value={true}>Cleared</option>
            </select>
            <button
              type="button"
              onClick={addBacklogToHistory}
              className="bg-blue-500 text-white px-3 py-2 rounded-md hover:bg-blue-600"
            >
              Add
            </button>
          </div>

          {formData.historyOfBacklogs.length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Added Backlogs:
              </h4>
              <div className="space-y-2">
                {formData.historyOfBacklogs.map((backlog, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-gray-50 p-2 rounded"
                  >
                    <span className="text-sm">
                      {backlog.subject} - {backlog.semester} (
                      {backlog.cleared ? "Cleared" : "Not Cleared"})
                    </span>
                    <button
                      type="button"
                      onClick={() => removeBacklogFromHistory(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={submitBasicInfo}
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save & Continue"}
      </button>
    </div>
  );

  const renderFileUploadStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold mb-4">Document Upload</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Profile Photo * (JPEG/JPG/PNG)
          </label>
          <input
            type="file"
            name="photo"
            onChange={handleFileChange}
            accept="image/*"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Resume * (PDF)
          </label>
          <input
            type="file"
            name="resume"
            onChange={handleFileChange}
            accept=".pdf"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            College ID Card *
          </label>
          <input
            type="file"
            name="collegeIdCard"
            onChange={handleFileChange}
            accept="image/*,.pdf"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Marksheets * (All semesters)
          </label>
          <input
            type="file"
            name="marksheets"
            onChange={handleFileChange}
            accept=".pdf"
            multiple
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>
      </div>

      <div className="flex space-x-4">
        <button
          onClick={() => setCurrentStep(1)}
          className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700"
        >
          Back
        </button>
        <button
          onClick={submitFiles}
          disabled={loading}
          className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "Uploading..." : "Complete Profile"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-4">
              <img
                src="/gct_logo.png"
                alt="GCT Logo"
                className="w-16 h-16 object-contain"
              />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Complete Your Profile
                </h1>
                <p className="text-gray-600">
                  Fill in all required information to access the placement
                  portal
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-4">
            {renderProgressBar()}

            <div className="mb-6">
              <div className="flex items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    currentStep >= 1 ? "bg-blue-600 text-white" : "bg-gray-300"
                  }`}
                >
                  1
                </div>
                <div
                  className={`flex-1 h-1 mx-4 ${
                    currentStep >= 2 ? "bg-blue-600" : "bg-gray-300"
                  }`}
                ></div>
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    currentStep >= 2 ? "bg-blue-600 text-white" : "bg-gray-300"
                  }`}
                >
                  2
                </div>
              </div>
              <div className="flex justify-between mt-2 text-sm text-gray-600">
                <span>Basic Information</span>
                <span>Document Upload</span>
              </div>
            </div>

            {currentStep === 1 && renderBasicInfoStep()}
            {currentStep === 2 && renderFileUploadStep()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PRProfileSetup;
