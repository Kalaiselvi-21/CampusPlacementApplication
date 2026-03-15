const express = require("express");
const { auth } = require("../middleware/auth");
const { requirePlacementConsent } = require("../middleware/placementConsent");
const { requireCompleteProfile } = require("../middleware/profileComplete");
const { emitJobDriveUpdate } = require("../utils/socketUtils");
const logger = require("../services/database/logger");
const neonService = require("../services/database/neonService");
const { sequelize } = require("../config/neonConnection");

const router = express.Router();

const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const normalizeDepartment = (department) => {
  if (!department) {
    return null;
  }

  return String(department).trim().toLowerCase();
};

const normalizeRole = (role) => {
  const normalized = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (normalized === "placementofficer") return "placement_officer";
  if (normalized === "placementrepresentative") return "placement_representative";
  return normalized;
};

const isPlacementOfficerRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === "po" || normalized === "placement_officer";
};

const isPlacementRepresentativeRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === "pr" || normalized === "placement_representative";
};

const isPlacementStaffRole = (role) => isPlacementOfficerRole(role) || isPlacementRepresentativeRole(role);

const formatDriveForDisplay = (drive) => ({
  ...drive,
  type: drive.type || drive.jobType || "full-time",
  jobType: drive.jobType || drive.type || "full-time",
  displayType:
    (drive.type || drive.jobType) === "internship" ? "Internship" : "Full Time",
  displayLocation:
    drive.location ||
    (Array.isArray(drive.locations) && drive.locations.length > 0
      ? drive.locations.join(", ")
      : "Not specified"),
});

const getCurrentUser = async (userId) => {
  if (!isUuid(userId)) {
    return null;
  }

  return neonService.findUserById(userId);
};

const getApplicationsTableConfig = async () => neonService.getApplicationsTableConfig();

const fetchStudentProfilesByIds = async (studentIds = []) => {
  const ids = Array.from(new Set((studentIds || []).filter((id) => isUuid(id))));
  if (ids.length === 0) {
    return new Map();
  }

  const rows = await neonService.executeRawQuery(
    `
    SELECT
      u.id,
      u.email,
      u.name,
      up.profile_name,
      up.roll_number,
      up.register_no,
      up.department,
      up.cgpa,
      up.phone_number,
      up.degree,
      up.graduation_year,
      up.current_backlogs
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE u.id = ANY($1)
    `,
    [ids]
  );

  const profileMap = new Map();
  for (const row of rows) {
    profileMap.set(row.id, {
      _id: row.id,
      id: row.id,
      email: row.email || "N/A",
      name: row.profile_name || row.name || "N/A",
      rollNumber: row.roll_number || "N/A",
      registerNo: row.register_no || "N/A",
      department: row.department || "N/A",
      cgpa: row.cgpa ?? "N/A",
      mobileNumber: row.phone_number || "N/A",
      degree: row.degree || (row.graduation_year ? String(row.graduation_year) : "N/A"),
      graduationYear: row.graduation_year || null,
      currentBacklogs: row.current_backlogs || 0,
      profile: {
        name: row.profile_name || row.name || "N/A",
        rollNumber: row.roll_number || "N/A",
        registerNo: row.register_no || "N/A",
        department: row.department || "N/A",
        cgpa: row.cgpa ?? "N/A",
        phoneNumber: row.phone_number || "N/A",
        degree: row.degree || null,
        graduationYear: row.graduation_year || null,
        currentBacklogs: row.current_backlogs || 0,
      },
    });
  }

  return profileMap;
};

const fetchApplicationsForDrive = async (driveId) => {
  const rows = await neonService.getJobDriveApplications(driveId);
  return rows.map((application) => ({
    _id: application.id,
    student: {
      _id: application.student_id || application.user_id,
      id: application.student_id || application.user_id,
      email: application.email || "N/A",
      name: application.name || "N/A",
      profile: {
        name: application.name || "N/A",
        department: application.department || "N/A",
        rollNumber: application.roll_number || "N/A",
        cgpa: application.cgpa ?? "N/A",
        phoneNumber: application.phone || "N/A",
      },
    },
    appliedAt: application.applied_at,
    status: application.status || "applied",
  }));
};

const loadDrive = async (driveId, includeApplications = false) => {
  const drive = await neonService.findJobDriveById(driveId);
  if (!drive) {
    return null;
  }

  if (includeApplications) {
    drive.applications = await fetchApplicationsForDrive(driveId);
  }

  return formatDriveForDisplay(drive);
};

