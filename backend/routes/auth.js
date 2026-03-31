const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { auth } = require("../middleware/auth");
const logger = require("../services/database/logger");
const neonService = require("../services/database/neonService");
const databaseService = require("../services/database/databaseService");
const {
  sendVerificationEmail,
  generateVerificationToken,
} = require("../services/emailService");

const router = express.Router();

// Helper functions
const normalizeRole = (role) => {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
};

const isPlacementOfficerRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === "po" || normalized === "placement_officer";
};

const isValidUuid = (value) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
};

const toPublicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  isVerified: user.isVerified,
  profile: user.profile || {},
  isProfileComplete:
    user.profile?.isProfileComplete || user.isProfileComplete || false,
  profileCompletionPercentage:
    user.profile?.profileCompletionPercentage ||
    user.profileCompletionPercentage ||
    0,
  placementPolicyConsent: user.placementPolicyConsent || {
    hasAgreed: false,
  },
  verificationStatus: user.verificationStatus || {
    otpVerified: false,
    isVerified: false,
  },
});

// ==================== AUTHENTICATION ROUTES ====================

// Get current authenticated user
router.get("/me", auth, async (req, res) => {
  try {
    const user = await neonService.findUserById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user: toPublicUser(user) });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

// Register route
router.post("/register", async (req, res) => {
  try {
    let { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Normalize inputs
    email = email?.trim().toLowerCase();
    role = normalizeRole(role);

    // Check for existing user
    logger.logAttempt(
      "NEON",
      "READ",
      "User",
      `Checking existing user: ${email}`,
    );
    const existingUser = await neonService.findUserByEmail(email);

    if (existingUser) {
      logger.logFailure("NEON", "READ", "User", "User already exists");
      return res
        .status(400)
        .json({ message: "User already exists with this email" });
    }

    // For PR/PO roles, check allowlist
    if (role === "placement_representative" || role === "placement_officer") {
      console.log(
        `[REGISTRATION CHECK] Checking allowlist for email: ${email}, role: ${role}`,
      );
      const allowlistEntry = await neonService.findPRAllowlistByEmail(email);
      console.log(
        `[REGISTRATION CHECK] Allowlist entry found:`,
        allowlistEntry,
      );

      if (!allowlistEntry) {
        console.log(
          `[REGISTRATION CHECK] No allowlist entry found for ${email}`,
        );
        return res.status(403).json({
          message: `Your ${role === "placement_representative" ? "PR" : "PO"} registration request is not approved yet.`,
          requiresApproval: true,
        });
      }

      if (allowlistEntry.status !== "approved") {
        console.log(
          `[REGISTRATION CHECK] Allowlist entry status: ${allowlistEntry.status} for ${email}`,
        );
        return res.status(403).json({
          message: `Your ${role === "placement_representative" ? "PR" : "PO"} registration request is ${allowlistEntry.status}. Please wait for approval.`,
          status: allowlistEntry.status,
        });
      }
      console.log(`[REGISTRATION CHECK] Allowlist check passed for ${email}`);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create verification token
    const verificationToken = generateVerificationToken();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create user
    logger.logAttempt("NEON", "CREATE", "User", `Creating user: ${email}`);
    const userData = {
      name,
      email,
      password: hashedPassword,
      role,
      verificationToken,
      verificationTokenExpires,
      isVerified: false,
    };

    const newUser = await neonService.createUser(userData);
    logger.logSuccess(
      "NEON",
      "CREATE",
      "User",
      "User created successfully",
      newUser.id,
    );

    let verificationEmailSent = true;
    try {
      await sendVerificationEmail(newUser.email, verificationToken);
      logger.logSuccess(
        "EMAIL",
        "SEND",
        "Verification",
        `Verification email sent to ${newUser.email}`,
      );
    } catch (emailError) {
      verificationEmailSent = false;
      logger.logFailure("EMAIL", "SEND", "Verification", emailError);
    }

    res.status(201).json({
      message: verificationEmailSent
        ? "User registered successfully. Please check your email for verification."
        : "User registered successfully, but verification email could not be sent now. Please use resend verification on login.",
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
      verificationEmailSent,
      database: "NEON",
    });
  } catch (error) {
    console.error("Registration error:", error);
    logger.logFailure("NEON", "CREATE", "User", error);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    // Normalize email
    email = email?.trim().toLowerCase();

    logger.logAttempt("NEON", "READ", "User", `Login attempt: ${email}`);
    const startTime = Date.now();

    // Use NeonDB only
    const user = await neonService.findUserByEmail(email);

    if (!user) {
      logger.logFailure("NEON", "READ", "User", "User not found");
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const duration = Date.now() - startTime;
    logger.logSuccess(
      "NEON",
      "READ",
      "User",
      `User found in ${duration}ms`,
      user.id,
    );
    logger.logPerformance("read", "User", duration, "NeonDB");

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: "Please verify your email before logging in.",
        needsVerification: true,
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "7d" },
    );

    res.json({
      message: "Login successful",
      token,
      database: "NEON",
      user: toPublicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    logger.logFailure("NEON", "READ", "User", error);
    res.status(500).json({ message: "Server error during login" });
  }
});

// Verify email route
router.get("/verify-email/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();

    if (!token) {
      return res
        .status(400)
        .json({ message: "Verification token is required" });
    }

    const user = await neonService.findUserByVerificationToken(token);

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired verification token" });
    }

    await neonService.updateUserVerification(user.id, true);

    logger.logSuccess("NEON", "UPDATE", "User", "Email verified", user.id);
    res.json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Email verification error:", error);
    logger.logFailure("NEON", "UPDATE", "User", error);
    res.status(500).json({ message: "Server error during email verification" });
  }
});

// Resend verification email
router.post("/resend-verification", async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await neonService.findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    const verificationToken = generateVerificationToken();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await neonService.updateUserById(user.id, {
      verification_token: verificationToken,
      verification_token_expires: verificationTokenExpires,
    });

    await sendVerificationEmail(email, verificationToken);

    logger.logSuccess(
      "EMAIL",
      "SEND",
      "Verification",
      `Verification email resent to ${email}`,
      user.id,
    );
    res.json({ message: "Verification email sent successfully" });
  } catch (error) {
    console.error("Resend verification error:", error);
    logger.logFailure("EMAIL", "SEND", "Verification", error);
    res.status(500).json({ message: "Failed to send verification email" });
  }
});

