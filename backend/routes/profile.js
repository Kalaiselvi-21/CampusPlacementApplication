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

const normalizePgArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string" && val.startsWith("{") && val.endsWith("}")) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  }
  return [];
};

// Helper function to check if profile is complete — role-aware.
const checkProfileCompletion = (profileRow, role) => {
  const up = profileRow || {};
  const normalizedRole = String(role || "").toLowerCase().replace(/\s+/g, "_");

  let requiredFields;
  if (normalizedRole === "placement_representative" || normalizedRole === "pr") {
    // PRs only need a name, department, phone, and photo to be considered complete.
    requiredFields = [
      { key: "profile_name" },
      { key: "phone_number" },
      { key: "department" },
      { key: "photo" },
    ];
  } else if (
    normalizedRole === "placement_officer" ||
    normalizedRole === "po" ||
    normalizedRole === "admin"
  ) {
    requiredFields = [{ key: "profile_name" }];
  } else {
    // Students require the full set.
    requiredFields = [
      { key: "profile_name" },
      { key: "gender" },
      { key: "degree" },
      { key: "date_of_birth" },
      { key: "personal_email" },
      { key: "college_email" },
      { key: "tenth_percentage" },
      { key: "phone_number" },
      { key: "linkedin_url" },
      { key: "department" },
      { key: "graduation_year" },
      { key: "address" },
      { key: "about_me" },
      { key: "resume_drive_link" },
      { key: "pan_card_drive_link" },
      { key: "aadhar_card_drive_link" },
      { key: "photo" },
      { key: "resume" },
    ];
  }

  const missingFields = requiredFields.filter(
    (f) => !up[f.key] || (Array.isArray(up[f.key]) && up[f.key].length === 0),
  );

  return missingFields.length === 0;
};

const normalizePlacementStatus = (value) => {
  if (!value) return value;
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized === "not_placed" || normalized === "notplaced")
    return "unplaced";
  if (normalized === "placed") return "placed";
  if (normalized === "shortlisted") return "shortlisted";
  if (normalized === "unplaced") return "unplaced";
  return value;
};

const resolveNeonUser = async (reqUser) => {
  let user = await neonService.findUserById(reqUser.id);
  if (!user && reqUser.email) {
    user = await neonService.findUserByEmail(
      String(reqUser.email).toLowerCase(),
    );
  }
  return user;
};

