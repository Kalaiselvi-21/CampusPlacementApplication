const express = require("express");
const multer = require("multer");
const path = require("path");
const auth = require("../middleware/auth").auth;
const { emitProfileUpdate } = require("../utils/socketUtils");
const logger = require("../services/database/logger");
const neonService = require("../services/database/neonService");
const { sequelize } = require("../config/neonConnection");

const router = express.Router();

const normalizePlacementStatus = (value) => {
  if (!value) return value;
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized === "not_placed" || normalized === "notplaced") return "unplaced";
  if (normalized === "placed") return "placed";
  if (normalized === "shortlisted") return "shortlisted";
  if (normalized === "unplaced") return "unplaced";
  return value;
};

const resolveNeonUser = async (reqUser) => {
  let user = await neonService.findUserById(reqUser.id);
  if (!user && reqUser.email) {
    user = await neonService.findUserByEmail(String(reqUser.email).toLowerCase());
  }
  return user;
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "../uploads");
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = {
      photo: /jpeg|jpg|png/,
      resume: /pdf/,
      collegeIdCard: /jpeg|jpg|png|pdf/,
      marksheets: /jpeg|jpg|png|pdf/,
    };

    const extname = allowedTypes[file.fieldname]?.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes[file.fieldname]?.test(file.mimetype);

    if (extname && mimetype) return cb(null, true);
    cb(new Error("File format error. Unsupported file type uploaded."));
  },
});

