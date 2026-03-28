import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";

const API_BASE = process.env.REACT_APP_API_BASE;

const FIELD_GROUPS = [
  {
    title: "Academic",
    fields: [
      "department",
      "degree",
      "cgpa",
      "currentBacklogs",
      "historyOfBacklogs.length",
      "tenthPercentage",
      "twelfthPercentage",
      "diplomaPercentage",
      "graduationYear",
    ],
  },
  {
    title: "Placement",
    fields: ["isPlaced", "currentOffer.company", "currentOffer.ctc"],
  },
  {
    title: "Personal",
    fields: ["gender", "age"],
  },
  {
    title: "URL Fields",
    fields: ["resumeURL", "aadharURL", "panURL", "linkedInURL", "githubURL"],
  },
];

const FIELD_LABELS = {
  department: "Department",
  degree: "Degree",
  cgpa: "CGPA",
  currentBacklogs: "Current Backlogs",
  "historyOfBacklogs.length": "History of Arrears",
  tenthPercentage: "10th Percentage",
  twelfthPercentage: "12th Percentage",
  diplomaPercentage: "Diploma Percentage",
  graduationYear: "Graduation Year",
  isPlaced: "Placed Status",
  "currentOffer.company": "Offer Company",
  "currentOffer.ctc": "Offer CTC",
  gender: "Gender",
  age: "Age",
  resumeURL: "Resume URL",
  aadharURL: "Aadhar URL",
  panURL: "PAN URL",
  linkedInURL: "LinkedIn URL",
  githubURL: "GitHub URL",
};

const SORT_FIELDS = [
  { value: "name", label: "Name" },
  { value: "cgpa", label: "CGPA" },
  { value: "graduationYear", label: "Graduation Year" },
  { value: "currentOfferCtc", label: "Offer CTC" },
  { value: "department", label: "Department" },
  { value: "currentBacklogs", label: "Current Backlogs" },
  { value: "tenthPercentage", label: "10th Percentage" },
  { value: "twelfthPercentage", label: "12th Percentage" },
  { value: "resumeURL", label: "Resume Link" },
  { value: "aadharURL", label: "Aadhar Link" },
  { value: "panURL", label: "PAN Link" },
];

const RANGE_FIELD_MAP = {
  cgpa: "cgpa",
  currentBacklogs: "currentBacklogs",
  "historyOfBacklogs.length": "historyOfBacklogsLength",
  tenthPercentage: "tenthPercentage",
  twelfthPercentage: "twelfthPercentage",
  diplomaPercentage: "diplomaPercentage",
  graduationYear: "graduationYear",
  "currentOffer.ctc": "currentOfferCtc",
};

const FUTURE_URL_FIELDS = [
  "resumeURL",
  "aadharURL",
  "panURL",
  "linkedInURL",
  "githubURL",
];