const os = require("os");
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}-${file.originalname}`),
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

    const extname = allowedTypes[file.fieldname]?.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = allowedTypes[file.fieldname]?.test(file.mimetype);

    if (extname && mimetype) return cb(null, true);
    cb(new Error("File format error. Unsupported file type uploaded."));
  },
});

router.get("/", auth, async (req, res) => {
  try {
    logger.logAttempt(
      "NEON",
      "READ",
      "User",
      `Fetching profile for user: ${req.user.id}`,
    );
    const user = await resolveNeonUser(req.user);

    if (!user) return res.status(404).json({ message: "User not found" });

    // Fetch full profile data directly from user_profiles table
    const [profileRows] = await sequelize.query(
      `SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      { bind: [user.id] },
    );
    const up = profileRows[0] || {};

    // Legacy check: see if CGPA exists in the root user object's profile property
    const userTableProfile = user.profile || {};

    const fullProfile = {
      name: up.profile_name || null,
      rollNumber: up.roll_number || null,
      registerNo: up.register_no || null,
      degree: up.degree || null,
      department: up.department || null,
      graduationYear: up.graduation_year || null,
      batch: up.graduation_year || null,
      // Use a simpler, more direct check for the NeonDB column
      cgpa:
        up.cgpa !== null && up.cgpa !== undefined
          ? up.cgpa
          : userTableProfile?.cgpa !== null &&
              userTableProfile?.cgpa !== undefined
            ? userTableProfile.cgpa
            : null,
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
      resumeDriveLink: up.resume_drive_link || null,
      panCardDriveLink: up.pan_card_drive_link || null,
      aadharCardDriveLink: up.aadhar_card_drive_link || null,
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
      marksheets: normalizePgArray(up.marksheets),
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

    const [profileRows] = await sequelize.query(
      `SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      { bind: [user.id] },
    );
    const up = profileRows[0] || {};

    const requiredFields = [
      { key: "profile_name", label: "Full Name" },
      { key: "gender", label: "Gender" },
      { key: "degree", label: "Degree" },
      { key: "date_of_birth", label: "Date of Birth" },
      { key: "personal_email", label: "Personal Email" },
      { key: "college_email", label: "College Email" },
      { key: "tenth_percentage", label: "10th Percentage" },
      { key: "phone_number", label: "Phone Number" },
      { key: "linkedin_url", label: "LinkedIn URL" },
      { key: "department", label: "Department" },
      { key: "graduation_year", label: "Graduation Year" },
      { key: "address", label: "Address" },
      { key: "about_me", label: "About Me" },
      { key: "resume_drive_link", label: "Resume Drive Link" },
      { key: "pan_card_drive_link", label: "PAN Card Drive Link" },
      { key: "aadhar_card_drive_link", label: "Aadhar Card Drive Link" },
      { key: "photo", label: "Profile Photo" },
      { key: "resume", label: "Resume" },
    ];

    const missingFields = requiredFields
      .filter(
        (f) =>
          !up[f.key] || (Array.isArray(up[f.key]) && up[f.key].length === 0),
      )
      .map((f) => f.label);

    const total = requiredFields.length;
    const percentage = Math.round(
      ((total - missingFields.length) / total) * 100,
    );

    return res.json({
      percentage: percentage,
      isComplete: percentage === 100,
      missingFields: missingFields,
      database: "NEON",
    });
  } catch (error) {
    logger.logFailure("NEON", "READ", "User", error.message || error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

router.put("/basic-info", auth, async (req, res) => {
  try {
    const user = await resolveNeonUser(req.user);
    if (!user) return res.status(404).json({ message: "User not found" });

    // --- START: Role Guard for POs ---
    if (user.role === "placement_officer" || user.role === "po") {
      const poUpdates = {
        profile_name: req.body.name || undefined,
        phone_number: req.body.phoneNumber || undefined,
        updated_at: new Date(),
      };

      const fields = [];
      const values = [];
      let idx = 1;
      for (const [key, value] of Object.entries(poUpdates)) {
        if (value !== undefined) {
          fields.push(`${key} = $${idx++}`);
          values.push(value);
        }
      }
      values.push(user.id);

      await sequelize.query(
        `UPDATE user_profiles SET ${fields.join(", ")} WHERE user_id = $${idx}`,
        { bind: values },
      );

      if (req.body.name) {
        await sequelize.query("UPDATE users SET name = $1 WHERE id = $2", {
          bind: [req.body.name, user.id],
        });
      }

      return res.json({ message: "Officer profile updated", database: "NEON" });
    }
    // --- END: Role Guard for POs ---

    // ====== VALIDATION LOGIC ======
    const validationErrors = [];
    const { body } = req;

    // Regex Definitions
    const personalEmailRegex = /^[^\s@]+@gmail\.com$/;
    const collegeEmailRegex = /^[^\s@]+@gct\.ac\.in$/;
    const linkedinRegex =
      /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/i;
    const githubRegex =
      /^(https?:\/\/)?(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/i;

    // Format Validations
    if (body.personalEmail && !personalEmailRegex.test(body.personalEmail))
      validationErrors.push("personalEmail");
    if (body.collegeEmail && !collegeEmailRegex.test(body.collegeEmail))
      validationErrors.push("collegeEmail");
    if (body.phoneNumber && !/^\d{10}$/.test(body.phoneNumber))
      validationErrors.push("phoneNumber");
    if (body.linkedinUrl && !linkedinRegex.test(body.linkedinUrl))
      validationErrors.push("linkedinUrl");
    if (body.githubUrl && !githubRegex.test(body.githubUrl))
      validationErrors.push("githubUrl");

    // Numeric Range Validations
    if (
      body.cgpa !== undefined &&
      body.cgpa !== "" &&
      (body.cgpa < 0 || body.cgpa > 10)
    )
      validationErrors.push("cgpa");
    if (
      body.tenthPercentage !== undefined &&
      (body.tenthPercentage < 0 || body.tenthPercentage > 100)
    )
      validationErrors.push("tenthPercentage");
    if (
      body.twelfthPercentage !== undefined &&
      (body.twelfthPercentage < 0 || body.twelfthPercentage > 100)
    )
      validationErrors.push("twelfthPercentage");

    // Date of Birth Validation - should not be greater than today
    if (body.dateOfBirth) {
      const dob = new Date(body.dateOfBirth);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day
      if (dob > today) {
        validationErrors.push("dateOfBirth_future");
      }
    }

    // Required Fields Validation
    const requiredFields = [
      "name",
      "gender",
      "degree",
      "dateOfBirth",
      "personalEmail",
      "collegeEmail",
      "tenthPercentage",
      "phoneNumber",
      "linkedinUrl",
      "department",
      "address",
      "resumeDriveLink",
      "panCardDriveLink",
      "aadharCardDriveLink",
    ];

    requiredFields.forEach((field) => {
      if (!body[field] || String(body[field]).trim() === "") {
        validationErrors.push(field);
      }
    });

    // Validate Graduation Year / Batch Alias
    const gradYear = body.graduationYear || body.batch;
    if (!gradYear || String(gradYear).trim() === "") {
      validationErrors.push("graduationYear");
    }

    // About Me Length
    if (!body.aboutMe || body.aboutMe.trim() === "") {
      validationErrors.push("aboutMe");
    } else if (body.aboutMe.trim().length < 50) {
      validationErrors.push("aboutMe_tooShort");
    } else if (body.aboutMe.trim().length > 500) {
      validationErrors.push("aboutMe_tooLong");
    }

    // Skills count
    if (!body.skills || body.skills.length < 3) validationErrors.push("skills");

    // Roll Number Sync & Uniqueness (NeonDB implementation)
    if (body.rollNumber) {
      const normalizedRoll = body.rollNumber.trim().toUpperCase();

      // Check if trying to change an existing fixed roll number
      const [currentProfile] = await sequelize.query(
        "SELECT roll_number FROM user_profiles WHERE user_id = $1",
        { bind: [user.id] },
      );

      if (
        currentProfile[0]?.roll_number &&
        currentProfile[0].roll_number !== normalizedRoll
      ) {
        return res
          .status(400)
          .json({ message: "Roll number is fixed and cannot be changed." });
      }

      // Check for global uniqueness
      const [existingRoll] = await sequelize.query(
        "SELECT user_id FROM user_profiles WHERE roll_number = $1 AND user_id != $2",
        { bind: [normalizedRoll, user.id] },
      );
      if (existingRoll.length > 0)
        validationErrors.push("rollNumber already exists");
    } else {
      // If not in body, check if it exists in DB
      const [checkRoll] = await sequelize.query(
        "SELECT roll_number FROM user_profiles WHERE user_id = $1",
        { bind: [user.id] },
      );
      if (!checkRoll[0]?.roll_number)
        validationErrors.push("rollNumber is required");
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: "Validation failed",
        validationErrors: validationErrors,
      });
    }

    const toNumericOrNull = (value) => {
      if (value === "" || value === null || value === undefined) return null;
      const numberValue = Number(value);
      return Number.isNaN(numberValue) ? null : numberValue;
    };

    // --- START: CGPA Write-Once Policy ---
    let finalCgpa = undefined;
    const [existingProfileRows] = await sequelize.query(
      "SELECT cgpa FROM user_profiles WHERE user_id = $1 LIMIT 1",
      { bind: [user.id] },
    );
    const existingCgpa = existingProfileRows[0]?.cgpa;

    if (body.cgpa !== undefined) {
      if (user.role === "placement_officer" || user.role === "po") {
        finalCgpa = toNumericOrNull(body.cgpa);
      } else if (
        user.role === "student" ||
        user.role === "placement_representative" ||
        user.role === "pr"
      ) {
        if (existingCgpa === null || existingCgpa === undefined) {
          finalCgpa = toNumericOrNull(body.cgpa);
        } else {
          console.log(
            `CGPA locked for user ${user.email}; existing value preserved: ${existingCgpa}`,
          );
        }
      } else {
        console.log(`CGPA update skipped for role ${user.role}`);
      }
    }
    // --- END: CGPA Write-Once Policy ---

    const updates = {};
    if (body.name !== undefined) updates.profile_name = body.name;
    if (body.rollNumber !== undefined)
      updates.roll_number = body.rollNumber.trim().toUpperCase();
    if (body.registerNo !== undefined) updates.register_no = body.registerNo;
    if (body.gender !== undefined) updates.gender = body.gender;
    if (body.dateOfBirth !== undefined)
      updates.date_of_birth = body.dateOfBirth;
    if (body.personalEmail !== undefined)
      updates.personal_email = body.personalEmail;
    if (body.collegeEmail !== undefined)
      updates.college_email = body.collegeEmail;
    if (body.degree !== undefined) updates.degree = body.degree;
    if (body.department !== undefined) updates.department = body.department;
    if (body.address !== undefined) updates.address = body.address;
    if (body.phoneNumber !== undefined) updates.phone_number = body.phoneNumber;
    if (body.linkedinUrl !== undefined) updates.linkedin_url = body.linkedinUrl;
    if (body.githubUrl !== undefined) updates.github_url = body.githubUrl;
    if (body.resumeDriveLink !== undefined)
      updates.resume_drive_link = body.resumeDriveLink;
    if (body.panCardDriveLink !== undefined)
      updates.pan_card_drive_link = body.panCardDriveLink;
    if (body.aadharCardDriveLink !== undefined)
      updates.aadhar_card_drive_link = body.aadharCardDriveLink;
    if (body.aboutMe !== undefined) updates.about_me = body.aboutMe;
    if (body.placementStatus !== undefined)
      updates.placement_status = normalizePlacementStatus(body.placementStatus);

    if (body.tenthPercentage !== undefined)
      updates.tenth_percentage = toNumericOrNull(body.tenthPercentage);
    if (body.twelfthPercentage !== undefined)
      updates.twelfth_percentage = toNumericOrNull(body.twelfthPercentage);
    if (body.diplomaPercentage !== undefined)
      updates.diploma_percentage = toNumericOrNull(body.diplomaPercentage);

    // Handle graduationYear or batch alias
    const gradYearVal =
      body.graduationYear !== undefined ? body.graduationYear : body.batch;
    if (gradYearVal !== undefined) {
      updates.graduation_year = toNumericOrNull(gradYearVal);
    }

    if (body.currentBacklogs !== undefined)
      updates.current_backlogs = toNumericOrNull(body.currentBacklogs);

    if (finalCgpa !== undefined) updates.cgpa = finalCgpa;

    if (body.skills !== undefined) {
      updates.skills = Array.isArray(body.skills)
        ? body.skills
        : typeof body.skills === "string"
          ? body.skills
              .split(",")
              .map((i) => i.trim())
              .filter(Boolean)
          : [];
    }

    // Ensure a profile record exists
    await sequelize.query(
      `INSERT INTO user_profiles (user_id, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`,
      { bind: [req.user.id] },
    );

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
      { bind: values },
    );

    if (req.body.name) {
      await sequelize.query(
        "UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2",
        { bind: [req.body.name, req.user.id] },
      );
    }

    // Fetch the final combined state to ensure the frontend context update is complete
    const [finalRows] = await sequelize.query(
      `SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      { bind: [req.user.id] },
    );
    const fup = finalRows[0] || {};
    const finalUser = await resolveNeonUser(req.user);

    const finalProfile = {
      name: fup.profile_name || null,
      rollNumber: fup.roll_number || null,
      registerNo: fup.register_no || null,
      degree: fup.degree || null,
      department: fup.department || null,
      graduationYear: fup.graduation_year || null,
      batch: fup.graduation_year || null,
      cgpa:
        fup.cgpa !== undefined && fup.cgpa !== null
          ? fup.cgpa
          : finalUser.profile?.cgpa || null,
      gender: fup.gender || null,
      dateOfBirth: fup.date_of_birth || null,
      personalEmail: fup.personal_email || null,
      collegeEmail: fup.college_email || null,
      tenthPercentage: fup.tenth_percentage || null,
      twelfthPercentage: fup.twelfth_percentage || null,
      diplomaPercentage: fup.diploma_percentage || null,
      address: fup.address || null,
      phoneNumber: fup.phone_number || null,
      linkedinUrl: fup.linkedin_url || null,
      githubUrl: fup.github_url || null,
      resumeDriveLink: fup.resume_drive_link || null,
      panCardDriveLink: fup.pan_card_drive_link || null,
      aadharCardDriveLink: fup.aadhar_card_drive_link || null,
      currentBacklogs: fup.current_backlogs || 0,
      historyOfBacklogs: fup.history_of_backlogs || [],
      aboutMe: fup.about_me || null,
      skills: fup.skills || [],
      placementStatus: fup.placement_status || null,
      isProfileComplete: fup.is_profile_complete || false,
    };

    const io = req.app.get("io");
    if (io) {
      emitProfileUpdate(io, "basic_info_updated", {
        userId: finalUser.id,
        email: finalUser.email,
        profile: finalProfile,
      });
    }

    return res.json({
      message: "Profile updated successfully",
      user: {
        id: finalUser.id,
        email: finalUser.email,
        role: finalUser.role,
        profile: finalProfile,
        isProfileComplete: finalProfile.isProfileComplete,
        placementPolicyConsent: finalUser.placementPolicyConsent || {},
        verificationStatus: finalUser.verificationStatus || {},
      },
      database: "NEON",
    });
  } catch (error) {
    logger.logFailure("NEON", "UPDATE", "User", error.message || error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
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
      return res
        .status(400)
        .json({ message: `File upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const user = await resolveNeonUser(req.user);
      if (!user) return res.status(404).json({ message: "User not found" });

      const [existingProfileRows] = await sequelize.query(
        `SELECT photo, resume, college_id_card, marksheets, profile_data FROM user_profiles WHERE user_id = $1 LIMIT 1`,
        { bind: [req.user.id] },
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
        uploads.collegeIdCard = await uploadMulterFileToS3(
          req.files.collegeIdCard[0],
          {
            prefix: "profiles",
            keyPrefix: `${req.user.id}/collegeIdCard`,
          },
        );
      }

      if (
        Array.isArray(req.files?.marksheets) &&
        req.files.marksheets.length > 0
      ) {
        uploads.marksheets = await Promise.all(
          req.files.marksheets.map((file) =>
            uploadMulterFileToS3(file, {
              prefix: "profiles",
              keyPrefix: `${req.user.id}/marksheets`,
            }),
          ),
        );
      }

      const nextFiles = { ...existingFiles };
      if (uploads.photo?.url) nextFiles.photo = uploads.photo.url;
      if (uploads.resume?.url) nextFiles.resume = uploads.resume.url;
      if (uploads.collegeIdCard?.url)
        nextFiles.collegeIdCard = uploads.collegeIdCard.url;
      if (uploads.marksheets?.length)
        nextFiles.marksheets = uploads.marksheets.map((item) => item.url);

      const marksheetsParam = uploads.marksheets?.length
        ? uploads.marksheets.map((item) => item.url)
        : null;

      // Check if profile is now complete and set the flag
      const [profileAfterUpload] = await sequelize.query(
        `SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`,
        { bind: [req.user.id] },
      );
      const currentProfile = profileAfterUpload[0] || {};

      // Merge with newly uploaded files to check completion
      const profileWithNewFiles = {
        ...currentProfile,
        photo: uploads.photo?.url || currentProfile.photo,
        resume: uploads.resume?.url || currentProfile.resume,
        college_id_card:
          uploads.collegeIdCard?.url || currentProfile.college_id_card,
        marksheets: uploads.marksheets?.length
          ? uploads.marksheets.map((m) => m.url)
          : currentProfile.marksheets,
      };

      const isProfileNowComplete = currentProfile.is_profile_complete ? true : checkProfileCompletion(profileWithNewFiles, req.user.role);

      await sequelize.query(
        `UPDATE user_profiles
         SET photo = COALESCE($2, photo),
             resume = COALESCE($3, resume),
             college_id_card = COALESCE($4, college_id_card),
             marksheets = COALESCE($5::text[], marksheets),
             is_profile_complete = $7,
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
            isProfileNowComplete,
          ],
        },
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
          isProfileComplete: updatedUser.profile?.isProfileComplete || false,
          placementPolicyConsent: updatedUser.placementPolicyConsent || {},
          verificationStatus: updatedUser.verificationStatus || {},
        },
        database: "NEON",
      });
    } catch (error) {
      logger.logFailure("NEON", "UPDATE", "User", error.message || error);
      return res
        .status(500)
        .json({ message: "Server error during file upload" });
    }
  });
});

module.exports = router;
