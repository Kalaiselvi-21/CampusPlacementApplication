import { API_BASE } from '../config/api';
import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";

const EditJobDrive = () => {
    const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [locationInput, setLocationInput] = useState('');

  // Check if user is a PR (view-only for SPOC field)
  const isPR = user?.role === 'placement_representative' || user?.role === 'pr';

  // Determine return path based on current location or referrer
  const getReturnPath = () => {
    const currentPath = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const returnTo = searchParams.get("returnTo");

    if (returnTo) {
      return returnTo;
    }

    // If coming from all-job-drives page, return there
    if (document.referrer.includes("/all-job-drives")) {
      return "/all-job-drives";
    }

    // Default return path
    return "/job-drives";
  };

  const [formData, setFormData] = useState({
    // Basic Company Details
    companyName: '',
    companyWebsite: '',
    companyDescription: '',
    recruiterContact: {
      name: '',
      email: '',
      phone: ''
    },
    driveMode: 'on-campus',
    locations: [],
    
    // Job Role Details
    role: '',
    type: 'full-time',
    description: '',
    requirements: '',
    skills: '',
    
    // Package Details
    ctc: '',
    ctcBreakdown: {
      baseSalary: '',
      variablePay: '',
      joiningBonus: '',
      otherBenefits: ''
    },
    
    // Bond Details
    bond: '',
    bondDetails: {
      amount: '',
      duration: ''
    },
    
    // Enhanced Eligibility
    eligibility: {
      minCGPA: '',
      allowedDepartments: [],
      maxBacklogs: '',
      noCurrentBacklogs: false,
      historyOfArrears: false,
      allowedBatches: []
    },
    spocDept: '',
    
    // Special Conditions
    isDreamJob: false,
    unplacedOnly: false,
    
    // Drive Schedule
    date: '',
    time: '',
    deadline: '',
    applicationDeadlineTime: '',
    venue: '',
    
    // Selection Process
    selectionRounds: [
      {
        name: '',
        details: '',
        date: '',
        time: '',
        status: 'pending'
      }
    ]
  });

  const departments = [
    'Computer Science and Engineering',
    'Information Technology',
    'Electronics and Communication Engineering',
    'Electrical and Electronics Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
    'Production Engineering',
    'Industrial Biotechnology',
    'Electronic and Instrumentation Engineering'
  ];

  const batches = ['2024', '2025', '2026', '2027'];

  useEffect(() => {
    fetchJobDrive();
  }, [id]);

  const fetchJobDrive = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_BASE}/api/job-drives/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const drive = response.data.jobDrive;
      console.log("Fetched raw drive data:", drive);

      setFormData({
        // Basic Company Details
        companyName: drive.companyName || "",
        companyWebsite: drive.companyWebsite || "",
        companyDescription: drive.companyDescription || "",
        recruiterContact: {
          name: drive.recruiterContact?.name || "",
          email: drive.recruiterContact?.email || "",
          phone: drive.recruiterContact?.phone || ""
        },
        driveMode: drive.driveMode || "on-campus",
        locations: Array.isArray(drive.locations) ? drive.locations : (drive.location ? [drive.location] : []),
        
        // Job Role Details
        role: drive.role || "",
        type: drive.type || drive.jobType || "full-time",
        description: drive.description || "",
        requirements: drive.requirements || "",
        skills: Array.isArray(drive.skills) ? drive.skills.join(", ") : (drive.skills || ""),
        
        // Package Details
        ctc: drive.ctc ? drive.ctc.toString() : "",
        ctcBreakdown: {
          baseSalary: drive.ctcBreakdown?.baseSalary || "",
          variablePay: drive.ctcBreakdown?.variablePay || "",
          joiningBonus: drive.ctcBreakdown?.joiningBonus || "",
          otherBenefits: drive.ctcBreakdown?.otherBenefits || ""
        },
        
        // Bond Details
        bond: drive.bond || "",
        bondDetails: {
          amount: drive.bondDetails?.amount || "",
          duration: drive.bondDetails?.duration || ""
        },
        
        // Drive Details
        date: drive.date ? new Date(drive.date).toISOString().split('T')[0] : "",
        time: drive.time || "",
        deadline: drive.deadline ? new Date(drive.deadline).toISOString().split('T')[0] : "",
        applicationDeadlineTime: drive.applicationDeadlineTime || "", // This line was correct
        venue: drive.venue || "",
        
        // Selection Process - Handle both old and new formats
        selectionRounds: (() => {
          // If new format exists, use it
          if (Array.isArray(drive.selectionRounds) && drive.selectionRounds.length > 0) {
            return drive.selectionRounds.map(round => ({
              name: round.name || "",
              details: round.details || "",
              date: round.date ? new Date(round.date).toISOString().split('T')[0] : "",
              time: round.time || "",
              status: round.status || "pending",
              // Preserve existing selected students
              selectedStudents: round.selectedStudents || []
            }));
          }
          
          // If old format exists, convert it
          if (Array.isArray(drive.rounds) && drive.rounds.length > 0) {
            return drive.rounds.map(roundName => ({
              name: roundName,
              details: drive.testDetails || "",
              date: "",
              time: "",
              status: "pending",
              selectedStudents: []
            }));
          }
          
          // Default single round
          return [{
            name: "",
            details: "",
            date: "",
            time: "",
            status: "pending",
            selectedStudents: []
          }];
        })(),
        
        // Additional Settings
        isDreamJob: Boolean(drive.isDreamJob),
        unplacedOnly: Boolean(drive.unplacedOnly),
        
        // Eligibility Criteria
        eligibility: {
          minCGPA: drive.eligibility?.minCGPA || drive.eligibility?.cgpa || "",
          allowedDepartments: Array.isArray(drive.eligibility?.allowedDepartments) 
            ? drive.eligibility.allowedDepartments 
            : Array.isArray(drive.eligibility?.departments) 
              ? drive.eligibility.departments 
              : [],
          allowedBatches: Array.isArray(drive.eligibility?.allowedBatches) 
            ? drive.eligibility.allowedBatches 
            : Array.isArray(drive.eligibility?.batches) 
              ? drive.eligibility.batches 
              : [],
          maxBacklogs: drive.eligibility?.maxBacklogs || "",
          noCurrentBacklogs: Boolean(drive.eligibility?.noCurrentBacklogs),
          historyOfArrears: Boolean(drive.eligibility?.historyOfArrears),
        },
        spocDept: isPR ? (user?.profile?.department || "") : (drive.spocDept || ""),
      });

    } catch (error) {
      console.error("Error fetching job drive:", error);
      toast.error("Failed to fetch job drive details");
    } finally {
      setFetchLoading(false);
    }
  };

  // Reset SPOC if it's no longer in allowed departments
  useEffect(() => {
    if (formData.spocDept && formData.eligibility.allowedDepartments.length > 0 && !formData.eligibility.allowedDepartments.includes(formData.spocDept)) {
      setFormData(prev => ({ ...prev, spocDept: '' }));
    }
  }, [formData.eligibility.allowedDepartments]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
 // d:\College Placement Application\College-Placement-Application\frontend-web\src\components\EditJobDrive.jsx

// ... inside handleSubmit function, before try block ...

    // VALIDATION LOGIC
    const deadlineDate = new Date(formData.deadline);
    if (formData.applicationDeadlineTime) {
      const [h, m] = formData.applicationDeadlineTime.split(':');
      deadlineDate.setHours(parseInt(h), parseInt(m), 59, 999);
    } else {
      toast.error("Application Deadline Time is required");
      setLoading(false);
      return;
    }

    if (formData.eligibility.allowedDepartments.length > 1 && !formData.spocDept) {
      toast.error('SPOC Department is mandatory when multiple departments are eligible');
      setLoading(false);
      return;
    }

    const driveDate = new Date(formData.date);
    if (formData.time) {
      const [hours, minutes] = formData.time.split(':');
      driveDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else {
      driveDate.setHours(23, 59, 59);
    }

    // 1. Drive Date vs Deadline
    if (driveDate <= deadlineDate) {
      toast.error("Drive Date & Time must be AFTER Application Deadline");
      setLoading(false);
      return;
    }

    // Round Validations
    if (formData.selectionRounds && formData.selectionRounds.length > 0) {
      let previousRoundEnd = null;

      for (let i = 0; i < formData.selectionRounds.length; i++) {
        const round = formData.selectionRounds[i];
        
        if (!round.date) continue; // Skip if date not set

        const roundDate = new Date(round.date);
        if (round.time) {
          const [rh, rm] = round.time.split(':');
          roundDate.setHours(parseInt(rh), parseInt(rm), 0, 0);
        } else {
          roundDate.setHours(0, 0, 0); // Start of day default
        }

        // 2. Round vs Deadline
        if (roundDate <= deadlineDate) {
          toast.error(`Round ${i + 1} (${round.name}) must start AFTER Application Deadline`);
          setLoading(false);
          return;
        }

        // 3. Round Sequence (Next round after previous)
        if (previousRoundEnd && roundDate <= previousRoundEnd) {
          toast.error(`Round ${i + 1} must start AFTER Round ${i} ends`);
          setLoading(false);
          return;
        }
        
        previousRoundEnd = roundDate;
      }

      // 4. Drive End vs Last Round
      if (previousRoundEnd && driveDate <= previousRoundEnd) {
        toast.error("Drive Date & Time must be AFTER the last round");
        setLoading(false);
        return;
      }
    }

// ... proceed with axios.put ...

    try {
      const payload = {
        // Basic Company Details
        companyName: formData.companyName,
        companyWebsite: formData.companyWebsite,
        companyDescription: formData.companyDescription,
        recruiterContact: formData.recruiterContact,
        driveMode: formData.driveMode,
        locations: formData.locations,
        location: formData.locations[0] || "", // For backward compatibility
        
        // Job Role Details
        role: formData.role,
        type: formData.type,
        jobType: formData.type, // Backend expects both
        description: formData.description,
        requirements: formData.requirements,
        skills: formData.skills
          ? formData.skills.split(",").map((s) => s.trim()).filter((s) => s)
          : [],
        
        // Package Details
        ctc: parseFloat(formData.ctc) || 0,
        ctcBreakdown: formData.ctcBreakdown,
        
        // Bond Details
        bond: formData.bond,
        bondDetails: formData.bondDetails,
        
        // Drive Details
        date: formData.date,
        time: formData.time,
        deadline: formData.deadline,
        applicationDeadlineTime: formData.applicationDeadlineTime,
        venue: formData.venue,
        
        // Selection Process - Use selectionRounds
        selectionRounds: formData.selectionRounds,
        rounds: formData.selectionRounds.map(round => round.name).filter(name => name), // For backward compatibility
        
        // Additional Settings
        isDreamJob: formData.isDreamJob,
        unplacedOnly: formData.unplacedOnly,
        
        // Eligibility
        eligibility: {
          minCGPA: parseFloat(formData.eligibility.minCGPA) || 0,
          cgpa: parseFloat(formData.eligibility.minCGPA) || 0, // Backend compatibility
          maxBacklogs: parseInt(formData.eligibility.maxBacklogs) || 0,
          allowedDepartments: formData.eligibility.allowedDepartments,
          departments: formData.eligibility.allowedDepartments, // Backend compatibility
          allowedBatches: formData.eligibility.allowedBatches,
          batches: formData.eligibility.allowedBatches, // Backend compatibility
          noCurrentBacklogs: formData.eligibility.noCurrentBacklogs,
          historyOfArrears: formData.eligibility.historyOfArrears,
        },
        spocDept: formData.spocDept,
      };

      console.log("Update payload:", payload);

      const token = localStorage.getItem("token");
      await axios.put(`${API_BASE}/api/job-drives/${id}`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      toast.success("Job drive updated successfully!");
      navigate(getReturnPath());
    } catch (error) {
      console.error("Update error:", error);
      toast.error(
        error.response?.data?.message || "Failed to update job drive"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name.startsWith('eligibility.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        eligibility: {
          ...prev.eligibility,
          [field]: type === 'checkbox' ? checked : value
        }
      }));
    } else if (name.startsWith('ctcBreakdown.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        ctcBreakdown: {
          ...prev.ctcBreakdown,
          [field]: value
        }
      }));
    } else if (name.startsWith('bondDetails.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        bondDetails: {
          ...prev.bondDetails,
          [field]: value
        }
      }));
    } else if (name.startsWith('recruiterContact.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        recruiterContact: {
          ...prev.recruiterContact,
          [field]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const handleDepartmentChange = (dept) => {
    setFormData(prev => ({
      ...prev,
      eligibility: {
        ...prev.eligibility,
        allowedDepartments: prev.eligibility.allowedDepartments.includes(dept)
          ? prev.eligibility.allowedDepartments.filter(d => d !== dept)
          : [...prev.eligibility.allowedDepartments, dept]
      }
    }));
  };

  const handleBatchChange = (batch) => {
    setFormData(prev => ({
      ...prev,
      eligibility: {
        ...prev.eligibility,
        allowedBatches: prev.eligibility.allowedBatches.includes(batch)
          ? prev.eligibility.allowedBatches.filter(b => b !== batch)
          : [...prev.eligibility.allowedBatches, batch]
      }
    }));
  };

  const addLocation = () => {
    if (locationInput.trim() && !formData.locations.includes(locationInput.trim())) {
      setFormData(prev => ({
        ...prev,
        locations: [...prev.locations, locationInput.trim()]
      }));
      setLocationInput('');
    }
  };

  const removeLocation = (index) => {
    setFormData(prev => ({
      ...prev,
      locations: prev.locations.filter((_, i) => i !== index)
    }));
  };

  const addRound = () => {
    setFormData(prev => ({
      ...prev,
      selectionRounds: [...prev.selectionRounds, {
        name: "",
        details: "",
        date: "",
        time: "",
        status: "pending",
        selectedStudents: []
      }]
    }));
  };

  const removeRound = (index) => {
    setFormData(prev => ({
      ...prev,
      selectionRounds: prev.selectionRounds.filter((_, i) => i !== index)
    }));
  };

  const updateRound = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      selectionRounds: prev.selectionRounds.map((round, i) => 
        i === index ? { ...round, [field]: value } : round
      )
    }));
  };

  if (fetchLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading job drive details...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md">
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
                    Edit Job Drive
                  </h1>
                  <p className="text-gray-600">Update job drive information</p>
                </div>
              </div>
              <button
                onClick={() => navigate(getReturnPath())}
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

          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            {/* Company Details */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-4">Company Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Company Name *</label>
                  <input
                    type="text"
                    name="companyName"
                    value={formData.companyName || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Company Website</label>
                  <input
                    type="url"
                    name="companyWebsite"
                    value={formData.companyWebsite || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="https://company.com"
                  />
                </div>
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Company Description</label>
                <textarea
                  name="companyDescription"
                  value={formData.companyDescription || ''}
                  onChange={handleChange}
                  rows="3"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description about the company..."
                />
              </div>

              {/* Recruiter Contact */}
              <div className="mt-4">
                <h3 className="text-md font-medium mb-2">Recruiter Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Recruiter Name</label>
                    <input
                      type="text"
                      name="recruiterContact.name"
                      value={formData.recruiterContact?.name || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Recruiter Email</label>
                    <input
                      type="email"
                      name="recruiterContact.email"
                      value={formData.recruiterContact?.email || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Recruiter Phone</label>
                    <input
                      type="tel"
                      name="recruiterContact.phone"
                      value={formData.recruiterContact?.phone || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Job Role Details */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-4">Job Role Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Job Role *</label>
                  <input
                    type="text"
                    name="role"
                    value={formData.role || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Job Type *</label>
                  <select
                    name="type"
                    value={formData.type || 'full-time'}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="full-time">Full Time</option>
                    <option value="internship">Internship</option>
                    <option value="part-time">Part Time</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Job Description *</label>
                <textarea
                  name="description"
                  value={formData.description || ''}
                  onChange={handleChange}
                  rows="4"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Detailed job description..."
                  required
                />
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Requirements</label>
                <textarea
                  name="requirements"
                  value={formData.requirements || ''}
                  onChange={handleChange}
                  rows="3"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Job requirements and qualifications..."
                />
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Required Skills</label>
                <input
                  type="text"
                  name="skills"
                  value={formData.skills || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="React, Node.js, Python, etc. (comma separated)"
                />
              </div>
            </div>

            {/* Package Details */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-4">Package Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">CTC (LPA) *</label>
                  <input
                    type="number"
                    step="0.1"
                    name="ctc"
                    value={formData.ctc || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Bond</label>
                  <input
                    type="text"
                    name="bond"
                    value={formData.bond || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 2 years service bond"
                  />
                </div>
              </div>

              {/* CTC Breakdown */}
              <div className="mt-4">
                <h3 className="text-md font-medium mb-2">CTC Breakdown</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Base Salary (LPA)</label>
                    <input
                      type="number"
                      step="0.1"
                      name="ctcBreakdown.baseSalary"
                      value={formData.ctcBreakdown?.baseSalary || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Variable Pay (LPA)</label>
                    <input
                      type="number"
                      step="0.1"
                      name="ctcBreakdown.variablePay"
                      value={formData.ctcBreakdown?.variablePay || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Joining Bonus (LPA)</label>
                    <input
                      type="number"
                      step="0.1"
                      name="ctcBreakdown.joiningBonus"
                      value={formData.ctcBreakdown?.joiningBonus || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Other Benefits (LPA)</label>
                    <input
                      type="number"
                      step="0.1"
                      name="ctcBreakdown.otherBenefits"
                      value={formData.ctcBreakdown?.otherBenefits || ''}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Bond Details */}
              {formData.bond && (
                <div className="mt-4">
                  <h3 className="text-md font-medium mb-2">Bond Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Bond Amount (₹)</label>
                      <input
                        type="number"
                        name="bondDetails.amount"
                        value={formData.bondDetails?.amount || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Bond Duration (years)</label>
                      <input
                        type="number"
                        step="0.5"
                        name="bondDetails.duration"
                        value={formData.bondDetails?.duration || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Drive Details */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-4">Drive Schedule</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Drive Mode</label>
                  <select
                    name="driveMode"
                    value={formData.driveMode || 'on-campus'}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="on-campus">On Campus</option>
                    <option value="remote">Remote</option>
                    <option value="pooled-campus">Pooled Campus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Venue</label>
                  <input
                    type="text"
                    name="venue"
                    value={formData.venue || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Auditorium, Online, etc."
                  />
                </div>
              </div>

              {/* Locations */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Job Locations</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter location"
                  />
                  <button
                    type="button"
                    onClick={addLocation}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.locations.map((location, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                    >
                      {location}
                      <button
                        type="button"
                        onClick={() => removeLocation(index)}
                        className="ml-2 text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Drive Date *</label>
                  <input
                    type="date"
                    name="date"
                    value={formData.date || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Drive Time *</label>
                  <input
                    type="time"
                    name="time"
                    value={formData.time || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Application Deadline *</label>
                  <input
                    type="date"
                    name="deadline"
                    value={formData.deadline || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Application Deadline Time *</label>
                  <input
                    type="time"
                    name="applicationDeadlineTime"
                    value={formData.applicationDeadlineTime || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Selection Process */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Selection Process</h2>
                <button
                  type="button"
                  onClick={addRound}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Add Round
                </button>
              </div>
              
              {formData.selectionRounds.map((round, index) => (
                <div key={index} className="bg-white p-4 rounded-lg mb-4 border">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-medium">Round {index + 1}</h3>
                    {formData.selectionRounds.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRound(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Round Name</label>
                      <input
                        type="text"
                        value={round.name || ''}
                        onChange={(e) => updateRound(index, 'name', e.target.value)}
                        placeholder="e.g., Online Assessment, Technical Interview"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Round Details</label>
                      <textarea
                        value={round.details || ''}
                        onChange={(e) => updateRound(index, 'details', e.target.value)}
                        rows="3"
                        placeholder="Duration, format, topics, requirements..."
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Round Date</label>
                        <input
                          type="date"
                          value={round.date || ''}
                          onChange={(e) => updateRound(index, 'date', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Round Time</label>
                        <input
                          type="time"
                          value={round.time || ''}
                          onChange={(e) => updateRound(index, 'time', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Eligibility Criteria */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-4">Eligibility Criteria</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Minimum CGPA *</label>
                  <input
                    type="number"
                    step="0.01"
                    name="eligibility.minCGPA"
                    value={formData.eligibility?.minCGPA || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Maximum Backlogs</label>
                  <input
                    type="number"
                    name="eligibility.maxBacklogs"
                    value={formData.eligibility?.maxBacklogs || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Allowed Departments */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Allowed Departments</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {departments.map((dept) => (
                    <label key={dept} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.eligibility?.allowedDepartments?.includes(dept) || false}
                        onChange={() => handleDepartmentChange(dept)}
                        className="mr-2"
                      />
                      <span className="text-sm">{dept}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* SPOC Department Selection */}
              {formData.eligibility.allowedDepartments && formData.eligibility.allowedDepartments.length > 0 && (
                <div className={`mb-4 p-4 bg-blue-50 rounded-lg border border-blue-100 ${isPR ? 'opacity-75' : ''}`}>
                  <label className="block text-sm font-medium mb-2 text-blue-900">
                    SPOC Department {formData.eligibility.allowedDepartments.length > 1 && '*'}
                  </label>
                  <select
                    name="spocDept"
                    value={formData.spocDept}
                    onChange={!isPR ? handleChange : undefined}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required={formData.eligibility.allowedDepartments.length > 1}
                    disabled={isPR}
                  >
                    <option value="">-- Select SPOC Department --</option>
                    {formData.eligibility.allowedDepartments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                  {!isPR && (
                    <p className="text-xs text-blue-700 mt-2">
                      ℹ️ The selected SPOC department’s Placement Representatives will manage round-wise selection and final placements.
                    </p>
                  )}
                </div>
              )}

              {/* Allowed Batches */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Allowed Batches</label>
                <div className="flex flex-wrap gap-4">
                  {batches.map((batch) => (
                    <label key={batch} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.eligibility?.allowedBatches?.includes(batch) || false}
                        onChange={() => handleBatchChange(batch)}
                        className="mr-2"
                      />
                      <span className="text-sm">{batch}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Additional Eligibility Options */}
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="eligibility.noCurrentBacklogs"
                    checked={formData.eligibility?.noCurrentBacklogs || false}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span className="text-sm">No Current Backlogs Required</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="eligibility.historyOfArrears"
                    checked={formData.eligibility?.historyOfArrears || false}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span className="text-sm">Allow History of Arrears</span>
                </label>
              </div>
            </div>

            {/* Special Conditions */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-4">Special Conditions</h2>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="isDreamJob"
                    checked={formData.isDreamJob || false}
                    onChange={handleChange}
                    className="mr-3"
                  />
                  <div>
                    <span className="font-medium">Dream Job</span>
                    <p className="text-sm text-gray-600">Mark this as a dream job opportunity</p>
                  </div>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="unplacedOnly"
                    checked={formData.unplacedOnly || false}
                    onChange={handleChange}
                    className="mr-3"
                  />
                  <div>
                    <span className="font-medium">Unplaced Students Only</span>
                    <p className="text-sm text-gray-600">Only allow unplaced students to apply</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => navigate(getReturnPath())}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Updating..." : "Update Job Drive"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditJobDrive;
                
