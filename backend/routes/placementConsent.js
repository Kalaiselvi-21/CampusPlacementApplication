const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { auth } = require("../middleware/auth");
const { sendOTPEmail } = require("../services/emailService");
const logger = require("../services/database/logger");
const neonService = require("../services/database/neonService");
const { uploadMulterFileToS3 } = require("../services/storage/s3Upload");

const router = express.Router();

const isStudentOrPR = (user) => {
  const normalized =
    user?.roleNormalized ||
    String(user?.role || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  return (
    normalized === "student" ||
    normalized === "placement_representative" ||
    normalized === "pr"
  );
};

const os = require('os');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Invalid file type for signature"));
    }
  },
});

// Get placement policy
router.get("/policy", auth, async (req, res) => {
  try {
    // Allow both students and placement representatives
    if (!isStudentOrPR(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const placementPolicy = {
      title: "Government College of Technology - Placement Policy",
      content: `PLACEMENT POLICY AND CONDITIONS

1. GENERAL CONDITIONS
- Students must maintain minimum CGPA requirements throughout the placement process
- Students are expected to attend all placement activities punctually
- Professional behavior is mandatory during all interactions with recruiters

2. ELIGIBILITY CRITERIA
- Minimum CGPA as specified by individual companies
- No current backlogs (unless specified otherwise by company)
- Completion of all academic requirements

3. PLACEMENT PROCESS
- Students can apply to multiple companies based on eligibility
- Once selected by a company, students must honor the commitment
- Students cannot withdraw after accepting an offer without valid reasons

4. RESPONSIBILITIES
- Maintain confidentiality of company information
- Represent the college with dignity and professionalism
- Follow all guidelines provided by the placement cell

5. COMPLIANCE
- Violation of any policy may result in disqualification from placement activities
- The placement cell reserves the right to modify policies as needed
- Students must keep their profiles updated with accurate information

By agreeing to this policy, you confirm that you understand and will comply with all the above conditions.`,
      lastUpdated: new Date().toISOString(),
    };

    res.json({ policy: placementPolicy });
  } catch (error) {
    console.error("Error fetching placement policy:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Submit placement consent
router.post("/consent", auth, upload.single("signature"), async (req, res) => {
  try {
    console.log("=== CONSENT SUBMISSION ===");
    console.log("User ID:", req.user.id);
    console.log("User Role:", req.user.role);

    // Allow both students and placement representatives
    if (!isStudentOrPR(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const startTime = Date.now();

    // Use NeonDB only
    logger.logAttempt(
      "NEON",
      "READ",
      "User",
      `Fetching user for consent submission: ${req.user.id}`,
    );
    const user = await neonService.findUserById(req.user.id);

    if (!user) {
      logger.logFailure("NEON", "READ", "User", "User not found");
      return res.status(404).json({ message: "User not found" });
    }

    const duration = Date.now() - startTime;
    logger.logSuccess(
      "NEON",
      "READ",
      "User",
      "User found for consent",
      req.user.id,
    );
    logger.logPerformance("read", "User", duration, "NeonDB");

    const isProfileComplete =
      Boolean(user.profile?.isProfileComplete) ||
      Boolean(user.profile?.is_profile_complete) ||
      Number(user.profile?.profileCompletionPercentage || 0) >= 100;

    console.log("[CONSENT CHECK] Profile completion flags:", {
      isProfileComplete,
      "user.profile?.isProfileComplete": user.profile?.isProfileComplete,
      "user.profile?.is_profile_complete": user.profile?.is_profile_complete,
      profileCompletionPercentage: user.profile?.profileCompletionPercentage,
    });

    if (!user.profile || !isProfileComplete) {
      console.log(
        "[CONSENT CHECK] Profile not complete, blocking consent submission",
      );
      return res
        .status(403)
        .json({ message: "Profile must be completed first" });
    }

    const { hasAgreed } = req.body;

    if (!hasAgreed || hasAgreed !== "true") {
      return res.status(400).json({ message: "Consent agreement is required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Signature file is required" });
    }

    const signatureUpload = await uploadMulterFileToS3(req.file, {
      prefix: "signatures",
      keyPrefix: `${req.user.id}`,
    });

    // Generate OTP for verification (6-digit)
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    console.log("Generated OTP:", otpCode);

    try {
      logger.logAttempt(
        "NEON",
        "UPDATE",
        "User",
        `Saving consent and OTP for user`,
      );
      const saveStartTime = Date.now();

      // Save consent to NeonDB
      await neonService.submitPlacementConsent(req.user.id, {
        hasAgreed: true,
        signature: signatureUpload.url,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      console.log("Consent saved, now saving OTP to NeonDB...");
      // Also update OTP verification
      await neonService.updateOTPVerification(req.user.id, {
        otp_code: otpCode,
        otp_expires: otpExpires,
        otp_verified: false,
        otp_attempts: 0,
        last_otp_sent: new Date(),
      });
      console.log("✅ OTP saved to NeonDB successfully");

      const saveDuration = Date.now() - saveStartTime;
      logger.logSuccess(
        "NEON",
        "UPDATE",
        "User",
        `Consent saved in ${saveDuration}ms`,
        req.user.id,
      );
      logger.logPerformance("UPDATE", "User", saveDuration, "NeonDB");
    } catch (updateError) {
      console.error("❌ Error updating consent:", updateError);
      logger.logFailure("NEON", "UPDATE", "User", updateError);
      return res.status(500).json({
        message: "Failed to save consent and OTP. Please try again.",
        error: updateError.message,
      });
    }

    // Send OTP via email
    try {
      const userName = user.name || user.profile?.name || "User";
      await sendOTPEmail(user.email, otpCode, userName);
      console.log("✅ OTP email sent successfully");
    } catch (emailError) {
      console.error("❌ Failed to send OTP email:", emailError);
      // Continue with the process even if email fails
    }

    res.json({
      message:
        "Placement policy consent recorded successfully. Please check your email for the OTP verification code.",
      needsOtpVerification: true,
      email: user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
      database: "NEON",
    });
  } catch (error) {
    console.error("Error recording consent:", error);
    logger.logFailure("NEON", "UPDATE", "User", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Verify OTP
router.post("/verify-otp", auth, async (req, res) => {
  try {
    console.log("=== OTP VERIFICATION ===");
    console.log("User ID:", req.user.id);
    console.log("User Role:", req.user.role);

    // Allow both students and placement representatives
    if (!isStudentOrPR(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { otpCode } = req.body;

    if (!otpCode) {
      return res.status(400).json({ message: "OTP code is required" });
    }

    const startTime = Date.now();

    // Use NeonDB only
    logger.logAttempt(
      "NEON",
      "READ",
      "User",
      `Fetching user for OTP verification: ${req.user.id}`,
    );
    const user = await neonService.findUserById(req.user.id);

    if (!user) {
      logger.logFailure("NEON", "READ", "User", "User not found");
      return res.status(404).json({ message: "User not found" });
    }

    const duration = Date.now() - startTime;
    logger.logSuccess(
      "NEON",
      "READ",
      "User",
      "User found for OTP verification",
      req.user.id,
    );
    logger.logPerformance("read", "User", duration, "NeonDB");

    console.log("User found in NeonDB");
    console.log(
      "Verification Status:",
      JSON.stringify(user.verificationStatus, null, 2),
    );

    if (!user.verificationStatus) {
      return res
        .status(400)
        .json({ message: "No OTP found. Please request a new one." });
    }

    // Check if too many attempts
    if (user.verificationStatus.otpAttempts >= 3) {
      return res.status(429).json({
        message: "Too many failed attempts. Please request a new OTP.",
        needsNewOtp: true,
      });
    }

    if (!user.verificationStatus.otpCode) {
      return res
        .status(400)
        .json({ message: "No OTP found. Please request a new one." });
    }

    if (
      user.verificationStatus.otpExpires &&
      user.verificationStatus.otpExpires < new Date()
    ) {
      return res.status(400).json({
        message: "OTP has expired. Please request a new one.",
        expired: true,
      });
    }

    // Increment attempt counter
    const currentAttempts = (user.verificationStatus.otpAttempts || 0) + 1;
    await neonService.updateOTPVerification(req.user.id, {
      otp_attempts: currentAttempts,
    });

    console.log("Stored OTP:", user.verificationStatus.otpCode);
    console.log("Received OTP:", otpCode);

    if (user.verificationStatus.otpCode !== otpCode.toString()) {
      const attemptsLeft = 3 - currentAttempts;
      return res.status(400).json({
        message: `Invalid OTP code. ${attemptsLeft} attempts remaining.`,
        attemptsLeft: attemptsLeft,
      });
    }

    // Update verification status
    await neonService.updateOTPVerification(req.user.id, {
      otp_verified: true,
      is_verified: true,
      verified_at: new Date(),
      otp_code: null,
      otp_expires: null,
      otp_attempts: 0,
    });

    logger.logAttempt(
      "NEON",
      "UPDATE",
      "User",
      `Updating OTP verification status for user: ${user.email}`,
    );
    const saveStartTime = Date.now();
    logger.logSuccess(
      "NEON",
      "UPDATE",
      "User",
      `OTP verified and saved`,
      user.id,
    );
    const saveDuration = Date.now() - saveStartTime;
    logger.logPerformance("UPDATE", "User", saveDuration, "NeonDB");

    console.log("✅ OTP verified successfully");

    res.json({
      message: "OTP verified successfully. You can now access the dashboard.",
      verified: true,
      database: "NEON",
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    logger.logFailure("NEON", "UPDATE", "User", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Resend OTP
router.post("/resend-otp", auth, async (req, res) => {
  try {
    console.log("=== RESEND OTP ===");
    console.log("User ID:", req.user.id);

    // Allow both students and placement representatives
    if (!isStudentOrPR(req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Use NeonDB only
    logger.logAttempt(
      "NEON",
      "READ",
      "User",
      `Fetching user for resend OTP: ${req.user.id}`,
    );
    const user = await neonService.findUserById(req.user.id);

    if (!user) {
      logger.logFailure("NEON", "READ", "User", "User not found");
      return res.status(404).json({ message: "User not found" });
    }

    logger.logSuccess(
      "NEON",
      "READ",
      "User",
      "User found for resend OTP",
      req.user.id,
    );

    if (
      !user.placementPolicyConsent ||
      !user.placementPolicyConsent.hasAgreed
    ) {
      return res
        .status(400)
        .json({ message: "Please complete placement consent first" });
    }

    // Check resend limits (max 3 resends per session)
    if (user.verificationStatus?.otpResendCount >= 3) {
      return res.status(429).json({
        message:
          "Maximum resend limit reached. Please try again later or contact support.",
        maxLimitReached: true,
      });
    }

    // Check if last OTP was sent less than 30 seconds ago
    if (user.verificationStatus?.lastOtpSent) {
      const timeSinceLastOtp =
        Date.now() - new Date(user.verificationStatus.lastOtpSent).getTime();
      if (timeSinceLastOtp < 30000) {
        // 30 seconds
        const waitTime = Math.ceil((30000 - timeSinceLastOtp) / 1000);
        return res.status(429).json({
          message: `Please wait ${waitTime} seconds before requesting a new OTP.`,
          waitTime: waitTime,
        });
      }
    }

    // Generate new OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    console.log("Generated new OTP:", otpCode);

    // Update OTP in NeonDB
    const resendCount = (user.verificationStatus?.otpResendCount || 0) + 1;
    await neonService.updateOTPVerification(req.user.id, {
      otp_code: otpCode,
      otp_expires: otpExpires,
      otp_verified: false,
      last_otp_sent: new Date(),
      otp_attempts: 0, // Reset attempts
      otp_resend_count: resendCount,
    });
    logger.logAttempt(
      "NEON",
      "UPDATE",
      "User",
      `Updating OTP for resend: ${user.email}`,
    );

    // Send OTP via email
    try {
      await sendOTPEmail(user.email, otpCode, user.name);
      console.log("✅ New OTP email sent successfully");
    } catch (emailError) {
      console.error("❌ Failed to send OTP email:", emailError);
      return res
        .status(500)
        .json({ message: "Failed to send OTP email. Please try again." });
    }

    const remainingResends = 3 - resendCount;

    res.json({
      message: "New OTP sent to your email successfully.",
      email: user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
      remainingResends: remainingResends,
      database: "NEON",
    });
  } catch (error) {
    console.error("Error resending OTP:", error);
    logger.logFailure("NEON", "UPDATE", "User", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Check consent status
router.get("/status", auth, async (req, res) => {
  try {
    if (req.user.roleNormalized !== "student") {
      return res.status(403).json({ message: "Access denied" });
    }

    // Use NeonDB only
    let user = await neonService.findUserById(req.user.id);
    if (!user && req.user.email) {
      user = await neonService.findUserByEmail(req.user.email.toLowerCase());
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      profileComplete: user.profile?.isProfileComplete || false,
      consentGiven: user.placementPolicyConsent?.hasAgreed || false,
      consentDate: user.placementPolicyConsent?.agreedAt,
      otpVerified: user.verificationStatus?.otpVerified || false,
      isVerified: user.verificationStatus?.isVerified || false,
      canAccessDashboard:
        (user.profile?.isProfileComplete || false) &&
        (user.placementPolicyConsent?.hasAgreed || false) &&
        (user.verificationStatus?.otpVerified || false),
      database: "NEON",
    });
  } catch (error) {
    console.error("Error checking consent status:", error);
    logger.logFailure("NEON", "READ", "User", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