const getDriveCreatorId = (drive) => {
  if (!drive?.createdBy) {
    return null;
  }

  if (typeof drive.createdBy === "string") {
    return drive.createdBy;
  }

  return drive.createdBy._id || drive.createdBy.id || null;
};

const getDriveCreatorDepartment = async (drive) => {
  if (drive?.createdBy?.profile?.department) {
    return drive.createdBy.profile.department;
  }

  const creatorId = getDriveCreatorId(drive);
  if (!creatorId || !isUuid(creatorId)) {
    return null;
  }

  const creator = await neonService.findUserById(creatorId);
  return creator?.profile?.department || null;
};

const canManageDrive = async (user, drive) => {
  const role = user.roleNormalized || user.role;
  if (isPlacementOfficerRole(role) || normalizeRole(role) === "admin") {
    return true;
  }

  if (!isPlacementRepresentativeRole(role)) {
    return false;
  }

  const currentUser = await getCurrentUser(user.id);
  if (!currentUser) {
    return false;
  }

  const currentDepartment = normalizeDepartment(currentUser.profile?.department);
  const creatorDepartment = normalizeDepartment(await getDriveCreatorDepartment(drive));
  const creatorId = getDriveCreatorId(drive);
  const spocDepartment = normalizeDepartment(drive.spocDept);
  const allowedDepartments = Array.isArray(drive?.eligibility?.allowedDepartments)
    ? drive.eligibility.allowedDepartments.map((department) => normalizeDepartment(department)).filter(Boolean)
    : [];

  if (spocDepartment) {
    return Boolean(currentDepartment && currentDepartment === spocDepartment);
  }

  if (creatorId === user.id) {
    return true;
  }

  if (currentDepartment && creatorDepartment && currentDepartment === creatorDepartment) {
    return true;
  }

  if (!creatorId && currentDepartment) {
    if (allowedDepartments.length === 0) {
      return true;
    }

    return allowedDepartments.includes(currentDepartment);
  }

  return false;
};

const validateDriveTimeline = (driveData) => {
  if (!driveData.deadline || !driveData.date) {
    return null;
  }

  const deadlineDate = new Date(driveData.deadline);
  if (driveData.applicationDeadlineTime) {
    const [hours, minutes] = String(driveData.applicationDeadlineTime).split(":");
    deadlineDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 59, 999);
  } else {
    deadlineDate.setHours(23, 59, 59, 999);
  }

  const driveDate = new Date(driveData.date);
  if (driveData.time) {
    const [hours, minutes] = String(driveData.time).split(":");
    driveDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  } else {
    driveDate.setHours(23, 59, 59, 999);
  }

  if (driveDate <= deadlineDate) {
    return "Drive Date & Time must be AFTER Application Deadline";
  }

  if (Array.isArray(driveData.selectionRounds) && driveData.selectionRounds.length > 0) {
    let previousRoundDate = null;
    for (let index = 0; index < driveData.selectionRounds.length; index += 1) {
      const round = driveData.selectionRounds[index];
      if (!round?.date) {
        continue;
      }

      const roundDate = new Date(round.date);
      if (round.time) {
        const [hours, minutes] = String(round.time).split(":");
        roundDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
      } else {
        roundDate.setHours(0, 0, 0, 0);
      }

      if (roundDate <= deadlineDate) {
        return `Round ${index + 1} (${round.name || "Unnamed Round"}) must start AFTER Application Deadline`;
      }

      if (previousRoundDate && roundDate <= previousRoundDate) {
        return `Round ${index + 1} must start AFTER Round ${index} ends`;
      }

      previousRoundDate = roundDate;
    }

    if (previousRoundDate && driveDate <= previousRoundDate) {
      return "Drive Date & Time must be AFTER the last round";
    }
  }

  return null;
};

const mergeSelectionRounds = (existingRounds = [], nextRounds = []) =>
  (nextRounds || []).map((round, index) => ({
    ...round,
    selectedStudents: round.selectedStudents || existingRounds[index]?.selectedStudents || [],
  }));

