import { API_BASE } from '../config/api';
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";

const EditProfile = () => {
    const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form data states matching CompleteProfile
  const [basicInfo, setBasicInfo] = useState({
    name: "",
    rollNumber: "",
    degree: "",
    department: "",
    graduationYear: "",
    cgpa: "",
    // New fields
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
    resumeLink: "",
    aadharLink: "",
    panLink: "",
    currentBacklogs: 0,
    historyOfBacklogs: [], // This was missing
    aboutMe: "",
    skills: "",
  });

  const [files, setFiles] = useState({
    photo: null,
    resume: null,
    collegeIdCard: null,
    marksheets: [],
  });

  // Add state for backlog entry
  const [backlogEntry, setBacklogEntry] = useState({
    subject: "",
    semester: "",
    cleared: false,
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
    const fetchUserProfile = async () => {
      try {
        // Fetch fresh user data
        const response = await axios.get(`${API_BASE}/api/profile/`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        const userData = response.data;

        if (userData?.profile) {
          setBasicInfo({
            name: userData.profile.name || "",
            rollNumber: userData.profile.rollNumber || "",
            degree: userData.profile.degree || "",
            department: userData.profile.department || "",
            graduationYear: userData.profile.graduationYear || "",
            cgpa: userData.profile.cgpa || "",
            address: userData.profile.address || "",
            phoneNumber: userData.profile.phoneNumber || "",
            linkedinUrl: userData.profile.linkedinUrl || "",
            githubUrl: userData.profile.githubUrl || "",
            resumeLink: userData.profile.resumeLink || "",
            aadharLink: userData.profile.aadharLink || "",
            panLink: userData.profile.panLink || "",
            currentBacklogs: userData.profile.currentBacklogs || 0,
            historyOfBacklogs: userData.profile.historyOfBacklogs || [],
            aboutMe: userData.profile.aboutMe || "",
            skills: Array.isArray(userData.profile.skills)
              ? userData.profile.skills.join(", ")
              : userData.profile.skills || "",
            // New fields
            gender: userData.profile.gender || "",
            dateOfBirth: userData.profile.dateOfBirth
              ? userData.profile.dateOfBirth.split("T")[0]
              : "",
            personalEmail: userData.profile.personalEmail || "",
            collegeEmail: userData.profile.collegeEmail || "",
            tenthPercentage: userData.profile.tenthPercentage || "",
            twelfthPercentage: userData.profile.twelfthPercentage || "",
            diplomaPercentage: userData.profile.diplomaPercentage || "",
          });
        }
      } catch (error) {
        console.error("Failed to fetch user profile:", error);
        toast.error("Failed to load profile data");
      }
    };

    // Always fetch fresh data from API to get all profile fields
    fetchUserProfile();
  }, []);

  const handleBasicInfoChange = (e) => {
    const { name, value } = e.target;

    // Prevent CGPA changes for students and placement representatives
    if (
      name === "cgpa" &&
      (user?.role === "student" || user?.role === "placement_representative")
    ) {
      return;
    }

    if (name === "skills") {
      setBasicInfo((prev) => ({
        ...prev,
        skills: value,
      }));
    } else {
      setBasicInfo((prev) => ({ ...prev, [name]: value }));
    }
  };
  //
  const [validationErrors, setValidationErrors] = useState([]);
  const [fileValidationErrors, setFileValidationErrors] = useState([]);

  const handleFileChange = (e) => {
    const { name, files: selectedFiles } = e.target;
    if (name === "marksheets") {
      setFiles((prev) => ({ ...prev, marksheets: Array.from(selectedFiles) }));
    } else {
      setFiles((prev) => ({ ...prev, [name]: selectedFiles[0] }));
    }
  };

  const submitBasicInfo = async () => {
    if (!basicInfo.cgpa && basicInfo.cgpa !== 0) {
      toast.error("CGPA is required");
      return;
    }

    if (!basicInfo.resumeLink || !basicInfo.aadharLink || !basicInfo.panLink) {
      toast.error("Resume URL, Aadhaar URL, and PAN URL are required");
      return;
    }

    setLoading(true);
    try {
      const dataToSend = {
        ...basicInfo,
        skills:
          typeof basicInfo.skills === "string"
            ? basicInfo.skills
                .split(",")
                .map((skill) => skill.trim())
                .filter((skill) => skill.length > 0)
            : basicInfo.skills,
      };

      // Remove CGPA from update data for students and PRs
      if (
        user?.role === "student" ||
        user?.role === "placement_representative"
      ) {
        delete dataToSend.cgpa;
      }

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
        placementPolicyConsent: responseUser?.placementPolicyConsent || user.placementPolicyConsent
      };
      updateUser(updatedUser);
      toast.success("Basic information saved!");
      setValidationErrors([]);
      // Move to step 2 instead of navigating away
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
          error.response?.data?.message || "Failed to update profile",
        );
        setValidationErrors([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const submitFiles = async () => {
    setLoading(true);
    setFileValidationErrors([]);
    try {
      const errors = [];

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

      const formData = new FormData();

      if (files.photo) formData.append("photo", files.photo);
      if (files.resume) formData.append("resume", files.resume);
      if (files.collegeIdCard)
        formData.append("collegeIdCard", files.collegeIdCard);

      files.marksheets.forEach((file) => {
        formData.append("marksheets", file);
      });

      const response = await axios.post(
        `${API_BASE}/api/profile/upload-files`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "multipart/form-data",
          },
        },
      );

      toast.success("Profile updated successfully!");
      const responseUser = response.data.user;
      const updatedUser = {
        ...user,
        ...(responseUser || {}),
        placementPolicyConsent: responseUser?.placementPolicyConsent || user.placementPolicyConsent
      };
      updateUser(updatedUser);

      const hasConsented = updatedUser.placementPolicyConsent?.hasAgreed;
      const isStudentOrPR = updatedUser.role === 'student' || updatedUser.role === 'placement_representative' || updatedUser.role === 'pr';

      if (isStudentOrPR && !hasConsented) {
        navigate("/placement-consent");
      } else {
        if (updatedUser.role === 'placement_representative' || updatedUser.role === 'pr') {
          navigate("/pr-dashboard");
        } else if (updatedUser.role === 'placement_officer' || updatedUser.role === 'po') {
          navigate("/po-dashboard");
        } else {
          navigate("/dashboard");
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to upload files");
    } finally {
      setLoading(false);
    }
  };

  // Fix functions for managing backlogs
  const addBacklogToHistory = () => {
    if (backlogEntry.subject && backlogEntry.semester) {
      setBasicInfo((prev) => ({
        ...prev,
        historyOfBacklogs: [...(prev.historyOfBacklogs || []), backlogEntry],
      }));
      setBacklogEntry({ subject: "", semester: "", cleared: false });
    }
  };

  const removeBacklogFromHistory = (index) => {
    setBasicInfo((prev) => ({
      ...prev,
      historyOfBacklogs: prev.historyOfBacklogs.filter((_, i) => i !== index),
    }));
  };

  //Account Deletion

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [password, setPassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteAccount = () => {
    setShowDeleteModal(true);
  };

  const confirmDeleteAccount = async () => {
    if (!password) {
      toast.error("Password is required to confirm deletion.");
      return;
    }
    setDeleteLoading(true);
    try {
      await axios.delete(`${API_BASE}/api/auth/delete-account`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        data: { password }, // Send password in the request body
      });
      toast.success("Account deleted successfully");
      logout(); // Use logout from AuthContext
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Delete account error:", error);
      toast.error(error.response?.data?.message || "Failed to delete account");
      setDeleteLoading(false);
    }
  };

  // Copy the render methods from CompleteProfile
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
            value={basicInfo.name}
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
            value={basicInfo.rollNumber}
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
            value={basicInfo.gender}
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
            value={basicInfo.dateOfBirth}
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
            value={basicInfo.personalEmail}
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
            value={basicInfo.collegeEmail}
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
            value={basicInfo.tenthPercentage}
            onWheel={(e) => e.target.blur()}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            12th Percentage *
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            name="twelfthPercentage"
            value={basicInfo.twelfthPercentage}
            onWheel={(e) => e.target.blur()}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
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
            value={basicInfo.diplomaPercentage}
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
            value={basicInfo.degree}
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
            value={basicInfo.department}
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
            value={basicInfo.graduationYear}
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
            CGPA *{" "}
            {(user?.role === "student" ||
              user?.role === "placement_representative") &&
              "(Cannot be edited)"}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="10"
            name="cgpa"
            value={basicInfo.cgpa}
            onWheel={(e) => e.target.blur()}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            disabled={
              user?.role === "student" ||
              user?.role === "placement_representative"
            }
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
            value={basicInfo.phoneNumber}
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
            value={basicInfo.linkedinUrl}
            onChange={handleBasicInfoChange}
            placeholder="https://linkedin.com/in/yourprofile"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            GitHub URL (Optional)
          </label>
          <input
            type="url"
            name="githubUrl"
            value={basicInfo.githubUrl}
            onChange={handleBasicInfoChange}
            placeholder="https://github.com/yourusername"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Current Backlogs *
          </label>
          <input
            type="number"
            min="0"
            name="currentBacklogs"
            value={basicInfo.currentBacklogs}
            onWheel={(e) => e.target.blur()}
            onChange={handleBasicInfoChange}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Resume URL *
          </label>
          <input
            type="url"
            name="resumeLink"
            value={basicInfo.resumeLink}
            onChange={handleBasicInfoChange}
            placeholder="https://drive.google.com/... or direct resume link"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Aadhaar Card URL *
          </label>
          <input
            type="url"
            name="aadharLink"
            value={basicInfo.aadharLink}
            onChange={handleBasicInfoChange}
            placeholder="https://drive.google.com/... or direct Aadhaar link"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            PAN Card URL *
          </label>
          <input
            type="url"
            name="panLink"
            value={basicInfo.panLink}
            onChange={handleBasicInfoChange}
            placeholder="https://drive.google.com/... or direct PAN link"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
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

            {basicInfo.historyOfBacklogs && basicInfo.historyOfBacklogs.length > 0 && (
              <div className="mt-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Added Backlogs:
                </h4>
                <div className="space-y-2">
                  {basicInfo.historyOfBacklogs.map((backlog, index) => (
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

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">
            Address *
          </label>
          <textarea
            name="address"
            value={basicInfo.address}
            onChange={handleBasicInfoChange}
            rows="3"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">
            About Me *
          </label>
          <textarea
            name="aboutMe"
            value={basicInfo.aboutMe}
            onChange={handleBasicInfoChange}
            rows="4"
            placeholder="Tell us about yourself, your interests, achievements, etc."
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">
            Skills *
          </label>
          <textarea
            name="skills"
            value={basicInfo.skills}
            onChange={handleBasicInfoChange}
            rows="3"
            placeholder="Enter your skills separated by commas (e.g., JavaScript, React, Node.js)"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            required
          />
        </div>
      </div>
      {validationErrors?.length > 0 && (
        <div className="p-3 bg-red-100 border border-red-600 text-red-600 rounded text-sm">
          Invalid fields: {validationErrors?.join(", ")}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={submitBasicInfo}
          disabled={loading}
          className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save & Continue"}
        </button>
      </div>
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
            accept="image/jpeg, image/jpg, image/png"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          />
          {user?.profile?.photo && (
            <div className="text-sm text-green-600 mt-1">
              Current: {user.profile.photo}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Resume * (PDF)
          </label>
          <input
            type="file"
            name="resume"
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          />
          {user?.profile?.resume && (
            <div className="text-sm text-green-600 mt-1">
              Current: {user.profile.resume}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            College ID Card * (JPEG/JPG/PNG/PDF)
          </label>
          <input
            type="file"
            name="collegeIdCard"
            onChange={handleFileChange}
            accept="image/jpeg, image/jpg, image/png, application/pdf"
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          />
          {user?.profile?.collegeIdCard && (
            <div className="text-sm text-green-600 mt-1">
              Current: {user.profile.collegeIdCard}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Marksheets * (All semesters) (JPEG/JPG/PNG/PDF, multiple files)
          </label>
          <input
            type="file"
            name="marksheets"
            onChange={handleFileChange}
            accept="image/jpeg, image/jpg, image/png, application/pdf"
            multiple
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          />
          {user?.profile?.marksheets?.length > 0 && (
            <div className="text-sm text-green-600 mt-1">
              Current: {user.profile.marksheets.length} files uploaded
            </div>
          )}
        </div>
      </div>

      {fileValidationErrors?.length > 0 && (
        <div className="p-3 bg-red-100 border border-red-600 text-red-600 rounded text-sm">
          Missing or invalid files: {fileValidationErrors?.join(", ")}
        </div>
      )}

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
          {loading ? "Updating..." : "Update Profile"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <img
                  src="/gct_logo.png"
                  alt="GCT Logo"
                  className="w-16 h-16 object-contain"
                />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Edit Profile
                  </h1>
                  <p className="text-gray-600">Update your profile information</p>
                </div>
              </div>
              <button
                onClick={() => navigate(-1)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="px-6 py-4">
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

            {/* Danger Zone for Account Deletion */}
            <div className="mt-10 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-medium text-red-600">Danger Zone</h3>
              <p className="mt-1 text-sm text-gray-500">
                Once you delete your account, there is no going back. Please be
                certain.
              </p>
              <button
                onClick={handleDeleteAccount}
                className="mt-4 bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 text-sm font-medium"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>

          {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-medium text-gray-900">
              Confirm Account Deletion
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              This action is irreversible. To confirm, please enter your
              password.
            </p>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Enter your password"
              />
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAccount}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
              >
                {deleteLoading ? "Deleting..." : "Delete My Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditProfile;
