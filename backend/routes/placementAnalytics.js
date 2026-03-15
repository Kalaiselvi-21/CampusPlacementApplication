const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { auth } = require("../middleware/auth");
const neonService = require("../services/database/neonService");
const logger = require("../services/database/logger");
const { emitPlacementDataUpdate } = require("../utils/socketUtils");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "../uploads/placement-data/");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const batch = req.body.batch || "unknown";
    const ext = path.extname(file.originalname);
    cb(null, `${batch}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /csv|pdf/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Only CSV and PDF files are allowed"));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const saveAnalyticsToNeon = async ({ batch, userId, placementData, statistics, fileName, filePath }) => {
  let analyticsId;
  const existing = await neonService.executeRawQuery(
    "SELECT id FROM placement_analytics WHERE batch = $1 LIMIT 1",
    [batch]
  );

  if (existing[0]) {
    analyticsId = existing[0].id;
    await neonService.executeRawQuery(
      `
      UPDATE placement_analytics
      SET
        uploaded_by = $2,
        total_students = $3,
        placed_students = $4,
        placement_rate = $5,
        average_package = $6,
        highest_package = $7,
        lowest_package = $8,
        total_companies = $9,
        file_name = $10,
        file_path = $11,
        uploaded_at = NOW(),
        updated_at = NOW()
      WHERE batch = $1
      `,
      [
        batch,
        userId,
        statistics.totalStudents || 0,
        statistics.placedStudents || 0,
        statistics.placementRate || 0,
        statistics.averagePackage || 0,
        statistics.highestPackage || 0,
        statistics.lowestPackage || 0,
        statistics.totalCompanies || 0,
        fileName || null,
        filePath || null,
      ]
    );
  } else {
    const rows = await neonService.executeRawQuery(
      `
      INSERT INTO placement_analytics (
        id, batch, uploaded_by, total_students, placed_students, placement_rate,
        average_package, highest_package, lowest_package, total_companies,
        file_name, file_path, uploaded_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW()
      )
      RETURNING id
      `,
      [
        batch,
        userId,
        statistics.totalStudents || 0,
        statistics.placedStudents || 0,
        statistics.placementRate || 0,
        statistics.averagePackage || 0,
        statistics.highestPackage || 0,
        statistics.lowestPackage || 0,
        statistics.totalCompanies || 0,
        fileName || null,
        filePath || null,
      ]
    );
    analyticsId = rows[0].id;
  }

  await neonService.executeRawQuery("DELETE FROM placement_analytics_data WHERE analytics_id = $1", [analyticsId]);
  await neonService.executeRawQuery("DELETE FROM department_statistics WHERE analytics_id = $1", [analyticsId]);
  await neonService.executeRawQuery("DELETE FROM company_statistics WHERE analytics_id = $1", [analyticsId]);

  for (const student of placementData || []) {
    await neonService.executeRawQuery(
      `
      INSERT INTO placement_analytics_data (
        id, analytics_id, student_name, department, company, package, status, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW()
      )
      `,
      [
        analyticsId,
        student.name || null,
        student.department || null,
        student.company || null,
        student.package ? Number(student.package) : 0,
        student.status || null,
      ]
    );
  }

  for (const dept of statistics.departmentStats || []) {
    const deptRows = await neonService.executeRawQuery(
      `
      INSERT INTO department_statistics (
        id, analytics_id, department, total_students, placed_students, placement_rate,
        highest_package, lowest_package, total_companies, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW()
      ) RETURNING id
      `,
      [
        analyticsId,
        dept.department,
        dept.totalStudents || 0,
        dept.placedStudents || 0,
        dept.placementRate || 0,
        dept.highestPackage || 0,
        dept.lowestPackage || 0,
        dept.totalCompanies || 0,
      ]
    );
    const departmentStatId = deptRows[0].id;

    for (const company of dept.companies || []) {
      await neonService.executeRawQuery(
        `
        INSERT INTO department_company_stats (
          id, department_stat_id, company_name, students_placed, average_package, packages, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, NOW()
        )
        `,
        [
          departmentStatId,
          company.name,
          company.studentsPlaced || 0,
          company.averagePackage || 0,
          [],
        ]
      );
    }
  }

  for (const company of statistics.companyStats || []) {
    await neonService.executeRawQuery(
      `
      INSERT INTO company_statistics (
        id, analytics_id, company_name, students_placed, average_package, highest_package, lowest_package, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW()
      )
      `,
      [
        analyticsId,
        company.name,
        company.studentsPlaced || 0,
        company.averagePackage || 0,
        company.highestPackage || 0,
        company.lowestPackage || 0,
      ]
    );
  }

  return analyticsId;
};

// Helper function to parse complex CSVs with department sections and extra columns
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    try {
      const data = fs.readFileSync(filePath, "utf8");
      const lines = data.split(/\r?\n/).filter((line) => line.trim());
      const results = [];
      let currentDepartment = "";
      let header = null;
      let headerMap = {};
      let parsingStudents = false;

      // Helper to normalize header names
      const normalize = (str) => str.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Detect department section
        const deptMatch = line.match(/^Department *[:-] *(.*)/i);
        if (deptMatch) {
          currentDepartment = deptMatch[1].trim();
          parsingStudents = false;
          continue;
        }
        // Detect student table header
        if (
          line.toLowerCase().includes("name") &&
          line.toLowerCase().includes("company")
        ) {
          header = line.split(",").map((h) => h.trim());
          // Build a map from normalized header to index
          headerMap = {};
          header.forEach((h, idx) => {
            const norm = normalize(h);
            if (norm.includes("name") && !norm.includes("company"))
              headerMap["name"] = idx;
            if (norm.includes("department")) headerMap["department"] = idx;
            if (norm.includes("company")) headerMap["company"] = idx;
            // Robust: match any header containing 'package' or 'ctc'
            if (norm.includes("package") || norm.includes("ctc"))
              headerMap["package"] = idx;
          });
          // DEBUG: log headerMap for development
          console.log("Detected headerMap:", headerMap);
          parsingStudents = true;
          continue;
        }
        // Skip the line with (In LPA) etc.
        if (parsingStudents && line.toLowerCase().includes("in lpa")) continue;
        // Parse student row
        if (parsingStudents && header && line.match(/\d/)) {
          const values = line.split(",");
          // Defensive: skip if not enough columns
          if (values.length < Object.keys(headerMap).length) continue;
          const name = values[headerMap["name"]]?.trim() || "";
          const department =
            values[headerMap["department"]]?.trim() || currentDepartment || "";
          const company = values[headerMap["company"]]?.trim() || "";
          const pkg = values[headerMap["package"]]?.trim() || "";
          // Infer status
          const status =
            company && pkg && pkg !== "0" ? "Placed" : "Not Placed";
          if (name) {
            const row = {
              name,
              department,
              company,
              package: pkg,
              status,
            };
            // DEBUG: log a sample parsed row
            if (results.length < 2) console.log("Sample parsed row:", row);
            results.push(row);
          }
        }
        // If we hit an empty line or a new section, stop parsing students
        if (parsingStudents && (!line || line.startsWith("Department :-"))) {
          parsingStudents = false;
        }
      }
      resolve(results);
    } catch (error) {
      reject(error);
    }
  });
};

// Helper to robustly parse package/CTC values (always returns a float in LPA)
function parsePackage(val) {
  if (!val) return 0;
  // Remove all non-numeric except dot and minus
  const cleaned = val.toString().replace(/[^0-9.\-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Helper to normalize company names for grouping
function normalizeCompanyName(name) {
  if (!name) return "";
  // More sophisticated normalization
  return name
    .replace(/[^a-zA-Z0-9]/g, "") // Remove special characters
    .replace(/\s+/g, "") // Remove spaces
    .replace(/ltd|limited|pvt|private|inc|corp|corporation/gi, "") // Remove common suffixes
    .replace(/&/g, "and") // Replace & with 'and'
    .toUpperCase();
}

// Helper function to generate statistics
const generateStatistics = (data) => {
  if (!data || data.length === 0) {
    return {
      totalStudents: 0,
      placedStudents: 0,
      placementRate: 0,
      averagePackage: 0,
      highestPackage: 0,
      lowestPackage: 0,
      totalCompanies: 0,
      departmentStats: [],
      companyStats: [],
    };
  }

  const totalStudents = data.length;
  const placedStudents = data.filter(
    (student) =>
      student.status === "Placed" || student.company || student.Company
  ).length;

  const placementRate =
    totalStudents > 0 ? Math.round((placedStudents / totalStudents) * 100) : 0;

  // Process packages
  const packages = data
    .filter((student) => student.package || student.Package)
    .map((student) => parsePackage(student.package || student.Package))
    .filter((amount) => amount > 0);

  const averagePackage =
    packages.length > 0
      ? Math.round(
          (packages.reduce((sum, pkg) => sum + pkg, 0) / packages.length) * 100
        ) / 100
      : 0;

  const highestPackage = packages.length > 0 ? Math.max(...packages) : 0;
  const lowestPackage = packages.length > 0 ? Math.min(...packages) : 0;

  // Generate department statistics
  const departmentMap = new Map();
  data.forEach((student) => {
    const dept = (student.department || student.Department || "Unknown").trim();
    const company = (student.company || student.Company || "").trim();
    const normCompany = normalizeCompanyName(company);
    const packageVal = student.package || student.Package || 0;
    const pkg = parsePackage(packageVal);

    if (!departmentMap.has(dept)) {
      departmentMap.set(dept, {
        department: dept,
        totalStudents: 0,
        placedStudents: 0,
        companies: new Map(),
      });
    }

    const deptStats = departmentMap.get(dept);
    deptStats.totalStudents++;

    if (company) {
      deptStats.placedStudents++;
      if (!deptStats.companies.has(normCompany)) {
        deptStats.companies.set(normCompany, {
          displayNames: {}, // for most common/original name
          studentsPlaced: 0,
          packages: [],
        });
      }
      const companyStats = deptStats.companies.get(normCompany);
      // Track display name frequency
      if (!companyStats.displayNames[company])
        companyStats.displayNames[company] = 0;
      companyStats.displayNames[company]++;
      companyStats.studentsPlaced++;
      if (pkg > 0) {
        companyStats.packages.push(pkg);
      }
    }
  });

  const departmentStats = Array.from(departmentMap.values()).map((dept) => {
    const companyPackages = Array.from(dept.companies.values()).flatMap(
      (company) => company.packages
    );
    const deptHighestPackage =
      companyPackages.length > 0 ? Math.max(...companyPackages) : 0;
    const deptLowestPackage =
      companyPackages.length > 0 ? Math.min(...companyPackages) : 0;

    return {
      department: dept.department,
      totalStudents: dept.totalStudents,
      placedStudents: dept.placedStudents,
      placementRate:
        dept.totalStudents > 0
          ? Math.round((dept.placedStudents / dept.totalStudents) * 100)
          : 0,
      highestPackage: deptHighestPackage,
      lowestPackage: deptLowestPackage,
      totalCompanies: dept.companies.size,
      companies: Array.from(dept.companies.values()).map((company) => {
        // Pick the most common display name
        const displayName = Object.entries(company.displayNames).sort(
          (a, b) => b[1] - a[1]
        )[0][0];
        const avgPackage =
          company.packages.length > 0
            ? Math.round(
                (company.packages.reduce((sum, pkg) => sum + pkg, 0) /
                  company.packages.length) *
                  100
              ) / 100
            : 0;
        return {
          name: displayName,
          studentsPlaced: company.studentsPlaced,
          averagePackage: avgPackage,
        };
      }),
    };
  });

  // Generate company statistics (across all departments)
  const companyMap = new Map();
  data.forEach((student) => {
    const company = (student.company || student.Company || "").trim();
    const normCompany = normalizeCompanyName(company);
    const packageVal = student.package || student.Package || 0;
    const pkg = parsePackage(packageVal);

    if (company) {
      if (!companyMap.has(normCompany)) {
        companyMap.set(normCompany, {
          displayNames: {},
          studentsPlaced: 0,
          packages: [],
        });
      }
      const companyStats = companyMap.get(normCompany);
      if (!companyStats.displayNames[company])
        companyStats.displayNames[company] = 0;
      companyStats.displayNames[company]++;
      companyStats.studentsPlaced++;
      if (pkg > 0) {
        companyStats.packages.push(pkg);
      }
    }
  });

  const companyStats = Array.from(companyMap.values()).map((company) => {
    const displayName = Object.entries(company.displayNames).sort(
      (a, b) => b[1] - a[1]
    )[0][0];
    const avgPackage =
      company.packages.length > 0
        ? Math.round(
            (company.packages.reduce((sum, pkg) => sum + pkg, 0) /
              company.packages.length) *
              100
          ) / 100
        : 0;
    const highestPkg =
      company.packages.length > 0 ? Math.max(...company.packages) : 0;
    const lowestPkg =
      company.packages.length > 0 ? Math.min(...company.packages) : 0;
    return {
      name: displayName,
      studentsPlaced: company.studentsPlaced,
      averagePackage: avgPackage,
      highestPackage: highestPkg,
      lowestPackage: lowestPkg,
    };
  });

  return {
    totalStudents,
    placedStudents,
    placementRate,
    averagePackage,
    highestPackage,
    lowestPackage,
    totalCompanies: companyStats.length,
    departmentStats,
    companyStats,
  };
};

// Get all batches
router.get("/batches", auth, async (req, res) => {
  try {
    console.log("Fetching batches...");

    let batches = [];
    let usedDatabase = null;

    // Try NeonDB first (PRIMARY)
    try {
      logger.logAttempt('NEON', 'READ', 'PlacementAnalytics', 'Fetching all batches');
      const readStartTime = Date.now();
      
      const rows = await neonService.executeRawQuery(
        "SELECT batch FROM placement_analytics ORDER BY batch DESC"
      );
      batches = rows.map((r) => r.batch);
      
      const readDuration = Date.now() - readStartTime;
      logger.logSuccess('NEON', 'READ', 'PlacementAnalytics', `Found ${batches.length} batches in ${readDuration}ms`);
      logger.logPerformance('READ', 'PlacementAnalytics', readDuration, 'NeonDB');
      usedDatabase = 'NEON';
      
      console.log("Found batches in Neon:", batches);
      return res.json({ batches, database: usedDatabase });
    } catch (neonError) {
      logger.logFailure("NEON", "READ", "PlacementAnalytics", neonError.message || neonError);
      return res.status(502).json({ message: "NeonDB read failed", error: neonError.message });
    }
  } catch (error) {
    console.error("Error fetching batches:", error);
    logger.logFailure('SYSTEM', 'READ', 'PlacementAnalytics', error.message);
    res.status(500).json({ message: "Error fetching batches", error: error.message });
  }
});

// Add new batch
router.post("/batches", auth, async (req, res) => {
  try {
    console.log("Adding new batch:", req.body);
    const { batchName } = req.body;

    if (!batchName) {
      return res.status(400).json({ message: "Batch name is required" });
    }

    let usedDatabase = null;

    // Try NeonDB first (PRIMARY)
    try {
      logger.logAttempt('NEON', 'CREATE', 'PlacementAnalytics', `Adding new batch: ${batchName}`);
      const createStartTime = Date.now();
      
      const existing = await neonService.executeRawQuery(
        "SELECT id FROM placement_analytics WHERE batch = $1 LIMIT 1",
        [batchName]
      );
      if (existing[0]) {
        return res.status(400).json({ message: "Batch already exists" });
      }

      await neonService.executeRawQuery(
        `
        INSERT INTO placement_analytics (
          id, batch, uploaded_by, total_students, placed_students, placement_rate,
          average_package, highest_package, lowest_package, total_companies,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, 0, 0, 0, 0, 0, 0, 0, NOW(), NOW()
        )
        `,
        [batchName, req.user.id]
      );

      const createDuration = Date.now() - createStartTime;
      logger.logSuccess('NEON', 'CREATE', 'PlacementAnalytics', `Batch added in ${createDuration}ms`, batchName);
      logger.logPerformance('CREATE', 'PlacementAnalytics', createDuration, 'NeonDB');
      usedDatabase = 'NEON';

      const io = req.app.get("io");
      if (io) {
        emitPlacementDataUpdate(io, "batch_added", { batchName });
      }

      return res.json({ message: "Batch added successfully", database: usedDatabase });
    } catch (neonError) {
      logger.logFailure("NEON", "CREATE", "PlacementAnalytics", neonError.message || neonError);
      return res.status(502).json({ message: "NeonDB create failed", error: neonError.message });
    }
  } catch (error) {
    console.error("Error adding batch:", error);
    logger.logFailure('SYSTEM', 'CREATE', 'PlacementAnalytics', error.message);
    res.status(500).json({ message: "Error adding batch", error: error.message });
  }
});

// Upload and process placement data
router.post("/upload", auth, upload.single("file"), async (req, res) => {
  try {
    const { batch } = req.body;

    if (!batch) {
      return res.status(400).json({ message: "Batch is required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "File is required" });
    }

    let placementData = [];
    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    if (fileExt === ".csv") {
      placementData = await parseCSV(filePath);
    } else if (fileExt === ".pdf") {
      placementData = [];
    }

    const statistics = generateStatistics(placementData);
    let usedDatabase = null;

    // Try NeonDB first (PRIMARY)
    try {
      logger.logAttempt('NEON', 'UPDATE', 'PlacementAnalytics', `Uploading placement data for batch: ${batch}`);
      const uploadStartTime = Date.now();
      
      await saveAnalyticsToNeon({
        batch,
        userId: req.user.id,
        placementData,
        statistics,
        fileName: req.file.originalname,
        filePath,
      });

      const uploadDuration = Date.now() - uploadStartTime;
      logger.logSuccess('NEON', 'UPDATE', 'PlacementAnalytics', `Data uploaded in ${uploadDuration}ms`, batch);
      logger.logPerformance('UPDATE', 'PlacementAnalytics', uploadDuration, 'NeonDB');
      usedDatabase = 'NEON';

      const io = req.app.get("io");
      if (io) {
        emitPlacementDataUpdate(io, "data_uploaded", {
          batch,
          statistics,
          fileName: req.file.originalname,
        });
      }

      return res.json({ 
        message: "File uploaded and analytics generated successfully",
        database: usedDatabase
      });
    } catch (neonError) {
      logger.logFailure("NEON", "UPDATE", "PlacementAnalytics", neonError.message || neonError);
      return res.status(502).json({ message: "NeonDB upload failed", error: neonError.message });
    }
  } catch (error) {
    console.error("Upload error:", error);
    logger.logFailure('SYSTEM', 'UPDATE', 'PlacementAnalytics', error.message);
    res.status(500).json({ message: "Error processing file", error: error.message });
  }
});

// Get analytics for a batch
router.get("/:batch", auth, async (req, res) => {
  try {
    const { batch } = req.params;
    let usedDatabase = null;

    // Try NeonDB first (PRIMARY)
    try {
      logger.logAttempt('NEON', 'READ', 'PlacementAnalytics', `Fetching analytics for batch: ${batch}`);
      const readStartTime = Date.now();
      
      const rows = await neonService.executeRawQuery(
        "SELECT * FROM placement_analytics WHERE batch = $1 LIMIT 1",
        [batch]
      );
      const analytics = rows[0];
      
      if (analytics) {
        const deptRows = await neonService.executeRawQuery(
          "SELECT id, department, total_students, placed_students, placement_rate, highest_package, lowest_package, total_companies FROM department_statistics WHERE analytics_id = $1",
          [analytics.id]
        );
        const companyRows = await neonService.executeRawQuery(
          "SELECT company_name, students_placed, average_package, highest_package, lowest_package FROM company_statistics WHERE analytics_id = $1 ORDER BY students_placed DESC",
          [analytics.id]
        );

        // Fetch per-department company stats
        const deptCompanyMap = new Map();
        if (deptRows.length > 0) {
          const deptIds = deptRows.map((d) => d.id).filter(Boolean);
          if (deptIds.length > 0) {
            const deptCompanyRows = await neonService.executeRawQuery(
              "SELECT department_stat_id, company_name, students_placed, average_package FROM department_company_stats WHERE department_stat_id = ANY($1)",
              [deptIds]
            );
            for (const row of deptCompanyRows) {
              if (!deptCompanyMap.has(row.department_stat_id)) {
                deptCompanyMap.set(row.department_stat_id, []);
              }
              deptCompanyMap.get(row.department_stat_id).push({
                name: row.company_name,
                studentsPlaced: row.students_placed || 0,
                averagePackage: Number(row.average_package || 0),
              });
            }
          }
        }
        
        const readDuration = Date.now() - readStartTime;
        logger.logSuccess('NEON', 'READ', 'PlacementAnalytics', `Analytics fetched in ${readDuration}ms`, batch);
        logger.logPerformance('READ', 'PlacementAnalytics', readDuration, 'NeonDB');
        usedDatabase = 'NEON';
        
        return res.json({
          analytics: {
            totalStudents: analytics.total_students || 0,
            placedStudents: analytics.placed_students || 0,
            placementRate: Number(analytics.placement_rate || 0),
            averagePackage: Number(analytics.average_package || 0),
            highestPackage: Number(analytics.highest_package || 0),
            lowestPackage: Number(analytics.lowest_package || 0),
            totalCompanies: analytics.total_companies || 0,
            departmentStats: deptRows.map((d) => ({
              department: d.department,
              totalStudents: d.total_students,
              placedStudents: d.placed_students,
              placementRate: Number(d.placement_rate || 0),
              highestPackage: Number(d.highest_package || 0),
              lowestPackage: Number(d.lowest_package || 0),
              totalCompanies: d.total_companies,
              companies: deptCompanyMap.get(d.id) || [],
            })),
            companyStats: companyRows.map((c) => ({
              name: c.company_name,
              studentsPlaced: c.students_placed,
              averagePackage: Number(c.average_package || 0),
              highestPackage: Number(c.highest_package || 0),
              lowestPackage: Number(c.lowest_package || 0),
            })),
          },
          database: usedDatabase
        });
      }
    } catch (neonError) {
      logger.logFailure("NEON", "READ", "PlacementAnalytics", neonError.message || neonError);
      return res.status(502).json({ message: "NeonDB analytics fetch failed", error: neonError.message });
    }
  } catch (error) {
    console.error("Error fetching analytics:", error);
    logger.logFailure('SYSTEM', 'READ', 'PlacementAnalytics', error.message);
    res.status(500).json({ message: "Error fetching analytics", error: error.message });
  }
});

// Delete analytics for a batch
router.delete("/:batch", auth, async (req, res) => {
  try {
    const { batch } = req.params;
    let usedDatabase = null;

    // Try NeonDB first (PRIMARY)
    try {
      logger.logAttempt('NEON', 'DELETE', 'PlacementAnalytics', `Deleting analytics for batch: ${batch}`);
      const deleteStartTime = Date.now();
      
      const rows = await neonService.executeRawQuery(
        "SELECT id, file_path FROM placement_analytics WHERE batch = $1 LIMIT 1",
        [batch]
      );
      const analytics = rows[0];
      
      if (!analytics) {
        return res.status(404).json({ message: "Analytics not found" });
      }

      if (analytics.file_path && fs.existsSync(analytics.file_path)) {
        fs.unlinkSync(analytics.file_path);
      }

      await neonService.executeRawQuery("DELETE FROM placement_analytics WHERE id = $1", [analytics.id]);

      const deleteDuration = Date.now() - deleteStartTime;
      logger.logSuccess('NEON', 'DELETE', 'PlacementAnalytics', `Analytics deleted in ${deleteDuration}ms`, batch);
      logger.logPerformance('DELETE', 'PlacementAnalytics', deleteDuration, 'NeonDB');
      usedDatabase = 'NEON';

      const io = req.app.get("io");
      if (io) {
        emitPlacementDataUpdate(io, "batch_deleted", { batch });
      }

      return res.json({ message: "Analytics deleted successfully", database: usedDatabase });
    } catch (neonError) {
      logger.logFailure("NEON", "DELETE", "PlacementAnalytics", neonError.message || neonError);
      return res.status(502).json({ message: "NeonDB delete failed", error: neonError.message });
    }
  } catch (error) {
    console.error("Error deleting analytics:", error);
    logger.logFailure('SYSTEM', 'DELETE', 'PlacementAnalytics', error.message);
    res.status(500).json({ message: "Error deleting analytics", error: error.message });
  }
});

module.exports = router;