const buildCreatePayload = async (req) => {
  const role = req.user.roleNormalized || req.user.role;
  const user = await getCurrentUser(req.user.id);

  const explicitRounds = Array.isArray(req.body.rounds)
    ? req.body.rounds
        .map((round) => (typeof round === "string" ? round.trim() : ""))
        .filter(Boolean)
    : [];

  const derivedRounds = Array.isArray(req.body.selectionRounds)
    ? req.body.selectionRounds
        .map((round) => (typeof round?.name === "string" ? round.name.trim() : ""))
        .filter(Boolean)
    : [];

  const payload = {
    companyName: req.body.companyName,
    companyWebsite: req.body.companyWebsite || "",
    companyDescription: req.body.companyDescription || "",
    recruiterContact: {
      name: req.body.recruiterContact?.name || "",
      email: req.body.recruiterContact?.email || "",
      phone: req.body.recruiterContact?.phone || "",
    },
    driveMode: req.body.driveMode || "on-campus",
    locations: req.body.locations || (req.body.location ? [req.body.location] : []),
    location: req.body.location || "",
    role: req.body.role,
    type: req.body.type || "full-time",
    jobType: req.body.type || req.body.jobType || "full-time",
    description: req.body.description,
    requirements: req.body.requirements || "",
    skills: req.body.skills || [],
    ctc: req.body.ctc,
    ctcBreakdown: {
      baseSalary: req.body.ctcBreakdown?.baseSalary || 0,
      variablePay: req.body.ctcBreakdown?.variablePay || 0,
      joiningBonus: req.body.ctcBreakdown?.joiningBonus || 0,
      otherBenefits: req.body.ctcBreakdown?.otherBenefits || "",
    },
    bond: req.body.bond || "",
    bondDetails: {
      amount: req.body.bondDetails?.amount || 0,
      duration: req.body.bondDetails?.duration || "",
    },
    date: req.body.date,
    time: req.body.time,
    deadline: req.body.deadline,
    applicationDeadlineTime: req.body.applicationDeadlineTime,
    venue: req.body.venue,
    selectionRounds: req.body.selectionRounds || [],
    rounds: explicitRounds.length > 0 ? explicitRounds : derivedRounds,
    isDreamJob: req.body.isDreamJob || false,
    unplacedOnly: req.body.unplacedOnly || false,
    eligibility: {
      minCGPA: req.body.eligibility?.minCGPA || req.body.eligibility?.cgpa || 0,
      maxBacklogs: req.body.eligibility?.maxBacklogs || 0,
      allowedDepartments:
        req.body.eligibility?.allowedDepartments || req.body.eligibility?.departments || [],
      allowedBatches: req.body.eligibility?.allowedBatches || req.body.eligibility?.batches || [],
    },
    spocDept: req.body.spocDept || "",
    testDetails: req.body.testDetails || "",
    interviewProcess: req.body.interviewProcess || "",
    createdBy: req.user.id,
  };

  if (isPlacementRepresentativeRole(role) && user?.profile?.department) {
    payload.spocDept = user.profile.department;
  }

  return payload;
};

const authorizePO = (req, res, next) => {
  const role = req.user.roleNormalized || req.user.role;
  if (!isPlacementStaffRole(role)) {
    return res.status(403).json({
      message: "Access denied - Only Placement Officers and Representatives can perform this action",
    });
  }

  return next();
};

