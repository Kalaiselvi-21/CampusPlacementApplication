const express = require("express");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const os = require("os");
const { auth } = require("../middleware/auth");
const neonService = require("../services/database/neonService");
const logger = require("../services/database/logger");
const { emitCGPAUpdate } = require("../utils/socketUtils");

const router = express.Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}-${file.originalname}`),
  }),
});

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const isPoLike = (role) => {
  const normalized = normalizeRole(role);
  return (
    normalized === "po" ||
    normalized === "placement_officer" ||
    normalized === "placementofficer"
  );
};

const isPrivilegedCgpaUser = (req) =>
  req.user.email === "bhavadharanimanikandan10@gmail.com" ||
  isPoLike(req.user.roleNormalized || req.user.role);

const isLakshmiDebugUser = (req) => req.user.email === "lakshmiysc@gmail.com";

const cleanupUploadedFile = (file) => {
  if (file && file.path) {
    fs.unlink(file.path, () => {});
  }
};

const ensureCgpaReferencesTable = async () => {
  await neonService.executeRawQuery(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
  await neonService.executeRawQuery(`
    CREATE TABLE IF NOT EXISTS cgpa_references (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      roll_number VARCHAR(50) NOT NULL UNIQUE,
      cgpa NUMERIC(4,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await neonService.executeRawQuery(`
    CREATE INDEX IF NOT EXISTS idx_cgpa_references_roll_number
    ON cgpa_references(roll_number)
  `);
};

const parseCsvFile = (filePath) =>
  new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(filePath)
      .pipe(
        csv({
          skipEmptyLines: true,
          trim: true,
          mapHeaders: ({ header }) => header.trim().replace(/[\r\n]/g, ""),
        }),
      )
      .on("data", (data) => {
        const cleaned = {};
        for (const key of Object.keys(data)) {
          const cleanKey = key.trim().replace(/[\r\n]/g, "");
          cleaned[cleanKey] = data[key]
            ? data[key]
                .toString()
                .trim()
                .replace(/[\r\n]/g, "")
            : "";
        }
        rows.push(cleaned);
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });

const extractRollNumber = (row) =>
  row["ROLL NO"] ||
  row["rollNo"] ||
  row["Roll No"] ||
  row["roll_no"] ||
  row["ROLL_NO"] ||
  row["RollNo"] ||
  row["RollNumber"] ||
  row["rollNumber"] ||
  row["registerNo"] ||
  row["REGISTER NO"] ||
  row["register_no"];

const extractCgpa = (row) =>
  row["CGPA"] ||
  row["cgpa"] ||
  row["Cgpa"] ||
  row["GPA"] ||
  row["gpa"] ||
  row["Gpa"];

const findUserByRollNumber = async (
  rollNumber,
  roles = ["student", "placement_representative"],
) => {
  const rows = await neonService.executeRawQuery(
    `
    SELECT
      u.id,
      u.email,
      u.role,
      u.created_at,
      up.profile_name,
      up.roll_number,
      up.register_no,
      up.cgpa,
      up.department,
      up.graduation_year,
      up.phone_number
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE u.role = ANY($2)
      AND (
        UPPER(COALESCE(up.roll_number, '')) = UPPER($1)
        OR UPPER(COALESCE(up.register_no, '')) = UPPER($1)
      )
    ORDER BY u.created_at ASC
    LIMIT 1
    `,
    [rollNumber, roles],
  );

  return rows[0] || null;
};

const findUserByEmail = async (email) => {
  const rows = await neonService.executeRawQuery(
    `
    SELECT
      u.id,
      u.email,
      u.role,
      u.name,
      u.created_at,
      u.updated_at,
      up.profile_name,
      up.roll_number,
      up.register_no,
      up.cgpa,
      up.department,
      up.graduation_year,
      up.phone_number,
      up.is_profile_complete
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE LOWER(u.email) = LOWER($1)
    LIMIT 1
    `,
    [email],
  );

  return rows[0] || null;
};

const updateUserCgpa = async (userId, cgpa) => {
  // Ensure a profile row exists for the user, then set CGPA.
  const rows = await neonService.executeRawQuery(
    `
    INSERT INTO user_profiles (user_id, cgpa, created_at, updated_at)
    VALUES ($1, $2, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET cgpa = EXCLUDED.cgpa, updated_at = NOW()
    RETURNING user_id, cgpa, roll_number, register_no, profile_name, department, phone_number
    `,
    [userId, cgpa],
  );

  return rows[0] || null;
};

const upsertCgpaReference = async (rollNumber, cgpa) => {
  const normalizedRoll = String(rollNumber || "")
    .trim()
    .toUpperCase();
  if (!normalizedRoll) {
    return null;
  }

  const rows = await neonService.executeRawQuery(
    `
    INSERT INTO cgpa_references (id, roll_number, cgpa, created_at, updated_at)
    VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
    ON CONFLICT (roll_number)
    DO UPDATE SET cgpa = EXCLUDED.cgpa, updated_at = NOW()
    RETURNING id, roll_number, cgpa
    `,
    [normalizedRoll, cgpa],
  );

  return rows[0] || null;
};

router.post(
  "/upload-cgpa",
  auth,
  upload.single("csvFile"),
  async (req, res) => {
    try {
      logger.logAttempt("NEON", "CREATE", "User", "Uploading CGPA CSV data");

      if (!isPrivilegedCgpaUser(req)) {
        return res.status(403).json({
          message:
            "Access denied - Only placement officers can upload CGPA data",
          userRole: req.user.role,
          userEmail: req.user.email,
        });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const rows = await parseCsvFile(req.file.path);
      if (rows.length === 0) {
        cleanupUploadedFile(req.file);
        return res.json({
          message: "No data found in CSV file",
          updatedCount: 0,
          errorCount: 0,
          totalRows: 0,
        });
      }

      const csvHeaders = Object.keys(rows[0] || {});
      const hasRecognizableHeaders = rows.some(
        (row) => extractRollNumber(row) !== undefined || extractCgpa(row) !== undefined
      );
      if (!hasRecognizableHeaders) {
        cleanupUploadedFile(req.file);
        return res.status(400).json({
          message:
            "CSV headers not recognized. Expected a roll number column like 'ROLL NO' and a CGPA column like 'CGPA'.",
          csvHeaders,
        });
      }

      // Parse and validate all rows first (no DB calls yet)
      const validRows = [];
      let errorCount = 0;

      for (const row of rows) {
        const rawRoll = extractRollNumber(row);
        const rawCgpa = extractCgpa(row);
        if (!rawRoll || !rawCgpa) { errorCount += 1; continue; }
        const cleanRollNo = String(rawRoll).trim().toUpperCase();
        const cleanCgpa = parseFloat(rawCgpa);
        if (Number.isNaN(cleanCgpa)) { errorCount += 1; continue; }
        validRows.push({ rollNo: cleanRollNo, cgpa: cleanCgpa });
      }

      let updatedCount = 0;

      if (validRows.length > 0) {
        const rollNumbers = validRows.map((r) => r.rollNo);

        // Single query: fetch all matching users by roll number
        const matchedUsers = await neonService.executeRawQuery(
          `
          SELECT u.id, UPPER(COALESCE(up.roll_number, up.register_no, '')) AS roll_key
          FROM users u
          LEFT JOIN user_profiles up ON up.user_id = u.id
          WHERE u.role = ANY($1)
            AND UPPER(COALESCE(up.roll_number, up.register_no, '')) = ANY($2)
          `,
          [["student", "placement_representative"], rollNumbers]
        );

        const rollToUserId = new Map(matchedUsers.map((u) => [u.roll_key, u.id]));

        // Bulk update user_profiles CGPA using unnest
        const updatePairs = validRows
          .filter((r) => rollToUserId.has(r.rollNo))
          .map((r) => ({ userId: rollToUserId.get(r.rollNo), cgpa: r.cgpa }));

        if (updatePairs.length > 0) {
          await neonService.executeRawQuery(
            `
            UPDATE user_profiles AS up
            SET cgpa = v.cgpa::numeric, updated_at = NOW()
            FROM (SELECT unnest($1::uuid[]) AS uid, unnest($2::numeric[]) AS cgpa) AS v
            WHERE up.user_id = v.uid
            `,
            [updatePairs.map((p) => p.userId), updatePairs.map((p) => p.cgpa)]
          );
          updatedCount = updatePairs.length;
        }

        errorCount += validRows.length - updatePairs.length;

        // Bulk upsert cgpa_references using unnest
        await ensureCgpaReferencesTable();
        await neonService.executeRawQuery(
          `
          INSERT INTO cgpa_references (id, roll_number, cgpa, created_at, updated_at)
          SELECT gen_random_uuid(), v.roll, v.cgpa, NOW(), NOW()
          FROM (SELECT unnest($1::text[]) AS roll, unnest($2::numeric[]) AS cgpa) AS v
          ON CONFLICT (roll_number) DO UPDATE SET cgpa = EXCLUDED.cgpa, updated_at = NOW()
          `,
          [validRows.map((r) => r.rollNo), validRows.map((r) => r.cgpa)]
        );
      }

      cleanupUploadedFile(req.file);

      const io = req.app.get("io");
      if (io) {
        emitCGPAUpdate(io, "csv_uploaded", {
          updatedCount,
          errorCount,
          totalRows: rows.length,
        });
      }

      return res.json({
        message: `CSV processed: ${updatedCount} updated, ${errorCount} errors`,
        updatedCount,
        errorCount,
        totalRows: rows.length,
        details: {
          csvHeaders,
          sampleData: rows.slice(0, 2),
          note: "Updated CGPA for both students and placement representatives in NeonDB",
        },
        database: "NEON",
      });
    } catch (error) {
      cleanupUploadedFile(req.file);
      console.error("Upload CGPA error:", error);
      if (
        /relation ["']?cgpa_references["']? does not exist/i.test(error.message || "")
      ) {
        return res.status(500).json({
          message:
            "CGPA upload failed because the cgpa_references table is missing. Run the startup migration to align the schema.",
          error: error.message,
        });
      }
      return res
        .status(500)
        .json({ message: "Server error", error: error.message });
    }
  },
);

router.get("/debug-students", auth, async (req, res) => {
  try {
    logger.logAttempt("NEON", "READ", "User", "Debug: fetching students data");
    if (!isLakshmiDebugUser(req)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const totalRows = await neonService.executeRawQuery(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'student'`,
    );
    const students = await neonService.executeRawQuery(
      `
      SELECT u.email, up.profile_name, up.roll_number, up.register_no, up.cgpa, up.department
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE u.role = 'student'
      ORDER BY u.created_at DESC
      LIMIT 10
      `,
    );

    return res.json({
      totalStudents: totalRows[0]?.count || 0,
      sampleStudents: students.map((student) => ({
        email: student.email,
        name: student.profile_name,
        rollNumber: student.roll_number,
        registerNo: student.register_no,
        cgpa: student.cgpa,
        department: student.department,
      })),
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/debug-csv", auth, upload.single("csvFile"), async (req, res) => {
  try {
    logger.logAttempt("NEON", "READ", "User", "Debug: parsing CSV file");
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const rows = await parseCsvFile(req.file.path);
    cleanupUploadedFile(req.file);

    return res.json({
      message: "CSV parsed successfully",
      totalRows: rows.length,
      headers: Object.keys(rows[0] || {}),
      sampleRows: rows.slice(0, 5),
      allData: rows,
      database: "NEON",
    });
  } catch (error) {
    cleanupUploadedFile(req.file);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

router.get("/debug-student/:rollNumber", auth, async (req, res) => {
  try {
    logger.logAttempt(
      "NEON",
      "READ",
      "User",
      "Debug: fetching student by roll number",
    );
    const student = await findUserByRollNumber(req.params.rollNumber, [
      "student",
    ]);

    if (!student) {
      return res.json({
        found: false,
        rollNumber: req.params.rollNumber,
        database: "NEON",
      });
    }

    return res.json({
      found: true,
      student: {
        name: student.profile_name,
        rollNumber: student.roll_number,
        registerNo: student.register_no,
        cgpa: student.cgpa,
        email: student.email,
      },
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/debug-user-data", auth, async (req, res) => {
  try {
    logger.logAttempt("NEON", "READ", "User", "Debug: fetching all user data");
    const users = await neonService.executeRawQuery(
      `
      SELECT u.id, u.email, u.role, up.profile_name, up.roll_number
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      ORDER BY u.created_at DESC
      `,
    );

    return res.json({ users, database: "NEON" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/fix-user-profile", auth, async (req, res) => {
  try {
    logger.logAttempt("NEON", "UPDATE", "User", "Debug: fixing user profile");
    if (!isLakshmiDebugUser(req)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await neonService.executeRawQuery(
      `UPDATE users SET role = 'po', updated_at = NOW() WHERE id = $1`,
      [req.user.id],
    );
    await neonService.executeRawQuery(
      `
      INSERT INTO user_profiles (id, user_id, profile_name, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, 'Moorthy', NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET profile_name = EXCLUDED.profile_name, updated_at = NOW()
      `,
      [req.user.id],
    );

    const user = await findUserByEmail(req.user.email);

    return res.json({
      message: "Profile fixed",
      user: {
        id: user?.id || req.user.id,
        email: user?.email || req.user.email,
        role: user?.role || "po",
        profile: {
          name: user?.profile_name || "Moorthy",
          rollNumber: user?.roll_number || null,
          registerNo: user?.register_no || null,
          cgpa: user?.cgpa || null,
          department: user?.department || null,
        },
      },
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/debug-my-profile/:email", auth, async (req, res) => {
  try {
    logger.logAttempt(
      "NEON",
      "READ",
      "User",
      "Debug: fetching profile by email",
    );
    if (!isLakshmiDebugUser(req)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const student = await findUserByEmail(req.params.email);
    if (!student) {
      return res.json({
        found: false,
        email: req.params.email,
        database: "NEON",
      });
    }

    return res.json({
      found: true,
      student: {
        email: student.email,
        name: student.profile_name,
        rollNumber: student.roll_number,
        registerNo: student.register_no,
        cgpa: student.cgpa,
        department: student.department,
        batch: student.graduation_year,
        role: student.role,
      },
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/update-cgpa-manual", auth, async (req, res) => {
  try {
    logger.logAttempt("NEON", "UPDATE", "User", "Manual CGPA update");
    if (!isLakshmiDebugUser(req)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { email, cgpa } = req.body;
    const student = await findUserByEmail(email);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const oldCgpa = student.cgpa;
    const newCgpa = parseFloat(cgpa);
    if (Number.isNaN(newCgpa)) {
      return res.status(400).json({ message: "Invalid CGPA value" });
    }

    await updateUserCgpa(student.id, newCgpa);
    if (student.roll_number) {
      await ensureCgpaReferencesTable();
      await upsertCgpaReference(student.roll_number, newCgpa);
    }

    const io = req.app.get("io");
    if (io) {
      emitCGPAUpdate(io, "manual_update", {
        email: student.email,
        name: student.profile_name,
        oldCgpa,
        newCgpa,
      });
    }

    return res.json({
      message: "CGPA updated successfully",
      student: {
        email: student.email,
        name: student.profile_name,
        rollNumber: student.roll_number,
        oldCgpa,
        newCgpa,
      },
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/pending-pr-verifications", auth, async (req, res) => {
  try {
    if (
      !["po", "admin", "placement_officer"].includes(req.user.roleNormalized)
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const pendingPRs = await neonService.executeRawQuery(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.created_at,
        COALESCE(vs.is_verified, false) AS verification_status,
        up.profile_name,
        up.department
      FROM users u
      LEFT JOIN verification_status vs ON vs.user_id = u.id
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE u.role IN ('pr', 'placement_representative')
        AND COALESCE(vs.is_verified, false) = false
      ORDER BY u.created_at DESC
      `,
    );

    return res.json({ pendingPRs, database: "NEON" });
  } catch (error) {
    console.error("Error fetching pending PRs:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/verify-pr/:prId", auth, async (req, res) => {
  try {
    if (
      !["po", "admin", "placement_officer"].includes(req.user.roleNormalized)
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { status } = req.body;
    const rows = await neonService.executeRawQuery(
      `SELECT id, email, role FROM users WHERE id = $1 LIMIT 1`,
      [req.params.prId],
    );
    const pr = rows[0];

    if (!pr || !["pr", "placement_representative"].includes(pr.role)) {
      return res.status(404).json({ message: "PR not found" });
    }

    const approved = status === "approved";
    await neonService.executeRawQuery(
      `
      INSERT INTO verification_status (id, user_id, is_verified, otp_verified, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $2, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET is_verified = $2, otp_verified = $2, updated_at = NOW()
      `,
      [req.params.prId, approved],
    );

    return res.json({
      message: `PR ${status} successfully`,
      pr: {
        id: pr.id,
        email: pr.email,
        verificationStatus: status,
      },
      database: "NEON",
    });
  } catch (error) {
    console.error("Error verifying PR:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/placed-students-count", auth, async (req, res) => {
  try {
    if (!isPoLike(req.user.roleNormalized)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const countRows = await neonService.executeRawQuery(
      `SELECT COUNT(DISTINCT student_id)::int AS count FROM placed_students`,
    );
    const sampleRows = await neonService.executeRawQuery(
      `
      SELECT u.email, up.profile_name AS name
      FROM placed_students ps
      JOIN users u ON u.id = ps.student_id
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LIMIT 5
      `,
    );

    return res.json({
      count: countRows[0]?.count || 0,
      debug: { sampleStudents: sampleRows },
      database: "NEON",
    });
  } catch (error) {
    console.error("Error fetching placed students count:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

router.get("/students-details", auth, async (req, res) => {
  try {
    if (!["po", "placement_officer"].includes(req.user.roleNormalized)) {
      return res
        .status(403)
        .json({ message: "Access denied. Only PO can view student details." });
    }

    const students = await neonService.executeRawQuery(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.created_at,
        u.updated_at,
        up.profile_name,
        up.roll_number,
        up.register_no,
        up.department,
        up.degree,
        up.graduation_year,
        up.cgpa,
        up.gender,
        up.date_of_birth,
        up.personal_email,
        up.college_email,
        up.phone_number,
        up.address,
        up.tenth_percentage,
        up.twelfth_percentage,
        up.diploma_percentage,
        up.linkedin_url,
        up.github_url,
        up.resume_drive_link,
        up.pan_card_drive_link,
        up.aadhar_card_drive_link,
        up.current_backlogs,
        up.about_me,
        up.placement_status,
        up.is_placed,
        up.is_profile_complete,
        up.photo,
        up.resume,
        up.college_id_card,
        up.marksheets,
        up.profile_data,
        pc.has_agreed AS consent_has_agreed,
        pc.agreed_at AS consent_agreed_at,
        pc.signature AS consent_signature,
        vs.otp_verified,
        vs.is_verified AS verification_is_verified
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN placement_consents pc ON pc.user_id = u.id
      LEFT JOIN verification_status vs ON vs.user_id = u.id
      WHERE u.role IN ('student', 'placement_representative')
      ORDER BY up.profile_name ASC NULLS LAST, u.created_at DESC
      `,
    );

    const normalizeTextArray = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value.filter(Boolean);
      if (typeof value !== "string") return [];
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        const inner = trimmed.slice(1, -1);
        if (!inner) return [];
        return inner
          .split(",")
          .map((item) => item.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
      }
      return [trimmed];
    };

    const studentsData = students.map((student) => ({
      documents: (() => {
        const files = student.profile_data?.files || {};
        const marksheets =
          normalizeTextArray(student.marksheets).length > 0
            ? normalizeTextArray(student.marksheets)
            : Array.isArray(files.marksheets)
              ? files.marksheets.filter(Boolean)
              : [];

        return {
          photo: student.photo || files.photo || null,
          resume: student.resume || files.resume || null,
          collegeIdCard: student.college_id_card || files.collegeIdCard || null,
          marksheets,
        };
      })(),
      _id: student.id,
      name: student.profile_name || student.name || "N/A",
      email: student.email,
      rollNumber: student.roll_number || "N/A",
      registerNo: student.register_no || "N/A",
      department: student.department || "N/A",
      degree: student.degree || "N/A",
      graduationYear: student.graduation_year || "N/A",
      cgpa: student.cgpa || "N/A",
      gender: student.gender || "N/A",
      dateOfBirth: student.date_of_birth || "N/A",
      personalEmail: student.personal_email || "N/A",
      collegeEmail: student.college_email || student.email,
      phoneNumber: student.phone_number || "N/A",
      address: student.address || "N/A",
      tenthPercentage: student.tenth_percentage || "N/A",
      twelfthPercentage: student.twelfth_percentage || "N/A",
      diplomaPercentage: student.diploma_percentage || "N/A",
      linkedinUrl: student.linkedin_url || "N/A",
      githubUrl: student.github_url || "N/A",
      resumeDriveLink:
        student.resume_drive_link && student.resume_drive_link.trim() !== ""
          ? student.resume_drive_link
          : student.profile_data?.resumeDriveLink || null,
      panCardDriveLink:
        student.pan_card_drive_link && student.pan_card_drive_link.trim() !== ""
          ? student.pan_card_drive_link
          : student.profile_data?.panCardDriveLink || null,
      aadharCardDriveLink:
        student.aadhar_card_drive_link &&
        student.aadhar_card_drive_link.trim() !== ""
          ? student.aadhar_card_drive_link
          : student.profile_data?.aadharCardDriveLink || null,
      currentBacklogs: student.current_backlogs || 0,
      aboutMe: student.about_me || "N/A",
      placementStatus: student.placement_status || "unplaced",
      isPlaced: student.is_placed || false,
      consentStatus: {
        hasAgreed: student.consent_has_agreed || false,
        agreedAt: student.consent_agreed_at || null,
        signature: student.consent_signature || null,
      },
      otpVerified: student.otp_verified || false,
      isVerified: student.verification_is_verified || false,
      profileComplete: student.is_profile_complete || false,
      registeredAt: student.created_at,
      lastUpdated: student.updated_at,
      role: student.role,
    }));

    return res.json({
      students: studentsData,
      count: studentsData.length,
      database: "NEON",
    });
  } catch (error) {
    console.error("Error fetching students details:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

router.get("/deleted-users", auth, async (req, res) => {
  try {
    if (
      !isPoLike(req.user.roleNormalized || req.user.role) &&
      req.user.email !== "bhavadharanimanikandan10@gmail.com"
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const deletedUsers = await neonService.executeRawQuery(
      `SELECT * FROM deleted_users ORDER BY deleted_at DESC`,
    );

    return res.json({
      count: deletedUsers.length,
      users: deletedUsers,
      database: "NEON",
    });
  } catch (error) {
    console.error("Error fetching deleted users:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.delete("/delete/:userId", auth, async (req, res) => {
  try {
    if (!isPoLike(req.user.roleNormalized || req.user.role)) {
      return res.status(403).json({
        message: "Access denied - Only Placement Officers can delete users",
      });
    }

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Prevent PO from deleting themselves
    if (userId === req.user.id) {
      return res
        .status(400)
        .json({ message: "Cannot delete your own account from this endpoint" });
    }

    const userToDelete = await neonService.executeRawQuery(
      `SELECT id, name, email, role FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );

    if (!userToDelete[0]) {
      return res.status(404).json({ message: "User not found" });
    }

    const targetUser = userToDelete[0];

    // Only allow deleting students and PRs (not other POs or admins)
    const targetRole = String(targetUser.role || "").toLowerCase();
    const allowedToDelete = ["student", "placement_representative", "pr"];
    if (!allowedToDelete.includes(targetRole)) {
      return res
        .status(403)
        .json({ message: "Cannot delete users with privileged roles" });
    }

    await neonService.deleteUserById(userId);

    logger.logAttempt(
      "NEON",
      "DELETE",
      "User",
      `PO deleted user: ${targetUser.email}`,
    );

    return res.json({
      message: `User ${targetUser.email} deleted successfully`,
      database: "NEON",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
