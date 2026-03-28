const express = require("express");
const multer = require("multer");
const path = require("path");
const auth = require("../middleware/auth").auth;
const { emitProfileUpdate } = require("../utils/socketUtils");
const logger = require("../services/database/logger");
const neonService = require("../services/database/neonService");
const { sequelize } = require("../config/neonConnection");
const { uploadMulterFileToS3 } = require("../services/storage/s3Upload");

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

const storage = multer.memoryStorage();

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
      resumeLink: up.profile_data?.resume_link || null,
      aadharLink: up.profile_data?.aadhar_link || null,
      panLink: up.profile_data?.pan_link || null,
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

    // Fetch full profile to check completion status and mandatory fields
    const [profileRows] = await sequelize.query(
      `SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      { bind: [req.user.id] }
    );
    const profile = profileRows?.[0];
    const profileData = profile?.profile_data || {};

    // Determine role for URL field validation
    const normalizedRole = String(user.role || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    
    const mustHaveIdentityUrls = [
      'student',
      'placement_representative',
      'placement_officer',
      'pr',
      'po'
    ].some(role => normalizedRole.includes(role.replace(/_/g, '_')));

    const missingFields = [];
    
    // Check mandatory URL fields for students and placement representatives
    if (mustHaveIdentityUrls && profile?.is_profile_complete) {
      if (!profileData.resume_link?.trim?.()) missingFields.push('resumeLink');
      if (!profileData.aadhar_link?.trim?.()) missingFields.push('aadharLink');
      if (!profileData.pan_link?.trim?.()) missingFields.push('panLink');
    }

    return res.json({
      percentage: profile?.profile_completion_percentage || 0,
      isComplete: profile?.is_profile_complete || false,
      missingFields,
      hasAllMandatoryUrls: missingFields.length === 0 || !mustHaveIdentityUrls,
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
      history_of_backlogs: Array.isArray(req.body.historyOfBacklogs)
        ? req.body.historyOfBacklogs
        : typeof req.body.historyOfBacklogs === "string"
          ? JSON.parse(req.body.historyOfBacklogs)
          : null,
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

    const hasLinkFields =
      req.body.resumeLink !== undefined ||
      req.body.aadharLink !== undefined ||
      req.body.panLink !== undefined;
    if (hasLinkFields) {
      const linkData = {};
      if (req.body.resumeLink !== undefined) linkData.resume_link = req.body.resumeLink || null;
      if (req.body.aadharLink !== undefined) linkData.aadhar_link = req.body.aadharLink || null;
      if (req.body.panLink !== undefined) linkData.pan_link = req.body.panLink || null;
      await sequelize.query(
        `UPDATE user_profiles
         SET profile_data = COALESCE(profile_data, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         WHERE user_id = $1`,
        { bind: [req.user.id, JSON.stringify(linkData)] }
      );
    }

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

      const [existingProfileRows] = await sequelize.query(
        `SELECT photo, resume, college_id_card, marksheets, profile_data FROM user_profiles WHERE user_id = $1 LIMIT 1`,
        { bind: [req.user.id] }
      );
      const existingProfile = existingProfileRows?.[0] || {};
      const existingFiles = existingProfile?.profile_data?.files || {};

      const uploads = {};

      if (req.files?.photo?.[0]) {
        uploads.photo = await uploadMulterFileToS3(req.files.photo[0], {
          prefix: "profiles",
          keyPrefix: `${req.user.id}/photo`,
        });
      }

      if (req.files?.resume?.[0]) {
        uploads.resume = await uploadMulterFileToS3(req.files.resume[0], {
          prefix: "profiles",
          keyPrefix: `${req.user.id}/resume`,
        });
      }

      if (req.files?.collegeIdCard?.[0]) {
        uploads.collegeIdCard = await uploadMulterFileToS3(req.files.collegeIdCard[0], {
          prefix: "profiles",
          keyPrefix: `${req.user.id}/collegeIdCard`,
        });
      }

      if (Array.isArray(req.files?.marksheets) && req.files.marksheets.length > 0) {
        uploads.marksheets = await Promise.all(
          req.files.marksheets.map((file) =>
            uploadMulterFileToS3(file, { prefix: "profiles", keyPrefix: `${req.user.id}/marksheets` })
          )
        );
      }

      const nextFiles = { ...existingFiles };
      if (uploads.photo?.url) nextFiles.photo = uploads.photo.url;
      if (uploads.resume?.url) nextFiles.resume = uploads.resume.url;
      if (uploads.collegeIdCard?.url) nextFiles.collegeIdCard = uploads.collegeIdCard.url;
      if (uploads.marksheets?.length) nextFiles.marksheets = uploads.marksheets.map((item) => item.url);

      const marksheetsParam = uploads.marksheets?.length
        ? uploads.marksheets.map((item) => item.url)
        : null;

      await sequelize.query(
        `UPDATE user_profiles
         SET photo = COALESCE($2, photo),
             resume = COALESCE($3, resume),
             college_id_card = COALESCE($4, college_id_card),
             marksheets = COALESCE($5::text[], marksheets),
             profile_data = jsonb_set(COALESCE(profile_data, '{}'::jsonb), '{files}', $1::jsonb),
             updated_at = NOW()
         WHERE user_id = $6`,
        {
          bind: [
            JSON.stringify(nextFiles),
            uploads.photo?.url || null,
            uploads.resume?.url || null,
            uploads.collegeIdCard?.url || null,
            marksheetsParam,
            req.user.id,
          ],
        }
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