// Delete account route
router.delete("/delete-account", auth, async (req, res) => {
  try {
    logger.logAttempt(
      "NEON",
      "DELETE",
      "User",
      `Deleting account for user: ${req.user.id}`,
    );

    const { password } = req.body;

    // Get user and verify password
    const user = await neonService.findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    // Use the new cleanup method that handles PR allowlist automatically
    await databaseService.deleteUserWithCleanup(req.user.id);

    res.json({ message: "Account deleted successfully." });
  } catch (error) {
    console.error("Account deletion error:", error);
    logger.logFailure("NEON", "DELETE", "User", error);
    res.status(500).json({ message: "Server error during account deletion" });
  }
});

// ==================== PR/PO ALLOWLIST MANAGEMENT ====================

// Get all allowlist requests (PO only)
router.get("/allowlist", auth, async (req, res) => {
  try {
    const user = await neonService.findUserById(req.user.id);

    if (!isPlacementOfficerRole(user.role)) {
      return res
        .status(403)
        .json({ message: "Only Placement Officers can manage allowlist" });
    }

    logger.logAttempt(
      "NEON",
      "READ",
      "PRAllowlist",
      "Fetching all allowlist requests",
    );
    const allowlistEntries = await neonService.getPRAllowlist();

    const stats = {
      pending: allowlistEntries.filter((e) => e.status === "pending").length,
      approved: allowlistEntries.filter((e) => e.status === "approved").length,
      rejected: allowlistEntries.filter((e) => e.status === "rejected").length,
    };

    logger.logSuccess(
      "NEON",
      "READ",
      "PRAllowlist",
      `Fetched ${allowlistEntries.length} entries`,
    );

    res.json({
      entries: allowlistEntries,
      stats,
      database: "NEON",
    });
  } catch (error) {
    console.error("Allowlist fetch error:", error);
    logger.logFailure("NEON", "READ", "PRAllowlist", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Create allowlist request
router.post("/allowlist/request", async (req, res) => {
  try {
    const { email, role, department, notes } = req.body;

    if (!email || !role) {
      return res.status(400).json({ message: "Email and role are required" });
    }

    if (role === "placement_representative" && !department) {
      return res.status(400).json({ message: "Department is required for PR" });
    }

    if (!email.match(/@gct\.ac\.in$/)) {
      return res
        .status(400)
        .json({ message: "Only @gct.ac.in emails allowed" });
    }

    // Check for existing entry
    const existing = await neonService.findPRAllowlistByEmail(email);
    if (existing) {
      return res.status(400).json({
        message: "Request already exists for this email",
        status: existing.status,
      });
    }

    logger.logAttempt(
      "NEON",
      "CREATE",
      "PRAllowlist",
      `Creating request for: ${email}`,
    );

    const allowlistEntry = await neonService.createPRAllowlistEntry({
      email: email.toLowerCase(),
      role,
      department: role === "placement_officer" ? null : department,
      notes: notes || null,
    });

    logger.logSuccess(
      "NEON",
      "CREATE",
      "PRAllowlist",
      "Request created",
      allowlistEntry.id,
    );

    res.status(201).json({
      message: "Registration request submitted. Please wait for approval.",
      requestId: allowlistEntry.id,
      database: "NEON",
    });
  } catch (error) {
    console.error("Allowlist request error:", error);
    logger.logFailure("NEON", "CREATE", "PRAllowlist", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Approve allowlist request
router.post("/allowlist/approve/:requestId", auth, async (req, res) => {
  try {
    if (!isValidUuid(req.params.requestId)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    const user = await neonService.findUserById(req.user.id);

    if (!isPlacementOfficerRole(user.role)) {
      return res
        .status(403)
        .json({ message: "Only Placement Officers can approve requests" });
    }

    logger.logAttempt(
      "NEON",
      "UPDATE",
      "PRAllowlist",
      `Approving request: ${req.params.requestId}`,
    );

    const allowlistEntry = await neonService.updatePRAllowlistEntry(
      req.params.requestId,
      {
        status: "approved",
        approved_by: req.user.id,
        approved_at: new Date(),
        rejection_reason: null,
        rejected_at: null,
        rejected_by: null,
      },
    );

    if (!allowlistEntry) {
      return res.status(404).json({ message: "Request not found" });
    }

    logger.logSuccess(
      "NEON",
      "UPDATE",
      "PRAllowlist",
      "Request approved",
      req.params.requestId,
    );

    res.json({
      message: "Request approved",
      data: allowlistEntry,
      database: "NEON",
    });
  } catch (error) {
    console.error("Allowlist approval error:", error);
    logger.logFailure("NEON", "UPDATE", "PRAllowlist", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Reject allowlist request
router.post("/allowlist/reject/:requestId", auth, async (req, res) => {
  try {
    if (!isValidUuid(req.params.requestId)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    const user = await neonService.findUserById(req.user.id);
    if (!isPlacementOfficerRole(user.role)) {
      return res
        .status(403)
        .json({ message: "Only Placement Officers can reject requests" });
    }

    const reason = String(req.body?.reason || "").trim();
    if (!reason) {
      return res.status(400).json({ message: "Rejection reason is required" });
    }

    logger.logAttempt(
      "NEON",
      "UPDATE",
      "PRAllowlist",
      `Rejecting request: ${req.params.requestId}`,
    );

    const allowlistEntry = await neonService.updatePRAllowlistEntry(
      req.params.requestId,
      {
        status: "rejected",
        rejected_by: req.user.id,
        rejected_at: new Date(),
        rejection_reason: reason,
        approved_at: null,
        approved_by: null,
      },
    );

    if (!allowlistEntry) {
      return res.status(404).json({ message: "Request not found" });
    }

    logger.logSuccess(
      "NEON",
      "UPDATE",
      "PRAllowlist",
      "Request rejected",
      req.params.requestId,
    );
    res.json({
      message: "Request rejected",
      data: allowlistEntry,
      database: "NEON",
    });
  } catch (error) {
    console.error("Allowlist rejection error:", error);
    logger.logFailure("NEON", "UPDATE", "PRAllowlist", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete allowlist entry
router.delete("/allowlist/:requestId", auth, async (req, res) => {
  try {
    if (!isValidUuid(req.params.requestId)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    const user = await neonService.findUserById(req.user.id);
    if (!isPlacementOfficerRole(user.role)) {
      return res.status(403).json({
        message: "Only Placement Officers can delete allowlist entries",
      });
    }

    logger.logAttempt(
      "NEON",
      "DELETE",
      "PRAllowlist",
      `Deleting request: ${req.params.requestId}`,
    );
    const deleted = await neonService.deletePRAllowlistEntry(
      req.params.requestId,
    );

    if (!deleted) {
      return res.status(404).json({ message: "Request not found" });
    }

    logger.logSuccess(
      "NEON",
      "DELETE",
      "PRAllowlist",
      "Request deleted",
      req.params.requestId,
    );
    res.json({ message: "Request deleted", database: "NEON" });
  } catch (error) {
    console.error("Allowlist delete error:", error);
    logger.logFailure("NEON", "DELETE", "PRAllowlist", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Check allowlist status
router.get("/allowlist/status", async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    logger.logAttempt(
      "NEON",
      "READ",
      "PRAllowlist",
      `Checking status for: ${email}`,
    );

    const entry = await neonService.findPRAllowlistByEmail(email);

    if (!entry) {
      return res.status(404).json({
        message: "No registration request found for this email",
        status: "not_found",
      });
    }

    logger.logSuccess(
      "NEON",
      "READ",
      "PRAllowlist",
      "Status checked",
      entry.id,
    );

    res.json({
      status: entry.status,
      role: entry.role,
      department: entry.department,
      rejectionReason: entry.rejection_reason,
      approvedDate: entry.approved_at || entry.approved_date || null,
      createdAt: entry.created_at,
      database: "NEON",
    });
  } catch (error) {
    console.error("Allowlist status error:", error);
    logger.logFailure("NEON", "READ", "PRAllowlist", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Resubmit rejected allowlist request
router.post("/allowlist/resubmit", async (req, res) => {
  try {
    const { email, role, department, notes } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    if (!email.match(/@gct\.ac\.in$/)) {
      return res
        .status(400)
        .json({ message: "Only @gct.ac.in emails allowed" });
    }

    const normalizedEmail = email.toLowerCase();
    const existing = await neonService.findPRAllowlistByEmail(normalizedEmail);

    if (!existing) {
      return res
        .status(404)
        .json({ message: "No registration request found for this email" });
    }

    if (existing.status !== "rejected") {
      return res.status(400).json({
        message: `Only rejected requests can be resubmitted. Current status: ${existing.status}`,
      });
    }

    const nextRole = role || existing.role;
    const nextDepartment =
      nextRole === "placement_officer"
        ? null
        : department || existing.department;

    if (nextRole === "placement_representative" && !nextDepartment) {
      return res.status(400).json({ message: "Department is required for PR" });
    }

    logger.logAttempt(
      "NEON",
      "UPDATE",
      "PRAllowlist",
      `Resubmitting request for: ${normalizedEmail}`,
    );

    const updated = await neonService.updatePRAllowlistEntry(existing.id, {
      status: "pending",
      role: nextRole,
      department: nextDepartment,
      notes: notes || existing.notes || null,
      requested_at: new Date(),
      approved_at: null,
      approved_by: null,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
    });

    if (!updated) {
      return res.status(404).json({ message: "Request not found" });
    }

    logger.logSuccess(
      "NEON",
      "UPDATE",
      "PRAllowlist",
      "Request resubmitted",
      updated.id,
    );

    res.json({
      message: "Request resubmitted successfully. Please wait for approval.",
      data: updated,
      database: "NEON",
    });
  } catch (error) {
    console.error("Allowlist resubmit error:", error);
    logger.logFailure("NEON", "UPDATE", "PRAllowlist", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