const FULL_TABLE_COLUMNS = [
  { key: "sno", header: "S.No", getter: (_, index) => index + 1 },
  { key: "name", header: "Name", getter: (student) => student.name },
  {
    key: "personalEmail",
    header: "Personal Email",
    getter: (student) => student.personalEmail,
  },
  {
    key: "collegeEmail",
    header: "College Email",
    getter: (student) => student.collegeEmail,
  },
  { key: "rollNumber", header: "Roll No", getter: (student) => student.rollNumber },
  { key: "department", header: "Department", getter: (student) => student.department },
  { key: "degree", header: "Degree", getter: (student) => student.degree },
  { key: "graduationYear", header: "Grad Year", getter: (student) => student.graduationYear },
  { key: "cgpa", header: "CGPA", getter: (student) => student.cgpa },
  { key: "gender", header: "Gender", getter: (student) => student.gender },
  {
    key: "dateOfBirth",
    header: "DOB",
    getter: (student) =>
      student.dateOfBirth && student.dateOfBirth !== "N/A"
        ? new Date(student.dateOfBirth).toLocaleDateString()
        : "N/A",
  },
  { key: "phoneNumber", header: "Phone", getter: (student) => student.phoneNumber },
  { key: "address", header: "Address", getter: (student) => student.address },
  { key: "tenthPercentage", header: "10th %", getter: (student) => student.tenthPercentage },
  { key: "twelfthPercentage", header: "12th %", getter: (student) => student.twelfthPercentage },
  { key: "diplomaPercentage", header: "Diploma %", getter: (student) => student.diplomaPercentage },
  { key: "linkedinUrl", header: "LinkedIn", getter: (student) => student.linkedinUrl },
  { key: "githubUrl", header: "GitHub", getter: (student) => student.githubUrl },
  { key: "resumeURL", header: "Resume URL", getter: (student) => student.resumeURL || "N/A" },
  { key: "aadharURL", header: "Aadhar URL", getter: (student) => student.aadharURL || "N/A" },
  { key: "panURL", header: "PAN URL", getter: (student) => student.panURL || "N/A" },
  { key: "currentBacklogs", header: "Backlogs", getter: (student) => student.currentBacklogs },
  {
    key: "historyOfBacklogs",
    header: "Backlog History",
    getter: (student) =>
      Array.isArray(student.historyOfBacklogs) && student.historyOfBacklogs.length > 0
        ? student.historyOfBacklogs.map((b) => `${b.subject}-${b.semester}`).join(", ")
        : "None",
  },
  { key: "aboutMe", header: "About Me", getter: (student) => student.aboutMe },
  {
    key: "skills",
    header: "Skills",
    getter: (student) =>
      Array.isArray(student.skills) ? student.skills.join(", ") : student.skills || "N/A",
  },
  {
    key: "placementStatus",
    header: "Placement Status",
    getter: (student) => (student.isPlaced ? "Placed" : "Not Placed"),
  },
  {
    key: "consentStatus",
    header: "Consent Status",
    getter: (student) => (student.placementConsent?.hasConsented ? "Signed" : "Not Signed"),
  },
  {
    key: "resumeDocument",
    header: "Resume",
    getter: (student) => (student.documents?.resume ? "View Resume" : "N/A"),
  },
  {
    key: "idCardDocument",
    header: "ID Card",
    getter: (student) =>
      student.documents?.collegeIdCard ? "View ID Card" : "N/A",
  },
  {
    key: "marksheetDocument",
    header: "Marksheet",
    getter: (student) =>
      Array.isArray(student.documents?.marksheets) &&
      student.documents.marksheets.length > 0
        ? "View Marksheet"
        : "N/A",
  },
  {
    key: "digitalSignature",
    header: "Digital Signature",
    getter: (student) => (student.placementConsent?.signature ? "View Signature" : "No Signature"),
  },
  {
    key: "otpVerified",
    header: "OTP Verified",
    getter: (student) => (student.otpVerified ? "Verified" : "Not Verified"),
  },
  {
    key: "profileStatus",
    header: "Profile Status",
    getter: (student) => (student.profileComplete ? "Complete" : "Incomplete"),
  },
  {
    key: "registeredAt",
    header: "Registered",
    getter: (student) =>
      student.registeredAt ? new Date(student.registeredAt).toLocaleDateString() : "N/A",
  },
];

const EXTRA_FILTER_COLUMNS = [
  { key: "currentOfferCompany", header: "Offer Company", getter: (student) => student.currentOffer?.company || "N/A" },
  { key: "currentOfferCtc", header: "Offer CTC", getter: (student) => student.currentOffer?.ctc ?? "N/A" },
  { key: "age", header: "Age", getter: (student) => student.age ?? "N/A" },
  { key: "linkedInURL", header: "LinkedIn URL", getter: (student) => student.linkedInURL || "N/A" },
  { key: "githubURL", header: "GitHub URL", getter: (student) => student.githubURL || "N/A" },
];

const FILTER_FIELD_TO_COLUMN_KEY = {
  department: "department",
  degree: "degree",
  cgpa: "cgpa",
  currentBacklogs: "currentBacklogs",
  "historyOfBacklogs.length": "historyOfBacklogs",
  tenthPercentage: "tenthPercentage",
  twelfthPercentage: "twelfthPercentage",
  diplomaPercentage: "diplomaPercentage",
  graduationYear: "graduationYear",
  isPlaced: "placementStatus",
  "currentOffer.company": "currentOfferCompany",
  "currentOffer.ctc": "currentOfferCtc",
  gender: "gender",
  age: "age",
  resumeURL: "resumeURL",
  aadharURL: "aadharURL",
  panURL: "panURL",
  linkedInURL: "linkedInURL",
  githubURL: "githubURL",
};

