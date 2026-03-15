import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";

const VerifyEmail = () => {
  const API_BASE = process.env.REACT_APP_API_BASE;
  const [searchParams] = useSearchParams();
  const { token: paramToken } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("verifying"); // verifying, success, error
  const [message, setMessage] = useState("");
  const requestInFlightRef = useRef(false);

  useEffect(() => {
    const verifyEmail = async () => {
      // Get token from either URL parameter or query string
      const token = (paramToken || searchParams.get("token") || "").trim();

      console.log("=== EMAIL VERIFICATION DEBUG ===");
      console.log("Token from params:", paramToken);
      console.log("Token from query:", searchParams.get("token"));
      console.log("Final token:", token);

      if (!token) {
        console.error("No token found in URL");
        setStatus("error");
        setMessage("Invalid verification link - no token provided");
        return;
      }

      const verificationCacheKey = `verified_token_${token}`;

      // Prevent duplicate verification requests (React strict mode/dev remounts).
      if (sessionStorage.getItem(verificationCacheKey) === "success") {
        setStatus("success");
        setMessage("Email verified successfully! You can now log in.");
        return;
      }

      // Prevent multiple requests
      if (status !== "verifying" || requestInFlightRef.current) {
        return;
      }

      try {
        requestInFlightRef.current = true;
        console.log("Verifying email with token:", token);

        const response = await axios.get(
          `${API_BASE}/api/auth/verify-email/${token}`
        );

        console.log("Verification response:", response.data);
        setStatus("success");
        setMessage("Email verified successfully! You can now log in.");
        sessionStorage.setItem(verificationCacheKey, "success");

        toast.success("Email verified successfully!", {
          duration: 4000,
          id: "email-verification-success",
        });

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate("/login");
        }, 3000);
      } catch (error) {
        console.error("Verification error:", error);
        setStatus("error");

        const errorMessage =
          error.response?.data?.message || "Email verification failed";
        setMessage(errorMessage);

        toast.error(errorMessage, {
          duration: 6000,
          id: "email-verification-error",
        });
      } finally {
        requestInFlightRef.current = false;
      }
    };

    verifyEmail();
  }, [paramToken, searchParams, navigate, status]);

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
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            {status === "verifying" && (
              <>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Verifying Email
                </h2>
                <p className="text-gray-600">
                  Please wait while we verify your email address...
                </p>
              </>
            )}

            {status === "success" && (
              <>
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-6 h-6 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    ></path>
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-green-600 mb-2">
                  Email Verification Successful!
                </h2>
                <p className="text-gray-600 mb-4">{message}</p>
                <p className="text-sm text-gray-500 mb-4">
                  Redirecting to login page in 3 seconds...
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => navigate("/login")}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mr-2"
                  >
                    Go to Login
                  </button>
                  <button
                    onClick={() => navigate("/register")}
                    className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                  >
                    Register Again
                  </button>
                </div>
              </>
            )}

            {status === "error" && (
              <>
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-6 h-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    ></path>
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-red-600 mb-2">
                  Verification Failed
                </h2>
                <p className="text-gray-600 mb-4">{message}</p>
                <div className="space-y-2">
                  <button
                    onClick={() => navigate("/login")}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mr-2"
                  >
                    Go to Login
                  </button>
                  <button
                    onClick={() => navigate("/register")}
                    className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                  >
                    Register Again
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