router.get("/", auth, async (req, res) => {
  try {
    logger.logAttempt("NEON", "READ", "User", `Fetching profile for user: ${req.user.id}`);
    const user = await resolveNeonUser(req.user);

    if (!user) return res.status(404).json({ message: "User not found" });

    // Fetch full profile data directly from user_profiles table
    const [profileRows] = await sequelize.query(
      `SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      { bind: [user.id] }
    );
    const up = profileRows[0] || {};

    const fullProfile = {
      name: up.profile_name || null,
      rollNumber: up.roll_number || null,
      registerNo: up.register_no || null,
      degree: up.degree || null,
      department: up.department || null,
      graduationYear: up.graduation_year || null,
      cgpa: up.cgpa || null,
      gender: up.gender || null,
      dateOfBirth: up.date_of_birth || null,
      personalEmail: up.personal_email || null,
      collegeEmail: up.college_email || null,
      tenthPercentage: up.tenth_percentage || null,
      twelfthPercentage: up.twelfth_percentage || null,
      diplomaPercentage: up.diploma_percentage || null,
      address: up.address || null,
      phoneNumber: up.phone_number || null,
      linkedinUrl: up.linkedin_url || null,
      githubUrl: up.github_url || null,
      currentBacklogs: up.current_backlogs || 0,
      historyOfBacklogs: up.history_of_backlogs || [],
      aboutMe: up.about_me || null,
      skills: up.skills || [],
      placementStatus: up.placement_status || null,
      isProfileComplete: up.is_profile_complete || false,
      profileCompletionPercentage: up.profile_completion_percentage || 0,
      photo: up.photo || null,
      resume: up.resume || null,
      collegeIdCard: up.college_id_card || null,
      marksheets: up.marksheets || [],
    };

    return res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      profile: fullProfile,
      isProfileComplete: fullProfile.isProfileComplete,
      database: "NEON",
    });
  } catch (error) {
    logger.logFailure("NEON", "READ", "User", error.message || error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/completion-status", auth, async (req, res) => {
  try {
    const user = await resolveNeonUser(req.user);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      percentage: user.profile?.profileCompletionPercentage || 0,
      isComplete: user.profile?.isProfileComplete || false,
      missingFields: [],
      database: "NEON",
    });
  } catch (error) {
    logger.logFailure("NEON", "READ", "User", error.message || error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.put("/basic-info", auth, async (req, res) => {
  try {
    const user = await resolveNeonUser(req.user);
    if (!user) return res.status(404).json({ message: "User not found" });

    await sequelize.query(
      `
      INSERT INTO user_profiles (user_id, about_me, created_at, updated_at)
      VALUES ($1, NULL, NOW(), NOW())
      ON CONFLICT (user_id) DO NOTHING
      `,
      { bind: [req.user.id] }
    );

    const toNumericOrNull = (value) => {
      if (value === "" || value === null || value === undefined) return null;
      const numberValue = Number(value);
      return Number.isNaN(numberValue) ? null : numberValue;
    };

    const updates = {
      profile_name: req.body.name,
      roll_number: req.body.rollNumber,
      register_no: req.body.registerNo,
      gender: req.body.gender,
      date_of_birth: req.body.dateOfBirth,
      personal_email: req.body.personalEmail,
      college_email: req.body.collegeEmail,
      tenth_percentage: toNumericOrNull(req.body.tenthPercentage),
      twelfth_percentage: toNumericOrNull(req.body.twelfthPercentage),
      diploma_percentage: toNumericOrNull(req.body.diplomaPercentage),
      degree: req.body.degree,
      department: req.body.department,
      graduation_year: toNumericOrNull(req.body.graduationYear),
      cgpa: toNumericOrNull(req.body.cgpa),
      address: req.body.address,
      phone_number: req.body.phoneNumber,
      linkedin_url: req.body.linkedinUrl,
      github_url: req.body.githubUrl,
      current_backlogs: toNumericOrNull(req.body.currentBacklogs),
      about_me: req.body.aboutMe,
      skills: Array.isArray(req.body.skills)
        ? req.body.skills
        : typeof req.body.skills === "string"
          ? req.body.skills.split(",").map((item) => item.trim()).filter(Boolean)
          : null,
      placement_status: normalizePlacementStatus(req.body.placementStatus),
      is_profile_complete: true,
      profile_completion_percentage: 100,
    };

    const fields = [];
    const values = [];
    let index = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${index++}`);
        values.push(value);
      }
    });

    fields.push("updated_at = NOW()");
    values.push(req.user.id);

    await sequelize.query(
      `UPDATE user_profiles SET ${fields.join(", ")} WHERE user_id = $${index}`,
      { bind: values }
    );

    if (req.body.name) {
      await sequelize.query(
        "UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2",
        { bind: [req.body.name, req.user.id] }
      );
    }

    const updatedUser = await resolveNeonUser(req.user);

    const io = req.app.get("io");
    if (io) {
      emitProfileUpdate(io, "basic_info_updated", {
        userId: updatedUser.id,
        email: updatedUser.email,
        profile: updatedUser.profile,
      });
    }

    return res.json({
      message: "Profile updated successfully",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        profile: updatedUser.profile || {},
      },
      database: "NEON",
    });
  } catch (error) {
    logger.logFailure("NEON", "UPDATE", "User", error.message || error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/upload-files", auth, (req, res) => {
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "resume", maxCount: 1 },
    { name: "collegeIdCard", maxCount: 1 },
    { name: "marksheets", maxCount: 10 },
  ])(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `File upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const user = await resolveNeonUser(req.user);
      if (!user) return res.status(404).json({ message: "User not found" });

      const fileData = {
        photo: req.files?.photo?.[0]?.filename,
        resume: req.files?.resume?.[0]?.filename,
        collegeIdCard: req.files?.collegeIdCard?.[0]?.filename,
        marksheets: req.files?.marksheets?.map((file) => file.filename) || [],
      };

      await sequelize.query(
        `UPDATE user_profiles
         SET profile_data = jsonb_set(COALESCE(profile_data, '{}'::jsonb), '{files}', $1::jsonb),
             updated_at = NOW()
         WHERE user_id = $2`,
        { bind: [JSON.stringify(fileData), req.user.id] }
      );

      const updatedUser = await resolveNeonUser(req.user);

      const io = req.app.get("io");
      if (io) {
        emitProfileUpdate(io, "files_uploaded", {
          userId: updatedUser.id,
          email: updatedUser.email,
          uploadedFiles: Object.keys(req.files || {}),
        });
      }

      return res.json({
        message: "Files uploaded successfully",
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          profile: updatedUser.profile || {},
        },
        database: "NEON",
      });
    } catch (error) {
      logger.logFailure("NEON", "UPDATE", "User", error.message || error);
      return res.status(500).json({ message: "Server error during file upload" });
    }
  });
});

module.exports = router;