const ALL_COLUMNS_BY_KEY = [...FULL_TABLE_COLUMNS, ...EXTRA_FILTER_COLUMNS].reduce(
  (acc, col) => {
    acc[col.key] = col;
    return acc;
  },
  {}
);

const StudentDetails = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [queryLoading, setQueryLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedAboutMe, setExpandedAboutMe] = useState({});
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);
  const [appliedSelectedFields, setAppliedSelectedFields] = useState([]);

  const [selectedFields, setSelectedFields] = useState([
    "department",
    "isPlaced",
    "cgpa",
  ]);
  const [conditions, setConditions] = useState({
    department: [],
    degree: [],
    gender: [],
    currentOfferCompany: [],
    age: { min: "", max: "" },
    isPlaced: null,
    urlChecks: {},
  });
  const [sort, setSort] = useState({
    field: "cgpa",
    order: "desc",
  });

  const getFileHref = (fileUrl) => {
    if (!fileUrl) return null;
    const value = String(fileUrl).trim();
    if (!value) return null;

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    if (value.startsWith("/")) {
      return `${API_BASE}${value}`;
    }

    return `${API_BASE}/${value}`;
  };

  const getSignatureHref = (signatureUrl) => getFileHref(signatureUrl);

  const rangeState = useMemo(() => {
    if (!meta?.ranges) return {};
    const initial = {};
    Object.keys(meta.ranges).forEach((key) => {
      initial[key] = {
        min: meta.ranges[key].min,
        max: meta.ranges[key].max,
      };
    });
    return initial;
  }, [meta]);

  const activeTableColumns = useMemo(() => {
    if (!hasAppliedFilters) {
      return FULL_TABLE_COLUMNS;
    }

    const columnKeys = [
      "sno",
      "name",
      "personalEmail",
      "collegeEmail",
      "rollNumber",
    ];
    appliedSelectedFields.forEach((field) => {
      const mapped = FILTER_FIELD_TO_COLUMN_KEY[field];
      if (mapped && !columnKeys.includes(mapped)) {
        columnKeys.push(mapped);
      }
    });

    return columnKeys
      .map((key) => ALL_COLUMNS_BY_KEY[key])
      .filter(Boolean);
  }, [hasAppliedFilters, appliedSelectedFields]);

  useEffect(() => {
    if (!user || (user.role !== "po" && user.role !== "placement_officer")) {
      navigate("/login");
      return;
    }
    loadInitialData();
  }, [user, navigate]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const [metaResponse, studentsResponse] = await Promise.all([
        axios.get(`${API_BASE}/api/users/students-details/meta`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_BASE}/api/users/students-details`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setMeta(metaResponse.data);
      setStudents(studentsResponse.data.students || []);
    } catch (error) {
      console.error("Failed to load student details:", error);
      toast.error("Failed to load student details");
    } finally {
      setLoading(false);
    }
  };

  const updateRangeCondition = (field, key, value) => {
    const mappedKey = RANGE_FIELD_MAP[field];
    if (!mappedKey) return;
    setConditions((prev) => ({
      ...prev,
      [mappedKey]: {
        ...(prev[mappedKey] || { ...rangeState[mappedKey] }),
        [key]: value === "" ? "" : Number(value),
      },
    }));
  };

  const toggleFieldSelection = (field) => {
    setSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const toggleMultiSelectValue = (conditionKey, value) => {
    setConditions((prev) => {
      const currentValues = prev[conditionKey] || [];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];
      return { ...prev, [conditionKey]: nextValues };
    });
  };

  const applyFilters = async () => {
    setQueryLoading(true);
    try {
      const token = localStorage.getItem("token");
      const payload = {
        selectedFields,
        conditions,
        sort,
      };

      const response = await axios.post(
        `${API_BASE}/api/users/students-details/query`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setStudents(response.data.students || []);
      setHasAppliedFilters(true);
      setAppliedSelectedFields([...selectedFields]);
      setDrawerOpen(false);
    } catch (error) {
      console.error("Failed to query students:", error);
      toast.error("Failed to apply filters");
    } finally {
      setQueryLoading(false);
    }
  };

  const clearFilters = async () => {
    setSelectedFields(["department", "isPlaced", "cgpa"]);
    setConditions({
      department: [],
      degree: [],
      gender: [],
      currentOfferCompany: [],
      age: { min: "", max: "" },
      isPlaced: null,
      urlChecks: {},
    });
    setSort({ field: "cgpa", order: "desc" });
    setHasAppliedFilters(false);
    setAppliedSelectedFields([]);
    await loadInitialData();
  };

  const toggleAboutMe = (studentId) => {
    setExpandedAboutMe((prev) => ({
      ...prev,
      [studentId]: !prev[studentId],
    }));
  };

  const getDepartmentOptions = () => {
    return (meta?.options?.department || []).filter(
      (dept) => String(dept || "").trim().toLowerCase() !== "cse"
    );
  };

  const buildMultiSelectControl = (field, options, conditionKey) => (
    <div className="space-y-2">
      <h4 className="font-semibold text-sm">{FIELD_LABELS[field]}</h4>
      <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-2">
        {options.length === 0 ? (
          <p className="text-xs text-gray-500">No options found</p>
        ) : (
          options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={(conditions[conditionKey] || []).includes(option)}
                onChange={() => toggleMultiSelectValue(conditionKey, option)}
              />
              {option}
            </label>
          ))
        )}
      </div>
    </div>
  );

  const buildRangeControl = (field) => {
    const mappedKey = RANGE_FIELD_MAP[field];
    const range = meta?.ranges?.[mappedKey];
    if (!mappedKey || !range) return null;
    const selected = conditions[mappedKey] || range;

    return (
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">{FIELD_LABELS[field]}</h4>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">Min</label>
            <input
              type="number"
              step={range.step}
              min={range.min}
              max={range.max}
              value={selected.min ?? ""}
              onChange={(e) => updateRangeCondition(field, "min", e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <input
              type="range"
              step={range.step}
              min={range.min}
              max={range.max}
              value={selected.min ?? range.min}
              onChange={(e) => updateRangeCondition(field, "min", e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Max</label>
            <input
              type="number"
              step={range.step}
              min={range.min}
              max={range.max}
              value={selected.max ?? ""}
              onChange={(e) => updateRangeCondition(field, "max", e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <input
              type="range"
              step={range.step}
              min={range.min}
              max={range.max}
              value={selected.max ?? range.max}
              onChange={(e) => updateRangeCondition(field, "max", e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderConditionControl = (field) => {
    if (field === "department") {
      return buildMultiSelectControl(
        field,
        getDepartmentOptions(),
        "department"
      );
    }
    if (field === "degree") {
      return buildMultiSelectControl(field, meta?.options?.degree || [], "degree");
    }
    if (field === "gender") {
      return buildMultiSelectControl(field, meta?.options?.gender || [], "gender");
    }
    if (field === "currentOffer.company") {
      return buildMultiSelectControl(
        field,
        meta?.options?.currentOfferCompany || [],
        "currentOfferCompany"
      );
    }
    if (field === "isPlaced") {
      return (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Placed Status</h4>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="isPlaced"
                checked={conditions.isPlaced === null}
                onChange={() => setConditions((prev) => ({ ...prev, isPlaced: null }))}
              />
              All
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="isPlaced"
                checked={conditions.isPlaced === true}
                onChange={() => setConditions((prev) => ({ ...prev, isPlaced: true }))}
              />
              Yes (Placed)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="isPlaced"
                checked={conditions.isPlaced === false}
                onChange={() => setConditions((prev) => ({ ...prev, isPlaced: false }))}
              />
              No (Not Placed)
            </label>
          </div>
        </div>
      );
    }
    if (field === "age") {
      return (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Age (Derived from DOB)</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">From Age</label>
              <input
                type="number"
                min={0}
                value={conditions.age?.min ?? ""}
                onChange={(e) =>
                  setConditions((prev) => ({
                    ...prev,
                    age: { ...(prev.age || {}), min: e.target.value },
                  }))
                }
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">To Age</label>
              <input
                type="number"
                min={0}
                value={conditions.age?.max ?? ""}
                onChange={(e) =>
                  setConditions((prev) => ({
                    ...prev,
                    age: { ...(prev.age || {}), max: e.target.value },
                  }))
                }
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>
      );
    }

    if (FUTURE_URL_FIELDS.includes(field)) {
      return (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">{FIELD_LABELS[field]}</h4>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`url-check-${field}`}
                checked={!conditions.urlChecks?.[field]}
                onChange={() =>
                  setConditions((prev) => ({
                    ...prev,
                    urlChecks: { ...(prev.urlChecks || {}), [field]: undefined },
                  }))
                }
              />
              All
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`url-check-${field}`}
                checked={conditions.urlChecks?.[field] === "has"}
                onChange={() =>
                  setConditions((prev) => ({
                    ...prev,
                    urlChecks: { ...(prev.urlChecks || {}), [field]: "has" },
                  }))
                }
              />
              Has Link
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`url-check-${field}`}
                checked={conditions.urlChecks?.[field] === "missing"}
                onChange={() =>
                  setConditions((prev) => ({
                    ...prev,
                    urlChecks: { ...(prev.urlChecks || {}), [field]: "missing" },
                  }))
                }
              />
              Missing Link
            </label>
          </div>
        </div>
      );
    }

    return buildRangeControl(field);
  };

  const downloadStudentsCSV = () => {
    if (!students.length) {
      toast.error("No student data to download");
      return;
    }

    const headers = activeTableColumns.map((col) => col.header);
    const rows = students.map((student, index) => [
      ...activeTableColumns.map((col) => col.getter(student, index)),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `students_details_filtered_${new Date().toISOString().slice(0, 10)}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <img src="/gct_logo.png" alt="GCT Logo" className="w-16 h-16 object-contain" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Student Details</h1>
              <p className="text-gray-600 mt-1">
                Dynamic Filter & Sort ({students.length} students shown)
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={downloadStudentsCSV}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Download CSV
            </button>
            <button
              onClick={() => navigate("/po-dashboard")}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-3 items-center">
          <button
            onClick={() => setDrawerOpen(true)}
            className="px-4 py-2 border rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-medium"
          >
            Filter & Sort
          </button>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Sort By</label>
            <select
              value={sort.field}
              onChange={(e) => setSort((prev) => ({ ...prev, field: e.target.value }))}
              className="border rounded px-2 py-1 text-sm"
            >
              {SORT_FIELDS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={sort.order}
              onChange={(e) => setSort((prev) => ({ ...prev, order: e.target.value }))}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <button
              onClick={applyFilters}
              disabled={queryLoading}
              className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {queryLoading ? "Applying..." : "Apply"}
            </button>
          </div>
          <button
            onClick={clearFilters}
            className="ml-auto px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 rounded"
          >
            Clear All
          </button>
        </div>

        <div className="bg-white shadow rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {activeTableColumns.map((column) => (
                  <th
                    key={column.key}
                    className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {students.map((student, index) => (
                <tr key={student._id} className="hover:bg-gray-50">
                  {activeTableColumns.map((column) => (
                    <td key={`${student._id}-${column.key}`} className="px-3 py-3 text-sm">
                      {column.key === "placementStatus" ? (
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            student.isPlaced ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {column.getter(student, index)}
                        </span>
                      ) : column.key === "consentStatus" ? (
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            student.placementConsent?.hasConsented
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {column.getter(student, index)}
                        </span>
                      ) : column.key === "digitalSignature" && student.placementConsent?.signatureUrl ? (
                        <a
                          href={getSignatureHref(student.placementConsent.signatureUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          View Signature
                        </a>
                      ) : column.key === "resumeDocument" && student.documents?.resume ? (
                        <a
                          href={getFileHref(student.documents.resume)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          View Resume
                        </a>
                      ) : column.key === "idCardDocument" && student.documents?.collegeIdCard ? (
                        <a
                          href={getFileHref(student.documents.collegeIdCard)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          View ID Card
                        </a>
                      ) :
                        column.key === "marksheetDocument" &&
                        Array.isArray(student.documents?.marksheets) &&
                        student.documents.marksheets.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {student.documents.marksheets.map((marksheetUrl, fileIndex) => (
                            <a
                              key={`${student._id}-marksheet-${fileIndex}`}
                              href={getFileHref(marksheetUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {`View${fileIndex + 1}`}
                            </a>
                          ))}
                        </div>
                      ) : column.key === "otpVerified" ? (
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            student.otpVerified ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {column.getter(student, index)}
                        </span>
                      ) : column.key === "profileStatus" ? (
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            student.profileComplete
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {column.getter(student, index)}
                        </span>
                      ) : column.key === "linkedinUrl" || column.key === "githubUrl" ? (
                        column.getter(student, index) !== "N/A" ? (
                          <a
                            href={column.getter(student, index)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          "N/A"
                        )
                      ) : column.key === "resumeURL" ? (
                        column.getter(student, index) !== "N/A" ? (
                          <a
                            href={
                              String(column.getter(student, index)).startsWith("http")
                                ? column.getter(student, index)
                                : `${API_BASE}${column.getter(student, index)}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          "N/A"
                        )
                      ) : column.key === "aadharURL" || column.key === "panURL" ? (
                        column.getter(student, index) !== "N/A" ? (
                          <a
                            href={
                              String(column.getter(student, index)).startsWith("http")
                                ? column.getter(student, index)
                                : `${API_BASE}${column.getter(student, index)}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          "N/A"
                        )
                      ) : column.key === "linkedInURL" || column.key === "githubURL" ? (
                        column.getter(student, index) !== "N/A" ? (
                          <a
                            href={column.getter(student, index)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          "N/A"
                        )
                      ) : column.key === "aboutMe" ? (
                        (() => {
                          const fullText = column.getter(student, index) || "N/A";
                          const isExpanded = !!expandedAboutMe[student._id];
                          const shouldTruncate =
                            typeof fullText === "string" && fullText.length > 90;
                          const displayText =
                            shouldTruncate && !isExpanded
                              ? `${fullText.slice(0, 90)}...`
                              : fullText;

                          return (
                            <div className="max-w-xs">
                              <span>{displayText}</span>
                              {shouldTruncate && (
                                <button
                                  type="button"
                                  onClick={() => toggleAboutMe(student._id)}
                                  className="ml-2 text-blue-600 hover:underline text-xs"
                                >
                                  {isExpanded ? "Read less" : "Read more"}
                                </button>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        column.getter(student, index)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {students.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              No students match the selected filters.
            </div>
          )}
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
          <div className="absolute inset-0 z-0 bg-slate-900/5 backdrop-blur-[2px] pointer-events-none" />
          <div className="relative z-10 w-full max-w-md h-full bg-white shadow-xl overflow-y-auto pointer-events-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">Filter & Sort</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-2xl">
                x
              </button>
            </div>

            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold uppercase text-gray-500 mb-3">
                Phase 1 - Field Selection
              </h3>
              <div className="space-y-4">
                {FIELD_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="font-semibold text-sm mb-2">{group.title}</p>
                    <div className="space-y-2">
                      {group.fields.map((field) => (
                        <label key={field} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedFields.includes(field)}
                            onChange={() => toggleFieldSelection(field)}
                          />
                          {FIELD_LABELS[field]}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 space-y-4">
              <h3 className="text-sm font-semibold uppercase text-gray-500">
                Phase 2 - Conditions Builder
              </h3>
              {selectedFields.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Select fields in Phase 1 to configure filter conditions.
                </p>
              ) : (
                selectedFields.map((field) => (
                  <div key={field} className="p-3 border rounded-lg bg-gray-50">
                    {renderConditionControl(field)}
                  </div>
                ))
              )}

              <div className="pt-4 border-t">
                <h3 className="text-sm font-semibold uppercase text-gray-500 mb-2">
                  Sort
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={sort.field}
                    onChange={(e) =>
                      setSort((prev) => ({ ...prev, field: e.target.value }))
                    }
                    className="border rounded px-2 py-2 text-sm"
                  >
                    {SORT_FIELDS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sort.order}
                    onChange={(e) =>
                      setSort((prev) => ({ ...prev, order: e.target.value }))
                    }
                    className="border rounded px-2 py-2 text-sm"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-white sticky bottom-0 flex gap-2">
              <button
                onClick={applyFilters}
                disabled={queryLoading}
                className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {queryLoading ? "Applying..." : "View"}
              </button>
              <button
                onClick={clearFilters}
                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded hover:bg-gray-300"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDetails;
