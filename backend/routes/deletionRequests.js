const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");
const neonService = require("../services/database/neonService");
const logger = require("../services/database/logger");
const {
  emitDeletionRequestUpdate,
  emitJobDriveUpdate,
} = require("../utils/socketUtils");

const isPO = (user) => {
  const normalized = user?.roleNormalized || String(user?.role || "").toLowerCase();
  return normalized === "po" || normalized === "placement_officer";
};

const isPRorPO = (user) => {
  const normalized = user?.roleNormalized || String(user?.role || "").toLowerCase();
  return normalized === "po" || normalized === "placement_officer" || normalized === "placement_representative" || normalized === "pr";
};

const mapNeonDeletionRequest = (row) => ({
  _id: row.id,
  id: row.id,
  jobDrive: row.job_drive_id
    ? {
        _id: row.job_drive_id,
        companyName: row.job_drive_company_name,
        role: row.job_drive_role,
        date: row.job_drive_date,
      }
    : null,
  jobDriveDetails: {
    companyName: row.job_drive_company_name,
    role: row.job_drive_role,
    date: row.job_drive_date,
    createdBy: row.job_drive_created_by,
  },
  requestedBy: row.requested_by,
  reason: row.reason,
  status: row.status,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  reviewComments: row.review_comments,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Create deletion request (PR or PO)
router.post("/request", auth, async (req, res) => {
  try {
    const { jobDriveId, reason } = req.body;

    if (!jobDriveId || !reason) {
      return res.status(400).json({
        message: "Job Drive ID and reason are required",
      });
    }

    // Verify job drive exists - Try NeonDB first
    let jobDrive = null;
    let usedDatabase = null;
    
    try {
      logger.logAttempt('NEON', 'READ', 'JobDrive', `Verifying job drive for deletion request: ${jobDriveId}`);
      const readStartTime = Date.now();
      
      const neonDrive = await neonService.findJobDriveById(jobDriveId);
      if (neonDrive) {
        jobDrive = {
          _id: neonDrive.id,
          companyName: neonDrive.companyName,
          role: neonDrive.role,
          date: neonDrive.date,
          createdBy: neonDrive.createdBy?._id || neonDrive.createdBy,
        };
        
        const readDuration = Date.now() - readStartTime;
        logger.logSuccess('NEON', 'READ', 'JobDrive', `Job drive found in ${readDuration}ms`, jobDriveId);
        usedDatabase = 'NEON';
      }
    } catch (neonError) {
      logger.logFailure("NEON", "READ", "JobDrive", neonError.message || neonError);
      return res.status(502).json({ message: "NeonDB job drive lookup failed", error: neonError.message });
    }

    if (!jobDrive) {
      return res.status(404).json({ message: "Job drive not found" });
    }

    // Check if user has permission to request deletion
    const canRequestDeletion = isPRorPO(req.user);

    if (!canRequestDeletion) {
      return res.status(403).json({
        message: "Access denied - Only PRs and POs can request deletion",
      });
    }

    // Check if there's already a pending request for this drive
    let existingRequest = null;
    try {
      logger.logAttempt('NEON', 'READ', 'DeletionRequest', `Checking for existing pending request: ${jobDriveId}`);
      const checkStartTime = Date.now();
      
      const rows = await neonService.executeRawQuery(
        "SELECT id FROM deletion_requests WHERE job_drive_id = $1 AND status = 'pending' LIMIT 1",
        [jobDriveId]
      );
      existingRequest = rows[0] || null;
      
      const checkDuration = Date.now() - checkStartTime;
      logger.logSuccess('NEON', 'READ', 'DeletionRequest', `Check completed in ${checkDuration}ms`, jobDriveId);
    } catch (neonError) {
      logger.logFailure("NEON", "READ", "DeletionRequest", neonError.message || neonError);
      return res.status(502).json({ message: "NeonDB pending-request lookup failed", error: neonError.message });
    }

    if (existingRequest) {
      return res.status(400).json({
        message: "A deletion request for this drive is already pending",
      });
    }

    // For POs, auto-approve the deletion request
    if (isPO(req.user)) {
      // Store job drive details before deletion
      const jobDriveDetails = {
        companyName: jobDrive.companyName,
        role: jobDrive.role,
        date: jobDrive.date,
        createdBy: jobDrive.createdBy,
      };

      // Delete the job drive
      try {
        logger.logAttempt('NEON', 'DELETE', 'JobDrive', `PO auto-deleting job drive: ${jobDriveId}`);
        const deleteStartTime = Date.now();
        
        await neonService.deleteJobDrive(jobDriveId);
        
        const deleteDuration = Date.now() - deleteStartTime;
        logger.logSuccess('NEON', 'DELETE', 'JobDrive', `Job drive deleted in ${deleteDuration}ms`, jobDriveId);
        logger.logPerformance('DELETE', 'JobDrive', deleteDuration, 'NeonDB');
      } catch (neonError) {
        logger.logFailure("NEON", "DELETE", "JobDrive", neonError.message || neonError);
        return res.status(502).json({ message: "NeonDB auto-delete failed", error: neonError.message });
      }

      // Create an approved deletion request for records
      let deletionRequest;
      try {
        logger.logAttempt('NEON', 'CREATE', 'DeletionRequest', 'Creating auto-approved deletion request');
        const createStartTime = Date.now();
        
        const rows = await neonService.executeRawQuery(
          `
          INSERT INTO deletion_requests (
            id, job_drive_id, job_drive_company_name, job_drive_role, job_drive_date, job_drive_created_by,
            requested_by, reason, status, reviewed_by, reviewed_at, review_comments, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'approved', $8, NOW(), $9, NOW(), NOW()
          )
          RETURNING *
          `,
          [
            jobDriveId,
            jobDriveDetails.companyName,
            jobDriveDetails.role,
            jobDriveDetails.date,
            jobDriveDetails.createdBy,
            req.user.id,
            reason,
            req.user.id,
            "Auto-approved (Placement Officer action)",
          ]
        );
        deletionRequest = mapNeonDeletionRequest(rows[0]);
        
        const createDuration = Date.now() - createStartTime;
        logger.logSuccess('NEON', 'CREATE', 'DeletionRequest', `Deletion request created in ${createDuration}ms`, deletionRequest.id);
        logger.logPerformance('CREATE', 'DeletionRequest', createDuration, 'NeonDB');
      } catch (neonError) {
        logger.logFailure("NEON", "CREATE", "DeletionRequest", neonError.message || neonError);
        return res.status(502).json({ message: "NeonDB auto-approved request create failed", error: neonError.message });
      }

      // Emit socket event for job drive deletion
      const io = req.app.get("io");
      emitJobDriveUpdate(io, "deleted", jobDriveDetails);
      emitDeletionRequestUpdate(io, "approved", deletionRequest);

      return res.json({ message: "Job drive deleted successfully", deletionRequest });
    }

    // For PRs, create a pending deletion request
    let deletionRequest;
    try {
      logger.logAttempt('NEON', 'CREATE', 'DeletionRequest', `PR creating deletion request for drive: ${jobDriveId}`);
      const createStartTime = Date.now();
      
      const rows = await neonService.executeRawQuery(
        `
        INSERT INTO deletion_requests (
          id, job_drive_id, job_drive_company_name, job_drive_role, job_drive_date, job_drive_created_by,
          requested_by, reason, status, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW()
        )
        RETURNING *
        `,
        [jobDriveId, jobDrive.companyName, jobDrive.role, jobDrive.date, jobDrive.createdBy, req.user.id, reason]
      );
      deletionRequest = mapNeonDeletionRequest(rows[0]);
      
      const createDuration = Date.now() - createStartTime;
      logger.logSuccess('NEON', 'CREATE', 'DeletionRequest', `Deletion request created in ${createDuration}ms`, deletionRequest.id);
      logger.logPerformance('CREATE', 'DeletionRequest', createDuration, 'NeonDB');
    } catch (neonError) {
      logger.logFailure("NEON", "CREATE", "DeletionRequest", neonError.message || neonError);
      return res.status(502).json({ message: "NeonDB request create failed", error: neonError.message });
    }

    // Emit socket event for new deletion request
    const io = req.app.get("io");
    emitDeletionRequestUpdate(io, "created", deletionRequest);

    res.status(201).json({
      message: "Deletion request submitted successfully. Awaiting PO approval.",
      deletionRequest,
      database: usedDatabase
    });
  } catch (error) {
    console.error("Error creating deletion request:", error);
    logger.logFailure('SYSTEM', 'CREATE', 'DeletionRequest', error.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all deletion requests (PO only)
router.get("/pending", auth, async (req, res) => {
  try {
    if (!isPO(req.user)) {
      return res.status(403).json({
        message: "Access denied - Only POs can view deletion requests",
      });
    }

    let deletionRequests = [];
    let usedDatabase = null;

    // Try NeonDB first (PRIMARY)
    try {
      logger.logAttempt('NEON', 'READ', 'DeletionRequest', 'Fetching pending deletion requests');
      const readStartTime = Date.now();
      
      const rows = await neonService.executeRawQuery(
        "SELECT * FROM deletion_requests WHERE status = 'pending' ORDER BY created_at DESC"
      );
      deletionRequests = rows.map(mapNeonDeletionRequest);
      
      const readDuration = Date.now() - readStartTime;
      logger.logSuccess('NEON', 'READ', 'DeletionRequest', `Found ${deletionRequests.length} pending requests in ${readDuration}ms`);
      logger.logPerformance('READ', 'DeletionRequest', readDuration, 'NeonDB');
      usedDatabase = 'NEON';
      
      return res.json({ deletionRequests, database: usedDatabase });
    } catch (neonError) {
      logger.logFailure("NEON", "READ", "DeletionRequest", neonError.message || neonError);
      return res.status(502).json({ message: "NeonDB pending list failed", error: neonError.message });
    }
  } catch (error) {
    console.error("Error fetching deletion requests:", error);
    logger.logFailure('SYSTEM', 'READ', 'DeletionRequest', error.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Get deletion requests by current user
router.get("/my-requests", auth, async (req, res) => {
  try {
    let deletionRequests = [];
    let usedDatabase = null;

    // Try NeonDB first (PRIMARY)
    try {
      logger.logAttempt('NEON', 'READ', 'DeletionRequest', `Fetching deletion requests for user: ${req.user.id}`);
      const readStartTime = Date.now();
      
      const rows = await neonService.executeRawQuery(
        "SELECT * FROM deletion_requests WHERE requested_by = $1 ORDER BY created_at DESC",
        [req.user.id]
      );
      deletionRequests = rows.map(mapNeonDeletionRequest);
      
      const readDuration = Date.now() - readStartTime;
      logger.logSuccess('NEON', 'READ', 'DeletionRequest', `Found ${deletionRequests.length} requests in ${readDuration}ms`, req.user.id);
      logger.logPerformance('READ', 'DeletionRequest', readDuration, 'NeonDB');
      usedDatabase = 'NEON';
      
      return res.json({ deletionRequests, database: usedDatabase });
    } catch (neonError) {
      logger.logFailure("NEON", "READ", "DeletionRequest", neonError.message || neonError);
      return res.status(502).json({ message: "NeonDB user request list failed", error: neonError.message });
    }
  } catch (error) {
    console.error("Error fetching user deletion requests:", error);
    logger.logFailure('SYSTEM', 'READ', 'DeletionRequest', error.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Approve/Reject deletion request (PO only)
router.patch("/:requestId/review", auth, async (req, res) => {
  try {
    if (!isPO(req.user)) {
      return res.status(403).json({
        message: "Access denied - Only POs can review deletion requests",
      });
    }

    const { action, comments } = req.body; // action: 'approve' or 'reject'

    if (!action || !["approve", "reject"].includes(action)) {
      return res.status(400).json({
        message: 'Invalid action. Must be "approve" or "reject"',
      });
    }

    let deletionRequest = null;
    try {
      const rows = await neonService.executeRawQuery(
        "SELECT * FROM deletion_requests WHERE id = $1 LIMIT 1",
        [req.params.requestId]
      );
      deletionRequest = rows[0] || null;
    } catch (neonError) {
      logger.logFailure("NEON", "READ", "DeletionRequest", neonError.message || neonError);
    }

    if (deletionRequest) {
      if (deletionRequest.status !== "pending") {
        return res.status(400).json({ message: "This deletion request has already been reviewed" });
      }

      const newStatus = action === "approve" ? "approved" : "rejected";
      await neonService.executeRawQuery(
        `
        UPDATE deletion_requests
        SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_comments = $3, updated_at = NOW()
        WHERE id = $4
        `,
        [newStatus, req.user.id, comments || "", req.params.requestId]
      );

      if (action === "approve" && deletionRequest.job_drive_id) {
        await neonService.deleteJobDrive(deletionRequest.job_drive_id);
      }

      const updatedRows = await neonService.executeRawQuery(
        "SELECT * FROM deletion_requests WHERE id = $1 LIMIT 1",
        [req.params.requestId]
      );
      const mapped = mapNeonDeletionRequest(updatedRows[0]);

      const io = req.app.get("io");
      emitDeletionRequestUpdate(io, action === "approve" ? "approved" : "rejected", mapped);
      if (action === "approve" && mapped.jobDriveDetails) {
        emitJobDriveUpdate(io, "deleted", mapped.jobDriveDetails);
      }

      return res.json({
        message: `Deletion request ${action === "approve" ? "approved" : "rejected"} successfully`,
        deletionRequest: mapped,
      });
    }

    return res.status(404).json({ message: "Deletion request not found" });
  } catch (error) {
    console.error("Error reviewing deletion request:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all deletion requests with filters (PO only)
router.get("/all", auth, async (req, res) => {
  try {
    if (!isPO(req.user)) {
      return res.status(403).json({
        message: "Access denied - Only POs can view all deletion requests",
      });
    }

    const { status } = req.query;
    const filter = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    let deletionRequests = [];
    let usedDatabase = null;

    // Try NeonDB first (PRIMARY)
    try {
      logger.logAttempt('NEON', 'READ', 'DeletionRequest', `Fetching all deletion requests${filter.status ? ` with status: ${filter.status}` : ''}`);
      const readStartTime = Date.now();
      
      let rows;
      if (filter.status) {
        rows = await neonService.executeRawQuery(
          "SELECT * FROM deletion_requests WHERE status = $1 ORDER BY created_at DESC",
          [filter.status]
        );
      } else {
        rows = await neonService.executeRawQuery("SELECT * FROM deletion_requests ORDER BY created_at DESC");
      }
      deletionRequests = rows.map(mapNeonDeletionRequest);
      
      const readDuration = Date.now() - readStartTime;
      logger.logSuccess('NEON', 'READ', 'DeletionRequest', `Found ${deletionRequests.length} requests in ${readDuration}ms`);
      logger.logPerformance('READ', 'DeletionRequest', readDuration, 'NeonDB');
      usedDatabase = 'NEON';
      
      return res.json({ deletionRequests, database: usedDatabase });
    } catch (neonError) {
      logger.logFailure("NEON", "READ", "DeletionRequest", neonError.message || neonError);
      return res.status(502).json({ message: "NeonDB request list failed", error: neonError.message });
    }
  } catch (error) {
    console.error("Error fetching all deletion requests:", error);
    logger.logFailure('SYSTEM', 'READ', 'DeletionRequest', error.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