const authorizeSameDepartmentPR = async (req, res, next) => {
  try {
    const role = req.user.roleNormalized || req.user.role;
    if (!isPlacementStaffRole(role) && normalizeRole(role) !== "admin") {
      return res.status(403).json({ message: "Access denied - Only POs and PRs can perform this action" });
    }

    const drive = await loadDrive(req.params.id, true);
    if (!drive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    if (!(await canManageDrive(req.user, drive))) {
      return res.status(403).json({
        message: drive.spocDept
          ? "Access denied - Only PRs from the SPOC department can manage this drive"
          : "Access denied - Only PRs from the same department can manage this drive",
        spocDepartment: drive.spocDept || undefined,
      });
    }

    req.jobDrive = drive;
    req.usedDatabase = "NEON";
    return next();
  } catch (error) {
    console.error("Department authorization error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const authorizeViewOnly = async (req, res, next) => {
  try {
    const drive = await loadDrive(req.params.id, true);
    if (!drive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    const role = req.user.roleNormalized || req.user.role;
    if (req.user.role === "student" || isPlacementOfficerRole(role) || normalizeRole(role) === "admin") {
      req.jobDrive = drive;
      req.viewOnly = true;
      req.usedDatabase = "NEON";
      return next();
    }

    if (isPlacementRepresentativeRole(role)) {
      req.jobDrive = drive;
      req.viewOnly = !(await canManageDrive(req.user, drive));
      req.usedDatabase = "NEON";
      return next();
    }

    return res.status(403).json({ message: "Access denied" });
  } catch (error) {
    console.error("View authorization error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

router.post("/", auth, authorizePO, async (req, res) => {
  try {
    const payload = await buildCreatePayload(req);
    const validationError = validateDriveTimeline(payload);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    logger.logAttempt("NEON", "CREATE", "JobDrive", `Creating job drive: ${payload.companyName}`);
    const drive = await neonService.createJobDrive(payload);

    const io = req.app.get("io");
    emitJobDriveUpdate(io, "created", drive);

    return res.status(201).json({
      message: "Job drive created successfully",
      jobDrive: formatDriveForDisplay(drive),
      database: "NEON",
      success: true,
    });
  } catch (error) {
    console.error("Create job drive error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const query = req.user.role === "student" ? { isActive: true } : {};
    const drives = await neonService.findAllJobDrives(query);
    const processedDrives = drives.map((drive) => formatDriveForDisplay(drive));

    return res.json({
      jobDrives: processedDrives,
      count: processedDrives.length,
      database: "NEON",
    });
  } catch (error) {
    console.error("Error fetching job drives:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/student-drives", auth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Access denied - Students only" });
    }

    const drives = await neonService.getEligibleDrivesForStudent(req.user.id);
    const enriched = await Promise.all(
      drives.map(async (drive) => {
        const hasApplied = await neonService.hasStudentApplied(drive.id || drive._id, req.user.id);
        return {
          ...formatDriveForDisplay(drive),
          hasApplied,
          applications: hasApplied ? [{ student: req.user.id }] : [],
          database: "NEON",
        };
      })
    );

    return res.json({
      drives: enriched,
      count: enriched.length,
         sources: { neon: enriched.length, total: enriched.length },
      database: "NEON",
    });
  } catch (error) {
    console.error("Error fetching student drives:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/all", auth, async (req, res) => {
  try {
    const drives = await neonService.findAllJobDrives({ isActive: true });
    return res.json({
      jobDrives: drives.map((drive) => formatDriveForDisplay(drive)),
      count: drives.length,
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/stats", auth, async (req, res) => {
  try {
    const totalDrives = await neonService.countJobDrives({});
    const upcomingDrives = await neonService.countJobDrives({ isActive: true });

    if (req.user.role === "student") {
      const eligibleDrives = await neonService.getEligibleDrivesForStudent(req.user.id);
      let appliedDrives = 0;
      for (const drive of eligibleDrives) {
        if (await neonService.hasStudentApplied(drive.id || drive._id, req.user.id)) {
          appliedDrives += 1;
        }
      }

      return res.json({
        totalDrives: eligibleDrives.length,
        appliedDrives,
        availableDrives: Math.max(eligibleDrives.length - appliedDrives, 0),
        allDrives: totalDrives,
        database: "NEON",
      });
    }

    const { tableName } = await getApplicationsTableConfig();
    const applicationRows = await neonService.executeRawQuery(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
    return res.json({
      totalDrives: upcomingDrives,
      upcomingDrives,
      applicationsReceived: applicationRows[0]?.count || 0,
      allDrives: totalDrives,
      database: "NEON",
    });
  } catch (error) {
    console.error("Stats error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/apply", auth, requireCompleteProfile, requirePlacementConsent, async (req, res) => {
  try {
    if (!["student", "placement_representative"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied - Students and PRs only" });
    }

    const drive = await loadDrive(req.params.id, false);
    if (!drive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    if (!drive.isActive) {
      return res.status(400).json({ message: "Job drive is not active" });
    }

    const checkDate = drive.deadline || drive.date;
    if (!checkDate) {
      return res.status(400).json({ message: "No deadline or drive date set" });
    }

    const deadlineDate = new Date(checkDate);
    if (drive.applicationDeadlineTime) {
      const [hours, minutes] = String(drive.applicationDeadlineTime).split(":");
      deadlineDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    } else {
      deadlineDate.setHours(23, 59, 59, 999);
    }

    if (deadlineDate < new Date()) {
      return res.status(400).json({ message: "Application deadline has passed" });
    }

    if (await neonService.hasStudentApplied(req.params.id, req.user.id)) {
      return res.status(400).json({ message: "Already applied to this job drive" });
    }

    await neonService.addApplicationToJobDrive(req.params.id, req.user.id);

    const io = req.app.get("io");
    emitJobDriveUpdate(io, "application_submitted", {
      ...drive,
      newApplication: {
        student: req.user.id,
        appliedAt: new Date(),
      },
    });

    return res.json({
      message: "Application submitted successfully",
      application: {
        student: req.user.id,
        appliedAt: new Date(),
        status: "applied",
      },
      database: "NEON",
    });
  } catch (error) {
    console.error("Apply error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", auth, authorizePO, async (req, res) => {
  try {
    const drive = await loadDrive(req.params.id, false);
    if (!drive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    await neonService.deleteJobDrive(req.params.id);

    const io = req.app.get("io");
    emitJobDriveUpdate(io, "deleted", drive);

    return res.json({ message: "Job drive deleted successfully", database: "NEON" });
  } catch (error) {
    console.error("Delete job drive error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/debug/all", async (req, res) => {
  try {
    const drives = await neonService.findAllJobDrives({});
    return res.json({
      total: drives.length,
      database: "NEON",
      drives: drives.map((drive) => ({
        id: drive.id,
        companyName: drive.companyName,
        role: drive.role,
        isActive: drive.isActive,
        createdAt: drive.createdAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/test-all", async (req, res) => {
  try {
    const allDrives = await neonService.findAllJobDrives({});
    const activeDrives = allDrives.filter((drive) => drive.isActive);
    const futureActive = activeDrives.filter((drive) => new Date(drive.date) >= new Date());
    return res.json({
      total: allDrives.length,
      active: activeDrives.length,
      futureActive: futureActive.length,
      database: "NEON",
      drives: allDrives.map((drive) => ({
        id: drive.id,
        company: drive.companyName,
        role: drive.role,
        date: drive.date,
        isActive: drive.isActive,
        createdAt: drive.createdAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/debug/eligibility", auth, async (req, res) => {
  try {
    const user = await getCurrentUser(req.user.id);
    const allDrives = await neonService.findAllJobDrives({ isActive: true });
    const eligibleIds = new Set((await neonService.getEligibleDrivesForStudent(req.user.id)).map((drive) => drive.id || drive._id));

    return res.json({
      database: "NEON",
      user: {
        cgpa: user?.profile?.cgpa,
        department: user?.profile?.department,
        currentBacklogs: user?.profile?.currentBacklogs,
      },
      drives: allDrives.map((drive) => ({
        id: drive.id,
        company: drive.companyName,
        role: drive.role,
        isActive: drive.isActive,
        date: drive.date,
        eligibility: drive.eligibility,
        eligible: eligibleIds.has(drive.id),
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/pr-jobs", auth, async (req, res) => {
  try {
    if (!isPlacementRepresentativeRole(req.user.roleNormalized || req.user.role)) {
      return res.status(403).json({ message: "Access denied - Only PRs can access this" });
    }

    const jobs = await neonService.findAllJobDrives({ createdBy: req.user.id });
    return res.json({ jobs: jobs.map((job) => formatDriveForDisplay(job)), database: "NEON" });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/pr-stats", auth, async (req, res) => {
  try {
    if (!isPlacementRepresentativeRole(req.user.roleNormalized || req.user.role)) {
      return res.status(403).json({ message: "Access denied - Only PRs can access this" });
    }

    const stats = await neonService.getPRStats(req.user.id);
    return res.json({
      totalJobs: parseInt(stats.total_drives || 0, 10),
      activeJobs: parseInt(stats.active_drives || 0, 10),
      pendingApplications: 0,
      totalApplications: parseInt(stats.total_applications || 0, 10),
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/pr-applications", auth, async (req, res) => {
  try {
    if (!isPlacementRepresentativeRole(req.user.roleNormalized || req.user.role)) {
      return res.status(403).json({ message: "Access denied - Only PRs can access this" });
    }

    const { tableName, driveColumn, studentColumn } = await getApplicationsTableConfig();
    const rows = await neonService.executeRawQuery(
      `
      SELECT
        jda.id,
        jda.status,
        jda.applied_at,
        jda.${studentColumn} AS student_id,
        jd.id AS job_drive_id,
        jd.company_name,
        jd.role AS job_role,
        jd.drive_date,
        u.email,
        up.profile_name,
        up.department,
        up.roll_number,
        up.cgpa
      FROM ${tableName} jda
      JOIN job_drives jd ON jd.id = jda.${driveColumn}
      LEFT JOIN users u ON u.id = jda.${studentColumn}
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE jd.created_by = $1
      ORDER BY jda.applied_at DESC
      `,
      [req.user.id]
    );

    const applications = rows.map((row) => ({
      _id: row.id,
      student: {
        _id: row.student_id,
        email: row.email,
        profile: {
          name: row.profile_name,
          department: row.department,
          rollNumber: row.roll_number,
          cgpa: row.cgpa,
        },
      },
      jobDrive: {
        _id: row.job_drive_id,
        companyName: row.company_name,
        role: row.job_role,
        date: row.drive_date,
      },
      status: row.status,
      appliedAt: row.applied_at,
    }));

    return res.json({ applications, database: "NEON" });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/department-applications/:department", auth, async (req, res) => {
  try {
    const { tableName, studentColumn } = await getApplicationsTableConfig();
    const rows = await neonService.executeRawQuery(
      `
      SELECT COUNT(*)::int AS count
      FROM ${tableName} jda
      JOIN user_profiles up ON up.user_id = jda.${studentColumn}
      WHERE up.department = $1
      `,
      [decodeURIComponent(req.params.department)]
    );

    return res.json({ count: rows[0]?.count || 0, database: "NEON" });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/debug/drive/:id", async (req, res) => {
  try {
    const drive = await loadDrive(req.params.id, true);
    if (!drive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    return res.json({
      drive,
      database: "NEON",
      fields: {
        type: drive.type,
        jobType: drive.jobType,
        location: drive.location,
        locations: drive.locations,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/department/:department", auth, async (req, res) => {
  try {
    const department = decodeURIComponent(req.params.department);
    const drives = await neonService.findAllJobDrives({ isActive: true });
    const filtered = drives.filter((drive) =>
      Array.isArray(drive.eligibility?.allowedDepartments)
        ? drive.eligibility.allowedDepartments.includes(department)
        : false
    );

    return res.json({
      jobDrives: filtered.map((drive) => formatDriveForDisplay(drive)),
      count: filtered.length,
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/:id/students", auth, async (req, res) => {
  try {
    const applications = await neonService.getJobDriveApplications(req.params.id);
    const students = applications.map((application) => ({
      _id: application.student_id || application.user_id,
      name: application.name || "N/A",
      email: application.email || "N/A",
      rollNumber: application.roll_number || "N/A",
      department: application.department || "N/A",
      cgpa: application.cgpa ?? "N/A",
      mobileNumber: application.phone || "N/A",
      degree: "N/A",
      appliedAt: application.applied_at,
      status: application.status || "applied",
    }));

    return res.json({ students, database: "NEON" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/:id/finalize-placement", auth, authorizeSameDepartmentPR, async (req, res) => {
  try {
    const drive = req.jobDrive;
    if (!drive.selectionRounds || drive.selectionRounds.length === 0) {
      return res.status(400).json({ message: "No selection rounds found" });
    }

    const lastRound = drive.selectionRounds[drive.selectionRounds.length - 1];
    const selectedIds = (lastRound.selectedStudents || []).filter((studentId) => isUuid(studentId));
    if (selectedIds.length === 0) {
      return res.status(400).json({ message: "No students selected in final round" });
    }

    if (drive.placementFinalized) {
      return res.status(400).json({ message: "Placement already finalized for this drive" });
    }

    const profiles = await fetchStudentProfilesByIds(selectedIds);
    const placedStudents = selectedIds
      .map((studentId) => {
        const profile = profiles.get(studentId);
        if (!profile) {
          return null;
        }

        return {
          studentId,
          name: profile.name,
          rollNumber: profile.rollNumber,
          department: profile.department,
          email: profile.email,
          mobileNumber: profile.mobileNumber,
          cgpa: profile.cgpa === "N/A" ? 0 : profile.cgpa,
          addedBy: req.user.id,
          addedAt: new Date(),
          status: "placed",
        };
      })
      .filter(Boolean);

    if (placedStudents.length === 0) {
      return res.status(400).json({ message: "No valid student data found for selected students" });
    }

    const updatedDrive = await neonService.updateJobDrive(req.params.id, {
      placedStudents,
      addedBy: req.user.id,
    });

    const io = req.app.get("io");
    emitJobDriveUpdate(io, "placement_finalized", updatedDrive);

    return res.json({
      message: `Successfully finalized placement for ${placedStudents.length} students`,
      placedStudents,
      totalPlacedStudents: updatedDrive.placedStudents?.length || placedStudents.length,
      database: "NEON",
    });
  } catch (error) {
    console.error("Error finalizing placement:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.put("/:id/update-placed-student", auth, authorizeSameDepartmentPR, async (req, res) => {
  try {
    const { index, studentData } = req.body;
    const drive = req.jobDrive;
    if (!Array.isArray(drive.placedStudents) || index >= drive.placedStudents.length) {
      return res.status(400).json({ message: "Invalid student index" });
    }

    const nextPlacedStudents = [...drive.placedStudents];
    nextPlacedStudents[index] = {
      ...nextPlacedStudents[index],
      ...studentData,
    };

    const updatedDrive = await neonService.updateJobDrive(req.params.id, {
      placedStudents: nextPlacedStudents,
      addedBy: req.user.id,
    });

    return res.json({
      message: "Placed student updated successfully",
      placedStudents: updatedDrive.placedStudents,
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.delete("/:id/delete-placed-student", auth, authorizeSameDepartmentPR, async (req, res) => {
  try {
    const { index } = req.body;
    const drive = req.jobDrive;
    if (!Array.isArray(drive.placedStudents) || index >= drive.placedStudents.length) {
      return res.status(400).json({ message: "Invalid student index" });
    }

    const nextPlacedStudents = [...drive.placedStudents];
    nextPlacedStudents.splice(index, 1);

    const updatedDrive = await neonService.updateJobDrive(req.params.id, {
      placedStudents: nextPlacedStudents,
      addedBy: req.user.id,
    });

    return res.json({
      message: "Placed student removed successfully",
      placedStudents: updatedDrive.placedStudents,
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.patch("/:id/rounds/:roundIndex/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    const roundIndex = parseInt(req.params.roundIndex, 10);
    const drive = await loadDrive(req.params.id, false);

    if (!drive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    if (!Array.isArray(drive.selectionRounds) || roundIndex >= drive.selectionRounds.length) {
      return res.status(400).json({ message: "Invalid round index" });
    }

    const nextRounds = [...drive.selectionRounds];
    nextRounds[roundIndex] = {
      ...nextRounds[roundIndex],
      status,
    };

    const updatedDrive = await neonService.updateJobDrive(req.params.id, { selectionRounds: nextRounds });
    const io = req.app.get("io");
    emitJobDriveUpdate(io, "round_status_updated", updatedDrive);

    return res.json({
      message: "Round status updated successfully",
      selectionRounds: updatedDrive.selectionRounds,
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/:id/rounds/:roundIndex/select-students", auth, authorizeSameDepartmentPR, async (req, res) => {
  try {
    const roundIndex = parseInt(req.params.roundIndex, 10);
    const studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds.filter((id) => isUuid(id)) : [];
    const drive = req.jobDrive;

    if (!Array.isArray(drive.selectionRounds) || roundIndex >= drive.selectionRounds.length) {
      return res.status(400).json({ message: "Invalid round index" });
    }

    const nextRounds = [...drive.selectionRounds];
    nextRounds[roundIndex] = {
      ...nextRounds[roundIndex],
      selectedStudents: studentIds,
    };

    const updatedDrive = await neonService.updateJobDrive(req.params.id, { selectionRounds: nextRounds });
    const io = req.app.get("io");
    emitJobDriveUpdate(io, "students_selected", updatedDrive);

    return res.json({
      message: "Students selected successfully",
      selectionRounds: updatedDrive.selectionRounds,
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.patch("/:id/rounds/:roundIndex/complete", auth, async (req, res) => {
  try {
    const roundIndex = parseInt(req.params.roundIndex, 10);
    const drive = await loadDrive(req.params.id, false);

    if (!drive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    if (!Array.isArray(drive.selectionRounds) || roundIndex >= drive.selectionRounds.length) {
      return res.status(400).json({ message: "Invalid round index" });
    }

    const nextRounds = [...drive.selectionRounds];
    nextRounds[roundIndex] = {
      ...nextRounds[roundIndex],
      status: "completed",
    };

    const updatedDrive = await neonService.updateJobDrive(req.params.id, { selectionRounds: nextRounds });
    const io = req.app.get("io");
    emitJobDriveUpdate(io, "round_completed", updatedDrive);

    return res.json({
      message: "Round completed successfully",
      selectionRounds: updatedDrive.selectionRounds,
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/:id/add-selection-rounds", auth, async (req, res) => {
  try {
    const drive = await loadDrive(req.params.id, false);
    if (!drive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    const selectionRounds = Array.isArray(req.body.selectionRounds) ? req.body.selectionRounds : [];
    const updatedDrive = await neonService.updateJobDrive(req.params.id, { selectionRounds });
    const io = req.app.get("io");
    emitJobDriveUpdate(io, "selection_rounds_added", updatedDrive);

    return res.json({
      message: "Selection rounds added successfully",
      jobDrive: updatedDrive,
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/:id/debug-applications", auth, async (req, res) => {
  try {
    const applications = await fetchApplicationsForDrive(req.params.id);
    return res.json({
      raw: applications,
      note: "Applications are loaded from Neon relational tables",
      database: "NEON",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/:id/get-students-by-ids", auth, async (req, res) => {
  try {
    const studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds.filter((id) => isUuid(id)) : [];
    const profiles = await fetchStudentProfilesByIds(studentIds);
    const students = studentIds
      .map((studentId) => profiles.get(studentId))
      .filter(Boolean)
      .map((student) => ({
        _id: student.id,
        name: student.name,
        email: student.email,
        rollNumber: student.rollNumber,
        department: student.department,
        cgpa: student.cgpa,
        mobileNumber: student.mobileNumber,
        degree: student.degree,
        profile: student.profile,
      }));

    return res.json({ students, total: students.length, database: "NEON" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/:id/applicants", auth, async (req, res) => {
  try {
    const drive = await loadDrive(req.params.id, true);
    if (!drive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    const role = req.user.roleNormalized || req.user.role;
    if (isPlacementOfficerRole(role) || normalizeRole(role) === "admin") {
      return res.json({ applicants: drive.applications || [], source: "NEON" });
    }

    if (isPlacementRepresentativeRole(role) && (await canManageDrive(req.user, drive))) {
      return res.json({ applicants: drive.applications || [], source: "NEON" });
    }

    return res.status(403).json({ message: "Access denied - Only PRs from the same department can view applicants" });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/:id/last-round-students", auth, async (req, res) => {
  try {
    const drive = await loadDrive(req.params.id, false);
    if (!drive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    if (!Array.isArray(drive.selectionRounds) || drive.selectionRounds.length === 0) {
      return res.json({ students: [], database: "NEON" });
    }

    const lastRound = drive.selectionRounds[drive.selectionRounds.length - 1];
    const profiles = await fetchStudentProfilesByIds(lastRound.selectedStudents || []);
    const students = (lastRound.selectedStudents || [])
      .map((studentId) => profiles.get(studentId))
      .filter(Boolean)
      .map((student) => ({
        name: student.name,
        rollNumber: student.rollNumber,
        department: student.department,
        cgpa: student.cgpa,
        email: student.email,
        mobileNumber: student.mobileNumber,
        addedAt: new Date(),
      }));

    return res.json({ students, database: "NEON" });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/pr-drives", auth, async (req, res) => {
  try {
    if (!isPlacementRepresentativeRole(req.user.roleNormalized || req.user.role)) {
      return res.status(403).json({ message: "Access denied - PRs only" });
    }

    const drives = await neonService.getEligibleDrivesForStudent(req.user.id);
    const enriched = await Promise.all(
      drives.map(async (drive) => ({
        ...formatDriveForDisplay(drive),
        hasApplied: await neonService.hasStudentApplied(drive.id || drive._id, req.user.id),
      }))
    );

    return res.json({ jobDrives: enriched, count: enriched.length, database: "NEON" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/:id", auth, authorizeViewOnly, async (req, res) => {
  try {
    const drive = req.jobDrive;
    if (req.viewOnly) {
      return res.json({
        jobDrive: {
          ...drive,
          applications: [],
          canManage: false,
          viewOnly: true,
        },
        database: req.usedDatabase,
      });
    }

    return res.json({
      jobDrive: drive,
      canManage: true,
      viewOnly: false,
      database: req.usedDatabase,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const role = req.user.roleNormalized || req.user.role;
    const drive = await loadDrive(req.params.id, true);
    if (!drive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    if (isPlacementRepresentativeRole(role)) {
      if (!(await canManageDrive(req.user, drive))) {
        return res.status(403).json({ message: "Access denied - You do not have permission to edit this drive" });
      }

      if (req.body.spocDept && req.body.spocDept !== drive.spocDept) {
        return res.status(403).json({
          message: "Access denied - PRs cannot change the SPOC Department",
          originalSpocDept: drive.spocDept,
        });
      }
    } else if (!isPlacementOfficerRole(role) && normalizeRole(role) !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const nextBody = { ...req.body };
    if (Array.isArray(req.body.selectionRounds)) {
      nextBody.selectionRounds = mergeSelectionRounds(drive.selectionRounds, req.body.selectionRounds);
    }

    const validationTarget = {
      ...drive,
      ...nextBody,
      selectionRounds: nextBody.selectionRounds || drive.selectionRounds,
    };
    const validationError = validateDriveTimeline(validationTarget);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const updatedDrive = await neonService.updateJobDrive(req.params.id, nextBody);
    const io = req.app.get("io");
    emitJobDriveUpdate(io, "updated", updatedDrive);

    return res.json({
      message: "Job drive updated successfully",
      jobDrive: updatedDrive,
      database: "NEON",
    });
  } catch (error) {
    console.error("Update job drive error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;