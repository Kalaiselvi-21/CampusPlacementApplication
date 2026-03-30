import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { API_BASE } from '../config/api';

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "student",
  });
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: [],
  });

  const roles = [
    { value: "student", label: "Student" },
    { value: "placement_officer", label: "Placement Officer" },
    { value: "placement_representative", label: "Placement Representative" },
    { value: 'staff', label: 'Staff' }
  ];

  const checkPasswordStrength = (password) => {
    const checks = [
      { regex: /.{8,}/, message: "At least 8 characters" },
      { regex: /[A-Z]/, message: "One uppercase letter" },
      { regex: /[a-z]/, message: "One lowercase letter" },
      { regex: /\d/, message: "One digit" },
      { regex: /[@$!%*?&]/, message: "One special character" },
    ];

    const passed = checks.filter((check) => check.regex.test(password));
    const failed = checks.filter((check) => !check.regex.test(password));

    setPasswordStrength({
      score: passed.length,
      feedback: failed.map((check) => check.message),
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (name === "password") {
      checkPasswordStrength(value);
    }
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return false;
    }

    if (!formData.email.trim()) {
      toast.error("Email is required");
      return false;
    }

    if (formData.role === "student" && !formData.email.endsWith("@gct.ac.in")) {
      toast.error("Students must use institutional email (@gct.ac.in)");
      return false;
    }

    if (passwordStrength.score < 5) {
      toast.error("Password does not meet requirements");
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/api/auth/register`, {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        role: formData.role,
      });

      toast.success(
        "Registration successful! Please check your email to verify your account.",
      );
      navigate("/login", {
        state: {
          message: "Please verify your email before logging in",
          email: formData.email.toLowerCase(),
        },
      });
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Registration failed";
      console.error("Registration error:", error);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrengthColor = () => {
    if (passwordStrength.score < 2) return "bg-red-500";
    if (passwordStrength.score < 4) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getPasswordStrengthText = () => {
    if (passwordStrength.score < 2) return "Weak";
    if (passwordStrength.score < 4) return "Medium";
    return "Strong";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-4">
          <img
            src="/gct_logo.png"
            alt="GCT Logo"
            className="w-16 h-16 object-contain"
          />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Join the Campus Placement Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Name Field */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700"
              >
                Full Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={formData.name}
                onChange={handleChange}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter your full name"
              />
            </div>

            {/* Role Selection */}
            <div>
              <label
                htmlFor="role"
                className="block text-sm font-medium text-gray-700"
              >
                Role *
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              {(formData.role === 'placement_representative' || formData.role === 'placement_officer') && (
                <p className="mt-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                  💡 For PR/PO registration: <Link to="/request-pr-po" className="underline font-semibold hover:text-blue-800">Request access first</Link>, wait for PO approval, then register here.
                </p>
              )}
            </div>

            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email Address *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder={
                  formData.role === "student"
                    ? "your.name@gct.ac.in"
                    : "Enter your email"
                }
              />
              {formData.role === "student" && (
                <p className="mt-1 text-xs text-gray-500">
                  Students must use institutional email (@gct.ac.in)
                </p>
              )}
              {formData.role === "placement_representative" && (
                <p className="mt-1 text-xs text-gray-500">
                  PR must use institutional email (@gct.ac.in) - Must be approved by PO
                </p>
              )}
              {formData.role === "placement_officer" && (
                <p className="mt-1 text-xs text-gray-500">
                  PO must use institutional email (@gct.ac.in) - Must be approved by existing PO
                </p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Password *
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter your password"
              />

              {/* Password Strength Indicator */}
              {formData.password && (
                <div className="mt-2">
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${getPasswordStrengthColor()}`}
                        style={{
                          width: `${(passwordStrength.score / 5) * 100}%`,
                        }}
                      ></div>
                    </div>
                    <span className="text-xs font-medium text-gray-600">
                      {getPasswordStrengthText()}
                    </span>
                  </div>

                  {passwordStrength.feedback.length > 0 && (
                    <div className="mt-1">
                      <p className="text-xs text-gray-500">Missing:</p>
                      <ul className="text-xs text-red-500 list-disc list-inside">
                        {passwordStrength.feedback.map((feedback, index) => (
                          <li key={index}>{feedback}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Confirm Password Field */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700"
              >
                Confirm Password *
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Confirm your password"
              />
              {formData.confirmPassword &&
                formData.password !== formData.confirmPassword && (
                  <p className="mt-1 text-xs text-red-500">
                    Passwords do not match
                  </p>
                )}
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={loading || passwordStrength.score < 5}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating Account..." : "Create Account"}
              </button>
            </div>

            {/* Login Link */}
            <div className="text-center">
              <span className="text-sm text-gray-600">
                Already have an account?{" "}
                <Link
                  to="/login"
                  className="font-medium text-indigo-600 hover:text-indigo-500"
                >
                  Sign in
                </Link>
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Register;