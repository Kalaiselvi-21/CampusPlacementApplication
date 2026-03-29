/**
 * NeonDB Service
 * Handles all NeonDB (PostgreSQL) operations using raw SQL
 * NeonDB is the single source of truth
 */

const { sequelize } = require('../../config/neonConnection');
const logger = require('./logger');
const bcrypt = require('bcryptjs');

class NeonService {
  constructor() {
    this.sequelize = sequelize;
    this.isConnected = false;
    this.connectionChecked = false;
    this.tableColumnsCache = new Map();
    this.enableSqlLogs = String(process.env.NEON_SQL_LOGS ?? 'true').toLowerCase() !== 'false';

    if (this.enableSqlLogs && this.sequelize && !this.sequelize.__neonLoggingWrapped) {
      const originalQuery = this.sequelize.query.bind(this.sequelize);

      this.sequelize.query = async (...args) => {
        const sqlPreview = typeof args[0] === 'string'
          ? args[0].replace(/\s+/g, ' ').trim().slice(0, 180)
          : 'SQL query';
        const startedAt = Date.now();

        logger.logAttempt('NEON', 'SQL', 'Query', sqlPreview);

        try {
          const result = await originalQuery(...args);
          const duration = Date.now() - startedAt;
          logger.logSuccess('NEON', 'SQL', 'Query', `Completed in ${duration}ms`);
          return result;
        } catch (error) {
          logger.logFailure('NEON', 'SQL', 'Query', error?.message || error);
          throw error;
        }
      };

      this.sequelize.__neonLoggingWrapped = true;
    }
  }

  /**
   * Check if NeonDB is connected
   */
  async checkConnection() {
    if (this.connectionChecked) {
      return this.isConnected;
    }

    try {
      await sequelize.authenticate();
      this.isConnected = true;
      this.connectionChecked = true;
      return true;
    } catch (error) {
      this.isConnected = false;
      this.connectionChecked = true;
      return false;
    }
  }

  /**
   * Execute raw SQL query
   */
  async executeRawQuery(sql, params = []) {
    try {
      const [results] = await sequelize.query(sql, {
        bind: params
      });
      return results;
    } catch (error) {
      throw error;
    }
  }

  async getTableColumns(tableName) {
    if (this.tableColumnsCache.has(tableName)) {
      return this.tableColumnsCache.get(tableName);
    }

    const [rows] = await sequelize.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      `,
      {
        bind: [tableName],
      }
    );

    const columns = new Set((rows || []).map((row) => row.column_name));
    this.tableColumnsCache.set(tableName, columns);
    return columns;
  }

  async tableExists(tableName) {
    const columns = await this.getTableColumns(tableName);
    return columns.size > 0;
  }

  async getApplicationsTableConfig() {
    const candidates = ['job_drive_applications', 'job_applications'];

    for (const tableName of candidates) {
      const columns = await this.getTableColumns(tableName);
      if (columns.size === 0) {
        continue;
      }

      const driveColumn = columns.has('job_drive_id')
        ? 'job_drive_id'
        : columns.has('drive_id')
          ? 'drive_id'
          : null;

      const studentColumn = columns.has('student_id')
        ? 'student_id'
        : columns.has('user_id')
          ? 'user_id'
          : null;

      if (driveColumn && studentColumn) {
        return { tableName, driveColumn, studentColumn, columns };
      }
    }

    throw new Error('job applications schema missing drive/student reference columns');
  }

  async getSelectionRoundsForDrive(driveId) {
    if (!(await this.tableExists('selection_rounds'))) {
      return [];
    }

    const rounds = await this.executeRawQuery(
      `
      SELECT id, round_name, round_details, round_date, round_time, status, round_order
      FROM selection_rounds
      WHERE job_drive_id = $1
      ORDER BY round_order ASC NULLS LAST, created_at ASC
      `,
      [driveId]
    );

    if (rounds.length === 0) {
      return [];
    }

    let selectedRows = [];
    if (await this.tableExists('selection_round_students')) {
      const roundIds = rounds.map((round) => round.id);
      selectedRows = await this.executeRawQuery(
        `
        SELECT selection_round_id, student_id
        FROM selection_round_students
        WHERE selection_round_id = ANY($1)
        ORDER BY selected_at ASC
        `,
        [roundIds]
      );
    }

    const selectedByRound = new Map();
    for (const row of selectedRows) {
      if (!selectedByRound.has(row.selection_round_id)) {
        selectedByRound.set(row.selection_round_id, []);
      }
      selectedByRound.get(row.selection_round_id).push(row.student_id);
    }

    return rounds.map((round) => ({
      _id: round.id,
      id: round.id,
      name: round.round_name || '',
      details: round.round_details || '',
      date: round.round_date || null,
      time: round.round_time || null,
      status: round.status || 'pending',
      selectedStudents: selectedByRound.get(round.id) || [],
      roundOrder: round.round_order ?? null,
    }));
  }

  async replaceSelectionRounds(driveId, selectionRounds = []) {
    if (!(await this.tableExists('selection_rounds'))) {
      return [];
    }

    await this.executeRawQuery(`DELETE FROM selection_rounds WHERE job_drive_id = $1`, [driveId]);

    for (let index = 0; index < selectionRounds.length; index += 1) {
      const round = selectionRounds[index] || {};
      const inserted = await this.executeRawQuery(
        `
        INSERT INTO selection_rounds (
          id, job_drive_id, round_name, round_details, round_date, round_time, status, round_order, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW()
        )
        RETURNING id
        `,
        [
          driveId,
          round.name || '',
          round.details || '',
          round.date || null,
          round.time || null,
          round.status || 'pending',
          index,
        ]
      );

      const roundId = inserted[0]?.id;
      const selectedStudents = Array.isArray(round.selectedStudents)
        ? round.selectedStudents.filter(
            (studentId) => typeof studentId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)
          )
        : [];

      if (roundId && selectedStudents.length > 0 && (await this.tableExists('selection_round_students'))) {
        await this.executeRawQuery(
          `
          INSERT INTO selection_round_students (id, selection_round_id, student_id, selected_at)
          SELECT gen_random_uuid(), $1, unnest($2::uuid[]), NOW()
          ON CONFLICT (selection_round_id, student_id) DO NOTHING
          `,
          [roundId, selectedStudents]
        );
      }
    }

    return this.getSelectionRoundsForDrive(driveId);
  }

  async getPlacedStudentsForDrive(driveId) {
    if (!(await this.tableExists('placed_students'))) {
      return [];
    }

    const columns = await this.getTableColumns('placed_students');
    const selectStudentId = columns.has('student_id') ? ', student_id' : '';
    const selectStatus = columns.has('status') ? ', status' : '';

    const rows = await this.executeRawQuery(
      `
      SELECT id, student_name, roll_number, department, email, mobile_number, cgpa, added_by, added_at${selectStudentId}${selectStatus}
      FROM placed_students
      WHERE job_drive_id = $1
      ORDER BY added_at ASC, created_at ASC
      `,
      [driveId]
    );

    return rows.map((row) => ({
      _id: row.id,
      id: row.id,
      studentId: row.student_id || null,
      name: row.student_name || 'N/A',
      rollNumber: row.roll_number || 'N/A',
      department: row.department || '',
      email: row.email || 'N/A',
      mobileNumber: row.mobile_number || '',
      cgpa: row.cgpa || 0,
      addedBy: row.added_by || null,
      addedAt: row.added_at || null,
      status: row.status || 'placed',
    }));
  }

  async replacePlacedStudents(driveId, companyName, placedStudents = [], addedBy = null) {
    if (!(await this.tableExists('placed_students'))) {
      return [];
    }

    const columns = await this.getTableColumns('placed_students');

    // Before deleting, collect old student IDs if the schema supports this column.
    const oldStudentIds = [];
    if (columns.has('student_id')) {
      const oldRows = await this.executeRawQuery(
        `SELECT student_id FROM placed_students WHERE job_drive_id = $1 AND student_id IS NOT NULL`,
        [driveId]
      );
      oldStudentIds.push(...oldRows.map((r) => r.student_id).filter(Boolean));
    }

    await this.executeRawQuery(`DELETE FROM placed_students WHERE job_drive_id = $1`, [driveId]);

    // Collect new student IDs to mark as placed
    const newStudentIds = [];

    for (const student of placedStudents) {
      const fieldNames = ['id', 'job_drive_id', 'company_name', 'student_name', 'roll_number', 'department', 'email', 'mobile_number', 'cgpa'];
      const valueSql = ['gen_random_uuid()', '$1', '$2', '$3', '$4', '$5', '$6', '$7', '$8'];
      const bind = [
        driveId,
        companyName || '',
        student.name || 'N/A',
        student.rollNumber || 'N/A',
        student.department || '',
        student.email || '',
        student.mobileNumber || '',
        student.cgpa || 0,
      ];

      if (columns.has('student_id')) {
        fieldNames.push('student_id');
        bind.push(student.studentId || null);
        valueSql.push(`$${bind.length}`);
        if (student.studentId) {
          newStudentIds.push(student.studentId);
        }
      }

      if (columns.has('status')) {
        fieldNames.push('status');
        bind.push(student.status || 'placed');
        valueSql.push(`$${bind.length}`);
      }

      if (columns.has('added_by')) {
        fieldNames.push('added_by');
        bind.push(student.addedBy || addedBy || null);
        valueSql.push(`$${bind.length}`);
      }

      if (columns.has('added_at')) {
        fieldNames.push('added_at');
        bind.push(student.addedAt || new Date());
        valueSql.push(`$${bind.length}`);
      }

      if (columns.has('created_at')) {
        fieldNames.push('created_at');
        valueSql.push('NOW()');
      }

      if (columns.has('updated_at')) {
        fieldNames.push('updated_at');
        valueSql.push('NOW()');
      }

      await this.executeRawQuery(
        `INSERT INTO placed_students (${fieldNames.join(', ')}) VALUES (${valueSql.join(', ')})`,
        bind
      );
    }

    // Update user_profiles for newly placed students
    if (newStudentIds.length > 0) {
      const profileColumns = await this.getTableColumns('user_profiles');
      const hasPlacementStatus = profileColumns.has('placement_status');
      const hasIsPlaced = profileColumns.has('is_placed');
      const hasPlacedCompany = profileColumns.has('placed_company');

      if (hasPlacementStatus || hasIsPlaced || hasPlacedCompany) {
        const setParts = [];
        if (hasPlacementStatus) setParts.push(`placement_status = 'placed'`);
        if (hasIsPlaced) setParts.push(`is_placed = true`);
        if (hasPlacedCompany) setParts.push(`placed_company = '${(companyName || '').replace(/'/g, "''")}'`);
        setParts.push(`updated_at = NOW()`);

        await this.executeRawQuery(
          `UPDATE user_profiles SET ${setParts.join(', ')} WHERE user_id = ANY($1::uuid[])`,
          [newStudentIds]
        );
      }
    }

    // Unmark students who were removed from placed list (no longer in placed_students for this drive)
    // Only unmark if they're not placed in any other drive
    if (oldStudentIds.length > 0) {
      const removedIds = oldStudentIds.filter((id) => !newStudentIds.includes(id));
      if (removedIds.length > 0) {
        const profileColumns = await this.getTableColumns('user_profiles');
        const hasPlacementStatus = profileColumns.has('placement_status');
        const hasIsPlaced = profileColumns.has('is_placed');

        if (hasPlacementStatus || hasIsPlaced) {
          for (const studentId of removedIds) {
            // Check if still placed in another drive
            const stillPlaced = await this.executeRawQuery(
              `SELECT 1 FROM placed_students WHERE student_id = $1 LIMIT 1`,
              [studentId]
            );
            if (stillPlaced.length === 0) {
              const setParts = [];
              if (hasPlacementStatus) setParts.push(`placement_status = 'unplaced'`);
              if (hasIsPlaced) setParts.push(`is_placed = false`);
              setParts.push(`updated_at = NOW()`);
              await this.executeRawQuery(
                `UPDATE user_profiles SET ${setParts.join(', ')} WHERE user_id = $1`,
                [studentId]
              );
            }
          }
        }
      }
    }

    return this.getPlacedStudentsForDrive(driveId);
  }

  // ==================== USER OPERATIONS ====================

  /**
   * Find user by email
   */
  async findUserByEmail(email) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    const [results] = await sequelize.query(`
      SELECT
        id, name, email, password, role, is_verified,
        verification_token, verification_token_expires,
        created_at, updated_at,
        profile_name, phone_number AS phone, department,
        NULL::text AS batch,
        cgpa,
        NULL::integer AS current_backlogs,
        graduation_year,
        is_profile_complete,
        profile_completion_percentage,
        consent_has_agreed,
        consent_agreed_at,
        consent_signature,
        otp_verified,
        otp_is_verified AS verification_is_verified,
        otp_code,
        otp_expires,
        otp_attempts
      FROM v_users_complete
      WHERE email = $1
      LIMIT 1
    `, {
      bind: [email]
    });

    if (results.length === 0) {
      return null;
    }

    return this.formatUserFromNeon(results[0]);
  }

  /**
   * Find user by ID
   */
  async findUserById(userId) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    const [results] = await sequelize.query(`
      SELECT
        id, name, email, password, role, is_verified,
        verification_token, verification_token_expires,
        created_at, updated_at,
        profile_name, phone_number AS phone, department,
        NULL::text AS batch,
        cgpa,
        NULL::integer AS current_backlogs,
        graduation_year,
        is_profile_complete,
        profile_completion_percentage,
        consent_has_agreed,
        consent_agreed_at,
        consent_signature,
        otp_verified,
        otp_is_verified AS verification_is_verified,
        otp_code,
        otp_expires,
        otp_attempts,
        otp_resend_count,
        last_otp_sent
      FROM v_users_complete
      WHERE id = $1
      LIMIT 1
    `, {
      bind: [userId]
    });

    if (results.length === 0) {
      return null;
    }

    return this.formatUserFromNeon(results[0]);
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId, profileData) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    // Build dynamic UPDATE query
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (profileData.profile_name !== undefined) {
      fields.push(`profile_name = $${paramIndex++}`);
      values.push(profileData.profile_name);
    }
    if (profileData.phone !== undefined) {
      fields.push(`phone_number = $${paramIndex++}`);
      values.push(profileData.phone);
    }
    if (profileData.department !== undefined) {
      fields.push(`department = $${paramIndex++}`);
      values.push(profileData.department);
    }
    // `batch` column is not present in current Neon schema.
    if (profileData.cgpa !== undefined) {
      fields.push(`cgpa = $${paramIndex++}`);
      values.push(profileData.cgpa);
    }
    if (profileData.current_backlogs !== undefined) {
      fields.push(`current_backlogs = $${paramIndex++}`);
      values.push(profileData.current_backlogs);
    }
    if (profileData.graduation_year !== undefined) {
      fields.push(`graduation_year = $${paramIndex++}`);
      values.push(profileData.graduation_year);
    }
    if (profileData.is_profile_complete !== undefined) {
      fields.push(`is_profile_complete = $${paramIndex++}`);
      values.push(profileData.is_profile_complete);
    }

    fields.push(`updated_at = NOW()`);
    values.push(userId);

    const sql = `
      UPDATE user_profiles 
      SET ${fields.join(', ')}
      WHERE user_id = $${paramIndex}
      RETURNING *
    `;

    const [results] = await sequelize.query(sql, {
      bind: values
    });

    return results[0];
  }

  /**
   * Update user verification status
   */
  async updateUserVerification(userId, isVerified) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    try {
      const [result] = await sequelize.query(`
        UPDATE users 
        SET is_verified = $1, 
            verification_token = NULL,
            verification_token_expires = NULL,
            updated_at = NOW()
        WHERE id = $2
        RETURNING id, is_verified
      `, {
        bind: [isVerified, userId]
      });

      if (result.length === 0) {
        throw new Error(`User with ID ${userId} not found for verification update`);
      }

      return true;
    } catch (error) {
      console.error('[NEON] Error in updateUserVerification:', error.message);
      throw error;
    }
  }

  /**
   * Update OTP verification
   */
  async updateOTPVerification(userId, otpData) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    // Check if verification_status record exists
    const [existing] = await sequelize.query(`
      SELECT id FROM verification_status WHERE user_id = $1
    `, {
      bind: [userId]
    });

    if (existing.length === 0) {
      // Insert new record
      await sequelize.query(`
        INSERT INTO verification_status (
          id, user_id, otp_verified, is_verified, otp_code, otp_expires, 
          otp_attempts, otp_resend_count, last_otp_sent, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
        )
      `, {
        bind: [
          userId,
          otpData.otp_verified || false,
          otpData.is_verified || false,
          otpData.otp_code || null,
          otpData.otp_expires || null,
          otpData.otp_attempts || 0,
          otpData.otp_resend_count || 0,
          otpData.last_otp_sent || new Date()
        ]
      });
    } else {
      // Update existing record
      const fields = [];
      const values = [];
      let paramIndex = 1;

      if (otpData.otp_verified !== undefined) {
        fields.push(`otp_verified = $${paramIndex++}`);
        values.push(otpData.otp_verified);
      }
      if (otpData.is_verified !== undefined) {
        fields.push(`is_verified = $${paramIndex++}`);
        values.push(otpData.is_verified);
      }
      if (otpData.otp_code !== undefined) {
        fields.push(`otp_code = $${paramIndex++}`);
        values.push(otpData.otp_code);
      }
      if (otpData.otp_expires !== undefined) {
        fields.push(`otp_expires = $${paramIndex++}`);
        values.push(otpData.otp_expires);
      }
      if (otpData.otp_attempts !== undefined) {
        fields.push(`otp_attempts = $${paramIndex++}`);
        values.push(otpData.otp_attempts);
      }
      if (otpData.otp_resend_count !== undefined) {
        fields.push(`otp_resend_count = $${paramIndex++}`);
        values.push(otpData.otp_resend_count);
      }
      if (otpData.last_otp_sent !== undefined) {
        fields.push(`last_otp_sent = $${paramIndex++}`);
        values.push(otpData.last_otp_sent);
      }
      if (otpData.verified_at !== undefined) {
        fields.push(`verified_at = $${paramIndex++}`);
        values.push(otpData.verified_at);
      }

      fields.push(`updated_at = NOW()`);
      values.push(userId);

      await sequelize.query(`
        UPDATE verification_status 
        SET ${fields.join(', ')}
        WHERE user_id = $${paramIndex}
      `, {
        bind: values
      });
    }

    return true;
  }

  /**
   * Format user data from NeonDB to match API structure (minimal)
   */
  formatUserFromNeon(row) {
    // Handle missing fields gracefully
    return {
      _id: row.id,
      id: row.id,
      name: row.name,
      email: row.email,
      password: row.password,
      role: row.role,
      isVerified: row.is_verified,
      verificationToken: row.verification_token || null,
      verificationTokenExpires: row.verification_token_expires || null,
      profile: {
        name: row.profile_name || null,
        phone: row.phone_number || row.phone || null,
        department: row.department || null,
        batch: row.batch || null,
        cgpa: row.cgpa || null,
        currentBacklogs: row.current_backlogs || null,
        graduationYear: row.graduation_year || null,
        isProfileComplete: row.is_profile_complete || false,
        profileCompletionPercentage: row.profile_completion_percentage || 0
      },
      placementPolicyConsent: {
        hasAgreed: row.consent_has_agreed || false,
        agreedAt: row.consent_agreed_at || null,
        signature: row.consent_signature || null
      },
      verificationStatus: {
        otpVerified: row.otp_verified || false,
        isVerified: row.verification_is_verified || false,
        otpCode: row.otp_code || null,
        otpExpires: row.otp_expires || null,
        otpAttempts: row.otp_attempts || 0,
        otpResendCount: row.otp_resend_count || 0,
        lastOtpSent: row.last_otp_sent || null
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Helper method for model-like API compatibility
      save: async function() {
        throw new Error('Cannot call save() on NeonDB user object');
      },
      calculateProfileCompletion: function() {
        // Placeholder - implement if needed
      }
    };
  }

  // ==================== JOB DRIVE OPERATIONS ====================

  /**
   * Create job drive
   */
  async createJobDrive(driveData) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    const rounds = Array.isArray(driveData.rounds) && driveData.rounds.length > 0
      ? driveData.rounds
      : (Array.isArray(driveData.selectionRounds)
          ? driveData.selectionRounds
              .map((round) => (typeof round?.name === 'string' ? round.name.trim() : ''))
              .filter(Boolean)
          : []);

    const [result] = await sequelize.query(`
      INSERT INTO job_drives (
        id, company_name, company_website, company_description,
        recruiter_name, recruiter_email, recruiter_phone,
        role, job_type, description, requirements, skills,
        ctc, drive_mode, location, locations,
        ctc_base_salary, ctc_variable_pay, ctc_joining_bonus, ctc_other_benefits,
        bond, bond_amount, bond_duration,
        drive_date, drive_time, deadline, application_deadline_time, venue,
        is_dream_job, unplaced_only, is_active,
        eligibility_min_cgpa, eligibility_max_backlogs, eligibility_allowed_departments, eligibility_allowed_batches,
        spoc_dept, rounds, test_details, interview_process, created_by, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
        $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39,
        NOW(), NOW()
      ) RETURNING id
    `, {
      bind: [
        driveData.companyName,
        driveData.companyWebsite || '',
        driveData.companyDescription || '',
        driveData.recruiterContact?.name || '',
        driveData.recruiterContact?.email || '',
        driveData.recruiterContact?.phone || '',
        driveData.role,
        driveData.jobType || 'full-time',
        driveData.description,
        driveData.requirements || '',
        driveData.skills || [],  // Pass array directly, not JSON string
        driveData.ctc,
        driveData.driveMode || 'on-campus',
        driveData.location || '',
        driveData.locations || [],  // Pass array directly, not JSON string
        driveData.ctcBreakdown?.baseSalary || 0,
        driveData.ctcBreakdown?.variablePay || 0,
        driveData.ctcBreakdown?.joiningBonus || 0,
        driveData.ctcBreakdown?.otherBenefits || '',
        driveData.bond || '',
        driveData.bondDetails?.amount || 0,
        driveData.bondDetails?.duration || '',
        driveData.date,
        driveData.time || null,
        driveData.deadline || null,
        driveData.applicationDeadlineTime || null,
        driveData.venue || '',
        driveData.isDreamJob || false,
        driveData.unplacedOnly || false,
        true, // isActive
        driveData.eligibility?.minCGPA || 0,
        driveData.eligibility?.maxBacklogs || 0,
        driveData.eligibility?.allowedDepartments || [],  // Pass array directly, not JSON string
        driveData.eligibility?.allowedBatches || [],  // Pass array directly, not JSON string
        driveData.spocDept || null,
        rounds,
        driveData.testDetails || '',
        driveData.interviewProcess || '',
        driveData.createdBy
      ]
    });

    const driveId = result[0]?.id;

    if (driveId && Array.isArray(driveData.selectionRounds)) {
      await this.replaceSelectionRounds(driveId, driveData.selectionRounds);
    }

    return this.findJobDriveById(driveId);
  }

  /**
   * Find all job drives
   */
  async findAllJobDrives(query = {}) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    const { tableName, driveColumn } = await this.getApplicationsTableConfig();

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (query.isActive !== undefined) {
      whereClause += ` AND is_active = $${paramIndex++}`;
      params.push(query.isActive);
    }

    const [results] = await sequelize.query(`
      SELECT 
        jd.*,
        u.email as creator_email,
        u.name as creator_name,
        (SELECT COUNT(*)::int FROM ${tableName} app WHERE app.${driveColumn} = jd.id) AS application_count
      FROM job_drives jd
      LEFT JOIN users u ON jd.created_by = u.id
      ${whereClause}
      ORDER BY jd.created_at DESC
    `, {
      bind: params
    });

    const drives = results.map((row) => this.formatJobDriveFromNeon(row));

    const enrichedDrives = await Promise.all(
      drives.map(async (drive) => {
        const driveId = drive.id || drive._id;

        if (!driveId) {
          return drive;
        }

        const [selectionRounds, placedStudents] = await Promise.all([
          this.getSelectionRoundsForDrive(driveId),
          this.getPlacedStudentsForDrive(driveId),
        ]);

        return {
          ...drive,
          selectionRounds,
          placedStudents,
          placementFinalized: placedStudents.length > 0,
        };
      })
    );

    return enrichedDrives;
  }

  /**
   * Find job drive by ID
   */
  async findJobDriveById(driveId) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    const [results] = await sequelize.query(`
      SELECT 
        jd.*,
        u.email as creator_email,
        u.name as creator_name
      FROM job_drives jd
      LEFT JOIN users u ON jd.created_by = u.id
      WHERE jd.id = $1
      LIMIT 1
    `, {
      bind: [driveId]
    });

    if (results.length === 0) {
      return null;
    }

    const drive = this.formatJobDriveFromNeon(results[0]);
    drive.selectionRounds = await this.getSelectionRoundsForDrive(driveId);
    drive.placedStudents = await this.getPlacedStudentsForDrive(driveId);
    drive.placementFinalized = drive.placedStudents.length > 0;
    return drive;
  }

  /**
   * Add application to job drive
   */
  async addApplicationToJobDrive(driveId, studentId) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    const { tableName, driveColumn, studentColumn, columns: availableColumns } = await this.getApplicationsTableConfig();

    const columns = [];
    const values = [];
    const bind = [];

    if (availableColumns.has('id')) {
      columns.push('id');
      values.push('gen_random_uuid()');
    }

    columns.push(driveColumn);
    bind.push(driveId);
    values.push(`$${bind.length}`);

    columns.push(studentColumn);
    bind.push(studentId);
    values.push(`$${bind.length}`);

    if (availableColumns.has('status')) {
      columns.push('status');
      values.push(`'applied'`);
    }

    if (availableColumns.has('applied_at')) {
      columns.push('applied_at');
      values.push('NOW()');
    }

    if (availableColumns.has('created_at')) {
      columns.push('created_at');
      values.push('NOW()');
    }

    if (availableColumns.has('updated_at')) {
      columns.push('updated_at');
      values.push('NOW()');
    }

    await sequelize.query(
      `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')})`,
      { bind }
    );

    return true;
  }

  /**
   * Delete job drive
   */
  async deleteJobDrive(driveId) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    // Delete applications first (foreign key constraint)
    const { tableName, driveColumn } = await this.getApplicationsTableConfig();

    await sequelize.query(`
      DELETE FROM ${tableName} WHERE ${driveColumn} = $1
    `, {
      bind: [driveId]
    });

    // Delete the drive
    await sequelize.query(`
      DELETE FROM job_drives WHERE id = $1
    `, {
      bind: [driveId]
    });

    return true;
  }

  /**
   * Count job drives
   */
  async countJobDrives(query = {}) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (query.isActive !== undefined) {
      whereClause += ` AND is_active = $${paramIndex++}`;
      params.push(query.isActive);
    }

    if (query.createdBy) {
      whereClause += ` AND created_by = $${paramIndex++}`;
      params.push(query.createdBy);
    }

    const [results] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM job_drives
      ${whereClause}
    `, {
      bind: params
    });

    return parseInt(results[0].count);
  }

  /**
   * Format job drive data from NeonDB to match API structure
   */
  formatJobDriveFromNeon(row) {
    // Handle null creator (when user is deleted)
    const createdBy = row.created_by ? {
      _id: row.created_by,
      email: row.creator_email,
      profile: {
        name: row.creator_name
      }
    } : {
      _id: null,
      email: null,
      profile: {
        name: 'Missing creator info'
      },
      isDeleted: true
    };

    const applicationCount = Number.parseInt(row.application_count, 10);

    return {
      _id: row.id,
      id: row.id,
      companyName: row.company_name,
      companyWebsite: row.company_website,
      companyDescription: row.company_description,
      recruiterContact: {
        name: row.recruiter_name || '',
        email: row.recruiter_email || '',
        phone: row.recruiter_phone || '',
      },
      role: row.role,
      type: row.job_type,
      jobType: row.job_type,
      description: row.description,
      requirements: row.requirements,
      skills: typeof row.skills === 'string' ? JSON.parse(row.skills) : row.skills,
      ctc: row.ctc,
      ctcBreakdown: {
        baseSalary: row.ctc_base_salary || 0,
        variablePay: row.ctc_variable_pay || 0,
        joiningBonus: row.ctc_joining_bonus || 0,
        otherBenefits: row.ctc_other_benefits || '',
      },
      driveMode: row.drive_mode,
      location: row.location,
      locations: typeof row.locations === 'string' ? JSON.parse(row.locations) : row.locations,
      bond: row.bond || '',
      bondDetails: {
        amount: row.bond_amount || 0,
        duration: row.bond_duration || '',
      },
      date: row.drive_date,
      time: row.drive_time,
      deadline: row.deadline,
      applicationDeadlineTime: row.application_deadline_time,
      venue: row.venue,
      isDreamJob: row.is_dream_job,
      unplacedOnly: row.unplaced_only,
      isActive: row.is_active,
      eligibility: {
        minCGPA: row.eligibility_min_cgpa,
        maxBacklogs: row.eligibility_max_backlogs,
        allowedDepartments: typeof row.eligibility_allowed_departments === 'string' ? 
          JSON.parse(row.eligibility_allowed_departments) : row.eligibility_allowed_departments,
        allowedBatches: typeof row.eligibility_allowed_batches === 'string' ? 
          JSON.parse(row.eligibility_allowed_batches) : row.eligibility_allowed_batches
      },
      spocDept: row.spoc_dept,
      rounds: typeof row.rounds === 'string' ? JSON.parse(row.rounds) : (row.rounds || []),
      testDetails: row.test_details || '',
      interviewProcess: row.interview_process || '',
      approvalStatus: row.approval_status || 'approved',
      createdBy: createdBy,
      applicationCount: Number.isNaN(applicationCount) ? 0 : applicationCount,
      applications: [], // Will be populated separately if needed
      selectionRounds: [],
      placedStudents: [],
      placementFinalized: false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Helper method for model-like API compatibility
      save: async function() {
        throw new Error('Cannot call save() on NeonDB job drive object');
      }
    };
  }

  /**
   * Create user
   */
  async createUser(userData) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    let verificationTokenExpires = userData.verificationTokenExpires ?? null;
    if (typeof verificationTokenExpires === 'number') {
      verificationTokenExpires = new Date(verificationTokenExpires);
    } else if (typeof verificationTokenExpires === 'string' && /^\d+$/.test(verificationTokenExpires)) {
      verificationTokenExpires = new Date(Number(verificationTokenExpires));
    }

    if (verificationTokenExpires instanceof Date && Number.isNaN(verificationTokenExpires.getTime())) {
      verificationTokenExpires = null;
    }

    const [result] = await sequelize.query(`
      INSERT INTO users (
        id, name, email, password, role, is_verified,
        verification_token, verification_token_expires,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
      ) RETURNING id, name, email, role, is_verified, created_at
    `, {
      bind: [
        userData.name,
        userData.email,
        userData.password,
        userData.role,
        userData.isVerified || false,
        userData.verificationToken || null,
        verificationTokenExpires
      ]
    });

    // Link PR allowlist entry if it exists
    if (result[0] && (userData.role === 'placement_representative' || userData.role === 'placement_officer')) {
      try {
        await sequelize.query(`
          UPDATE pr_allowlist 
          SET user_id = $1, updated_at = NOW()
          WHERE email = $2 AND user_id IS NULL
        `, {
          bind: [result[0].id, userData.email.toLowerCase()]
        });
      } catch (linkError) {
        console.log('Note: Could not link PR allowlist entry:', linkError.message);
        // Don't fail user creation if allowlist linking fails
      }
    }

    return result[0];
  }

  /**
   * Delete user by ID
   */
  async deleteUserById(userId, deletedBy = null, deletionReason = null) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    // First, get user email and profile snapshot for allowlist cleanup + archival
    const [userResult] = await sequelize.query(`
      SELECT
        u.id,
        u.email,
        to_jsonb(u) AS user_json,
        to_jsonb(up) AS profile_json
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `, {
      bind: [userId]
    });

    if (!userResult || userResult.length === 0) {
      return false;
    }

    const userEmail = userResult[0].email;
    const originalUserData = {
      user: userResult[0].user_json || null,
      profile: userResult[0].profile_json || null,
    };
    const archiveDeletedBy = deletedBy && deletedBy !== userId ? deletedBy : null;

    // Archive row in deleted_users if table and columns exist.
    // Dynamic column handling keeps this backward compatible across schema variants.
    try {
      const [deletedUsersColumns] = await sequelize.query(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'deleted_users'
        `
      );

      const columnSet = new Set((deletedUsersColumns || []).map((c) => c.column_name));
      const insertColumns = [];
      const insertValues = [];
      const bind = [];
      let idx = 1;

      const addCol = (name, value, useNow = false) => {
        insertColumns.push(name);
        if (useNow) {
          insertValues.push('NOW()');
          return;
        }
        insertValues.push(`$${idx++}`);
        bind.push(value);
      };

      if (columnSet.has('original_user_id')) addCol('original_user_id', userId);
      if (columnSet.has('user_id')) addCol('user_id', userId);
      if (columnSet.has('original_user_data')) addCol('original_user_data', JSON.stringify(originalUserData));
      if (columnSet.has('user_data')) addCol('user_data', JSON.stringify(originalUserData));
      if (columnSet.has('deleted_by')) addCol('deleted_by', archiveDeletedBy);
      if (columnSet.has('deleted_by_user_id')) addCol('deleted_by_user_id', archiveDeletedBy);
      if (columnSet.has('reason')) addCol('reason', deletionReason || 'Account deleted');
      if (columnSet.has('deletion_reason')) addCol('deletion_reason', deletionReason || 'Account deleted');
      if (columnSet.has('deleted_at')) addCol('deleted_at', null, true);
      if (columnSet.has('created_at')) addCol('created_at', null, true);
      if (columnSet.has('updated_at')) addCol('updated_at', null, true);
      if (columnSet.has('email')) addCol('email', userEmail);
      if (columnSet.has('name')) addCol('name', originalUserData.user?.name || null);
      if (columnSet.has('role')) addCol('role', originalUserData.user?.role || null);

      if (insertColumns.length > 0) {
        await sequelize.query(
          `INSERT INTO deleted_users (${insertColumns.join(', ')}) VALUES (${insertValues.join(', ')})`,
          { bind }
        );
      }
    } catch (archiveError) {
      console.error('Warning: Could not archive deleted user in deleted_users:', archiveError.message);
    }

    // Preserve job drives created by the user while removing account
    // so UI can render "Missing creator info" instead of deleting drives.
    await sequelize.query(`
      UPDATE job_drives
      SET created_by = NULL, updated_at = NOW()
      WHERE created_by = $1
    `, {
      bind: [userId]
    });

    // Delete the user (foreign keys handle dependent rows)
    await sequelize.query(`
      DELETE FROM users WHERE id = $1
    `, {
      bind: [userId]
    });

    // Clean up PR allowlist entry if it exists
    try {
      await sequelize.query(`
        DELETE FROM pr_allowlist WHERE user_id = $1 OR email = $2
      `, {
        bind: [userId, userEmail.toLowerCase()]
      });
      console.log(`✅ Cleaned up PR allowlist entry for: ${userEmail}`);
    } catch (allowlistError) {
      console.log(`Note: Could not clean up PR allowlist for ${userEmail}:`, allowlistError.message);
      // Don't fail user deletion if allowlist cleanup fails
    }

    return true;
  }

  /**
   * Find user by verification token
   */
  async findUserByVerificationToken(token) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    try {
      const [results] = await sequelize.query(`
        SELECT 
          u.id, u.name, u.email, u.password, u.role, u.is_verified,
          u.verification_token, u.verification_token_expires,
          u.created_at, u.updated_at
        FROM users u
        WHERE u.verification_token = $1
        AND u.verification_token_expires > NOW()
        LIMIT 1
      `, {
        bind: [token]
      });

      if (results.length === 0) {
        return null;
      }

      return this.formatUserFromNeon(results[0]);
    } catch (error) {
      console.error('[NEON] Error in findUserByVerificationToken:', error.message);
      throw error;
    }
  }

  /**
   * Update user by ID
   */
  async updateUserById(userId, updateData) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updateData.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updateData.name);
    }
    if (updateData.password !== undefined) {
      fields.push(`password = $${paramIndex++}`);
      values.push(updateData.password);
    }
    if (updateData.role !== undefined) {
      fields.push(`role = $${paramIndex++}`);
      values.push(updateData.role);
    }
    if (updateData.is_verified !== undefined) {
      fields.push(`is_verified = $${paramIndex++}`);
      values.push(updateData.is_verified);
    }
    if (updateData.verification_token !== undefined) {
      fields.push(`verification_token = $${paramIndex++}`);
      values.push(updateData.verification_token);
    }
    if (updateData.verification_token_expires !== undefined) {
      fields.push(`verification_token_expires = $${paramIndex++}`);
      values.push(updateData.verification_token_expires);
    }
    if (updateData.isDeleted !== undefined) {
      fields.push(`is_deleted = $${paramIndex++}`);
      values.push(updateData.isDeleted);
    }

    fields.push(`updated_at = NOW()`);
    values.push(userId);

    const sql = `
      UPDATE users 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const [results] = await sequelize.query(sql, {
      bind: values
    });

    return results[0] ? this.formatUserFromNeon(results[0]) : null;
  }

  /**
   * Check if student already applied to a drive
   */
  async hasStudentApplied(driveId, studentId) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    const { tableName, driveColumn, studentColumn } = await this.getApplicationsTableConfig();

    const [results] = await sequelize.query(
      `
      SELECT COUNT(*) as count
      FROM ${tableName}
      WHERE ${driveColumn} = $1 AND ${studentColumn} = $2
      `,
      {
        bind: [driveId, studentId],
      }
    );

    return parseInt(results[0].count) > 0;
  }

  /**
   * Get all drive IDs a student has applied to — single query replacing N hasStudentApplied calls
   */
  async getAppliedDriveIdsForStudent(studentId) {
    const connected = await this.checkConnection();
    if (!connected) throw new Error('NeonDB not connected');

    const { tableName, driveColumn, studentColumn } = await this.getApplicationsTableConfig();

    const results = await this.executeRawQuery(
      `SELECT ${driveColumn} AS drive_id FROM ${tableName} WHERE ${studentColumn} = $1`,
      [studentId]
    );

    return new Set(results.map((r) => String(r.drive_id)));
  }

  /**
   * Get job drive applications for a drive
   */
  async getJobDriveApplications(driveId, query = {}) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    const { tableName, driveColumn, studentColumn } = await this.getApplicationsTableConfig();

    let whereClause = `WHERE jda.${driveColumn} = $1`;
    const params = [driveId];
    let paramIndex = 2;

    if (query.status) {
      whereClause += ` AND jda.status = $${paramIndex++}`;
      params.push(query.status);
    }

    const [results] = await sequelize.query(`
      SELECT 
        jda.*,
        u.name, u.email, u.role,
        up.phone_number AS phone, up.department, up.roll_number, up.cgpa
      FROM ${tableName} jda
      LEFT JOIN users u ON jda.${studentColumn} = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      ${whereClause}
      ORDER BY jda.applied_at DESC
    `, {
      bind: params
    });

    return results;
  }

  /**
   * Count applications for a drive
   */
  async countApplicationsForDrive(driveId, status = null) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    const { tableName, driveColumn } = await this.getApplicationsTableConfig();

    let whereClause = `WHERE ${driveColumn} = $1`;
    const params = [driveId];
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    const [results] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM ${tableName}
      ${whereClause}
    `, {
      bind: params
    });

    return parseInt(results[0].count);
  }

  /**
   * Update job drive
   */
  async updateJobDrive(driveId, updateData) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updateData.company_name !== undefined || updateData.companyName !== undefined) {
      fields.push(`company_name = $${paramIndex++}`);
      values.push(updateData.company_name ?? updateData.companyName);
    }
    if (updateData.is_active !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      values.push(updateData.is_active);
    }
    if (updateData.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      values.push(updateData.isActive);
    }
    if (updateData.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updateData.description);
    }
    if (updateData.ctc !== undefined) {
      fields.push(`ctc = $${paramIndex++}`);
      values.push(updateData.ctc);
    }
    if (updateData.deadline !== undefined) {
      fields.push(`deadline = $${paramIndex++}`);
      values.push(updateData.deadline);
    }
    if (updateData.requirements !== undefined) {
      fields.push(`requirements = $${paramIndex++}`);
      values.push(updateData.requirements);
    }
    if (updateData.skills !== undefined) {
      fields.push(`skills = $${paramIndex++}`);
      values.push(updateData.skills);
    }
    if (updateData.companyWebsite !== undefined) {
      fields.push(`company_website = $${paramIndex++}`);
      values.push(updateData.companyWebsite);
    }
    if (updateData.companyDescription !== undefined) {
      fields.push(`company_description = $${paramIndex++}`);
      values.push(updateData.companyDescription);
    }
    if (updateData.role !== undefined) {
      fields.push(`role = $${paramIndex++}`);
      values.push(updateData.role);
    }
    if (updateData.jobType !== undefined || updateData.type !== undefined) {
      fields.push(`job_type = $${paramIndex++}`);
      values.push(updateData.jobType ?? updateData.type);
    }
    if (updateData.driveMode !== undefined) {
      fields.push(`drive_mode = $${paramIndex++}`);
      values.push(updateData.driveMode);
    }
    if (updateData.location !== undefined) {
      fields.push(`location = $${paramIndex++}`);
      values.push(updateData.location);
    }
    if (updateData.locations !== undefined) {
      fields.push(`locations = $${paramIndex++}`);
      values.push(updateData.locations);
    }
    if (updateData.date !== undefined) {
      fields.push(`drive_date = $${paramIndex++}`);
      values.push(updateData.date);
    }
    if (updateData.time !== undefined) {
      fields.push(`drive_time = $${paramIndex++}`);
      values.push(updateData.time);
    }
    if (updateData.applicationDeadlineTime !== undefined) {
      fields.push(`application_deadline_time = $${paramIndex++}`);
      values.push(updateData.applicationDeadlineTime);
    }
    if (updateData.venue !== undefined) {
      fields.push(`venue = $${paramIndex++}`);
      values.push(updateData.venue);
    }
    if (updateData.isDreamJob !== undefined) {
      fields.push(`is_dream_job = $${paramIndex++}`);
      values.push(updateData.isDreamJob);
    }
    if (updateData.unplacedOnly !== undefined) {
      fields.push(`unplaced_only = $${paramIndex++}`);
      values.push(updateData.unplacedOnly);
    }
    if (updateData.spocDept !== undefined) {
      fields.push(`spoc_dept = $${paramIndex++}`);
      values.push(updateData.spocDept);
    }
    if (updateData.rounds !== undefined) {
      fields.push(`rounds = $${paramIndex++}`);
      values.push(updateData.rounds);
    }
    if (updateData.testDetails !== undefined) {
      fields.push(`test_details = $${paramIndex++}`);
      values.push(updateData.testDetails);
    }
    if (updateData.interviewProcess !== undefined) {
      fields.push(`interview_process = $${paramIndex++}`);
      values.push(updateData.interviewProcess);
    }
    if (updateData.recruiterContact?.name !== undefined) {
      fields.push(`recruiter_name = $${paramIndex++}`);
      values.push(updateData.recruiterContact.name);
    }
    if (updateData.recruiterContact?.email !== undefined) {
      fields.push(`recruiter_email = $${paramIndex++}`);
      values.push(updateData.recruiterContact.email);
    }
    if (updateData.recruiterContact?.phone !== undefined) {
      fields.push(`recruiter_phone = $${paramIndex++}`);
      values.push(updateData.recruiterContact.phone);
    }
    if (updateData.ctcBreakdown?.baseSalary !== undefined) {
      fields.push(`ctc_base_salary = $${paramIndex++}`);
      values.push(updateData.ctcBreakdown.baseSalary);
    }
    if (updateData.ctcBreakdown?.variablePay !== undefined) {
      fields.push(`ctc_variable_pay = $${paramIndex++}`);
      values.push(updateData.ctcBreakdown.variablePay);
    }
    if (updateData.ctcBreakdown?.joiningBonus !== undefined) {
      fields.push(`ctc_joining_bonus = $${paramIndex++}`);
      values.push(updateData.ctcBreakdown.joiningBonus);
    }
    if (updateData.ctcBreakdown?.otherBenefits !== undefined) {
      fields.push(`ctc_other_benefits = $${paramIndex++}`);
      values.push(updateData.ctcBreakdown.otherBenefits);
    }
    if (updateData.bond !== undefined) {
      fields.push(`bond = $${paramIndex++}`);
      values.push(updateData.bond);
    }
    if (updateData.bondDetails?.amount !== undefined) {
      fields.push(`bond_amount = $${paramIndex++}`);
      values.push(updateData.bondDetails.amount);
    }
    if (updateData.bondDetails?.duration !== undefined) {
      fields.push(`bond_duration = $${paramIndex++}`);
      values.push(updateData.bondDetails.duration);
    }
    if (updateData.eligibility?.minCGPA !== undefined) {
      fields.push(`eligibility_min_cgpa = $${paramIndex++}`);
      values.push(updateData.eligibility.minCGPA);
    }
    if (updateData.eligibility?.maxBacklogs !== undefined) {
      fields.push(`eligibility_max_backlogs = $${paramIndex++}`);
      values.push(updateData.eligibility.maxBacklogs);
    }
    if (updateData.eligibility?.allowedDepartments !== undefined) {
      fields.push(`eligibility_allowed_departments = $${paramIndex++}`);
      values.push(updateData.eligibility.allowedDepartments);
    }
    if (updateData.eligibility?.allowedBatches !== undefined) {
      fields.push(`eligibility_allowed_batches = $${paramIndex++}`);
      values.push(updateData.eligibility.allowedBatches);
    }

    if (fields.length === 0) {
      const existingDrive = await this.findJobDriveById(driveId);
      if (updateData.selectionRounds !== undefined) {
        existingDrive.selectionRounds = await this.replaceSelectionRounds(driveId, updateData.selectionRounds || []);
      }
      if (updateData.placedStudents !== undefined) {
        existingDrive.placedStudents = await this.replacePlacedStudents(
          driveId,
          existingDrive.companyName,
          updateData.placedStudents || [],
          updateData.addedBy || null
        );
        existingDrive.placementFinalized = existingDrive.placedStudents.length > 0;
      }
      return existingDrive;
    }

    fields.push(`updated_at = NOW()`);
    values.push(driveId);

    const sql = `
      UPDATE job_drives 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const [results] = await sequelize.query(sql, {
      bind: values
    });

    if (!results[0]) {
      return null;
    }

    if (updateData.selectionRounds !== undefined) {
      await this.replaceSelectionRounds(driveId, updateData.selectionRounds || []);
    }

    if (updateData.placedStudents !== undefined) {
      await this.replacePlacedStudents(
        driveId,
        results[0].company_name,
        updateData.placedStudents || [],
        updateData.addedBy || null
      );
    }

    return this.findJobDriveById(driveId);
  }

  /**
   * Get eligible drives for a student
   */
  async getEligibleDrivesForStudent(studentId) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    // Get student's eligibility profile from Neon schema
    const [student] = await sequelize.query(`
      SELECT
        up.cgpa,
        COALESCE(up.current_backlogs, 0) AS current_backlogs,
        up.department,
        CAST(up.graduation_year AS text) AS batch
      FROM user_profiles up
      WHERE up.user_id = $1
    `, {
      bind: [studentId]
    });

    if (!student || student.length === 0) {
      return [];
    }

    const { cgpa, current_backlogs, batch, department } = student[0];

    const [results] = await sequelize.query(`
      SELECT 
        jd.*,
        u.email as creator_email,
        u.name as creator_name
      FROM job_drives jd
      LEFT JOIN users u ON jd.created_by = u.id
      WHERE jd.is_active = true
      AND jd.drive_date >= CURRENT_DATE
      AND (jd.eligibility_min_cgpa IS NULL OR jd.eligibility_min_cgpa <= $1)
      AND (jd.eligibility_max_backlogs IS NULL OR jd.eligibility_max_backlogs >= $2)
      AND (
        jd.eligibility_allowed_departments IS NULL 
        OR array_length(jd.eligibility_allowed_departments, 1) IS NULL 
        OR array_length(jd.eligibility_allowed_departments, 1) = 0
        OR $3 = ANY(jd.eligibility_allowed_departments)
      )
      AND (
        jd.eligibility_allowed_batches IS NULL 
        OR array_length(jd.eligibility_allowed_batches, 1) IS NULL 
        OR array_length(jd.eligibility_allowed_batches, 1) = 0
        OR $4 = ANY(jd.eligibility_allowed_batches)
      )
      ORDER BY jd.created_at DESC
    `, {
      bind: [cgpa, current_backlogs, department, batch]
    });

    return results.map(row => this.formatJobDriveFromNeon(row));
  }

  /**
   * Submit placement consent
   */
  async submitPlacementConsent(userId, consentData) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    // Check if placement_consents record exists
    const [existing] = await sequelize.query(`
      SELECT id FROM placement_consents WHERE user_id = $1
    `, {
      bind: [userId]
    });

    if (existing.length === 0) {
      // Insert new consent record
      await sequelize.query(`
        INSERT INTO placement_consents (
          id, user_id, has_agreed, agreed_at, signature, 
          ip_address, user_agent, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, NOW(), $3, $4, $5, NOW(), NOW()
        )
      `, {
        bind: [
          userId,
          consentData.hasAgreed || false,
          consentData.signature || null,
          consentData.ipAddress || null,
          consentData.userAgent || null
        ]
      });
    } else {
      // Update existing consent record
      await sequelize.query(`
        UPDATE placement_consents 
        SET has_agreed = $2,
            agreed_at = NOW(),
            signature = $3,
            ip_address = $4,
            user_agent = $5,
            updated_at = NOW()
        WHERE user_id = $1
      `, {
        bind: [
          userId,
          consentData.hasAgreed || false,
          consentData.signature || null,
          consentData.ipAddress || null,
          consentData.userAgent || null
        ]
      });
    }

    return true;
  }

  /**
   * Get placement consent for user
   */
  async getPlacementConsent(userId) {
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error('NeonDB not connected');
    }

    const [results] = await sequelize.query(`
      SELECT * FROM placement_consents WHERE user_id = $1
    `, {
      bind: [userId]
    });

    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      database: 'NeonDB (PostgreSQL)',
      status: this.isConnected ? 'active' : 'inactive'
    };
  }

  // ============================================
  // ADDITIONAL METHODS FOR COMPLETE MIGRATION
  // ============================================

  /**
   * Get job drive statistics
   */
  async getJobDriveStats(query = {}) {
    try {
      const [stats] = await this.sequelize.query(`
        SELECT 
          COUNT(*) as total_drives,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_drives,
          COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_drives,
          COUNT(DISTINCT created_by) as total_recruiters
        FROM job_drives
      `);
      
      return stats[0];
    } catch (error) {
      console.error('Error getting job drive stats:', error);
      throw error;
    }
  }

  /**
   * Get all students with profile details
   */
  async getAllStudentsWithProfiles() {
    try {
      const [students] = await this.sequelize.query(`
        SELECT 
          u.id,
          u.email,
          u.name,
          u.role,
          u.is_verified,
          up.*
        FROM users u
        LEFT JOIN user_profiles up ON u.id = up.user_id
        WHERE u.role = 'student'
        ORDER BY u.created_at DESC
      `);
      
      return students.map(s => this.formatUserFromNeon(s));
    } catch (error) {
      console.error('Error getting students:', error);
      throw error;
    }
  }

  /**
   * Get placed students count
   */
  async getPlacedStudentsCount() {
    try {
      const [result] = await this.sequelize.query(`
        SELECT COUNT(DISTINCT student_id) as count
        FROM placed_students
      `);
      
      return parseInt(result[0].count);
    } catch (error) {
      console.error('Error getting placed students count:', error);
      throw error;
    }
  }

  /**
   * Get PR allowlist entries
   */
  async getPRAllowlistTables() {
    const hasSingular = await this.tableExists('pr_allowlist');
    const hasPlural = await this.tableExists('pr_allowlists');

    if (!hasSingular && !hasPlural) {
      throw new Error('Neither pr_allowlist nor pr_allowlists table exists');
    }

    const primaryTable = hasSingular ? 'pr_allowlist' : 'pr_allowlists';
    const fallbackTable = hasSingular && hasPlural ? 'pr_allowlists' : null;
    return { primaryTable, fallbackTable };
  }

  normalizeAllowlistEntry(entry = {}) {
    return {
      ...entry,
      approved_at: entry.approved_at || entry.approved_date || null,
      requested_at: entry.requested_at || entry.created_at || null
    };
  }

  async getPRAllowlist(status = null) {
    try {
      const { primaryTable, fallbackTable } = await this.getPRAllowlistTables();
      const tablesToRead = fallbackTable ? [primaryTable, fallbackTable] : [primaryTable];

      const allRows = [];

      for (const tableName of tablesToRead) {
        const params = [];
        let query = `SELECT *, '${tableName}' AS source_table FROM ${tableName}`;

        if (status) {
          query += ' WHERE status = $1';
          params.push(status);
        }

        const [rows] = await this.sequelize.query(query, { bind: params });
        rows.forEach((row) => allRows.push(this.normalizeAllowlistEntry(row)));
      }

      const dedupedByEmail = new Map();
      allRows.forEach((row) => {
        const key = String(row.email || row.id || '').toLowerCase();
        const existing = dedupedByEmail.get(key);

        if (!existing) {
          dedupedByEmail.set(key, row);
          return;
        }

        const existingPreferred = existing.source_table === primaryTable;
        const incomingPreferred = row.source_table === primaryTable;

        if (!existingPreferred && incomingPreferred) {
          dedupedByEmail.set(key, row);
          return;
        }

        const existingTs = new Date(existing.updated_at || existing.requested_at || 0).getTime();
        const incomingTs = new Date(row.updated_at || row.requested_at || 0).getTime();
        if (incomingTs > existingTs) {
          dedupedByEmail.set(key, row);
        }
      });

      return Array.from(dedupedByEmail.values()).sort((a, b) => {
        const aTs = new Date(a.requested_at || a.created_at || 0).getTime();
        const bTs = new Date(b.requested_at || b.created_at || 0).getTime();
        return bTs - aTs;
      });
    } catch (error) {
      console.error('Error getting PR allowlist:', error);
      throw error;
    }
  }

  /**
   * Create PR allowlist entry
   */
  async createPRAllowlistEntry(data) {
    try {
      const { primaryTable } = await this.getPRAllowlistTables();
      const [result] = await this.sequelize.query(`
        INSERT INTO ${primaryTable} (email, role, department, notes, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, {
        bind: [
          data.email.toLowerCase(),
          data.role,
          data.department || null,
          data.notes || null,
          'pending'
        ]
      });
      
      return result[0];
    } catch (error) {
      console.error('Error creating PR allowlist entry:', error);
      throw error;
    }
  }

  /**
   * Update PR allowlist entry
   */
  async updatePRAllowlistEntry(id, updates) {
    try {
      const { primaryTable, fallbackTable } = await this.getPRAllowlistTables();
      const tablesToTry = fallbackTable ? [primaryTable, fallbackTable] : [primaryTable];

      for (const tableName of tablesToTry) {
        const columns = await this.getTableColumns(tableName);
        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        const mappedUpdates = { ...updates };
        if (!columns.has('approved_at') && columns.has('approved_date') && mappedUpdates.approved_at !== undefined) {
          mappedUpdates.approved_date = mappedUpdates.approved_at;
          delete mappedUpdates.approved_at;
        }

        Object.keys(mappedUpdates).forEach(key => {
          if (!columns.has(key)) {
            return;
          }
          setClauses.push(`${key} = $${paramIndex}`);
          values.push(mappedUpdates[key]);
          paramIndex++;
        });

        if (setClauses.length === 0) {
          continue;
        }

        values.push(id);
        const updatedAtSql = columns.has('updated_at') ? ', updated_at = NOW()' : '';

        const [result] = await this.sequelize.query(`
          UPDATE ${tableName}
          SET ${setClauses.join(', ')}${updatedAtSql}
          WHERE id = $${paramIndex}
          RETURNING *
        `, { bind: values });

        if (result[0]) {
          return this.normalizeAllowlistEntry(result[0]);
        }
      }

      return null;
    } catch (error) {
      console.error('Error updating PR allowlist entry:', error);
      throw error;
    }
  }

  /**
   * Find PR allowlist entry by email
   */
  async findPRAllowlistByEmail(email) {
    try {
      const { primaryTable, fallbackTable } = await this.getPRAllowlistTables();
      const normalizedEmail = email.toLowerCase();

      const [primaryResult] = await this.sequelize.query(
        `SELECT * FROM ${primaryTable} WHERE LOWER(email) = $1 LIMIT 1`,
        { bind: [normalizedEmail] }
      );

      if (primaryResult[0]) {
        return this.normalizeAllowlistEntry(primaryResult[0]);
      }

      if (!fallbackTable) {
        return null;
      }

      const [fallbackResult] = await this.sequelize.query(
        `SELECT * FROM ${fallbackTable} WHERE LOWER(email) = $1 LIMIT 1`,
        { bind: [normalizedEmail] }
      );

      return fallbackResult[0] ? this.normalizeAllowlistEntry(fallbackResult[0]) : null;
    } catch (error) {
      console.error('Error finding PR allowlist by email:', error);
      throw error;
    }
  }

  /**
   * Delete PR allowlist entry
   */
  async deletePRAllowlistEntry(id) {
    try {
      const { primaryTable, fallbackTable } = await this.getPRAllowlistTables();
      const tablesToTry = fallbackTable ? [primaryTable, fallbackTable] : [primaryTable];

      for (const tableName of tablesToTry) {
        const [deleted] = await this.sequelize.query(
          `DELETE FROM ${tableName} WHERE id = $1 RETURNING id`,
          { bind: [id] }
        );

        if (deleted[0]) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error deleting PR allowlist entry:', error);
      throw error;
    }
  }

  /**
   * Get job drive with full details
   */
  async getJobDriveWithDetails(driveId) {
    try {
      const { tableName, driveColumn } = await this.getApplicationsTableConfig();
      const [drives] = await this.sequelize.query(`
        SELECT 
          jd.*,
          u.email as creator_email,
          u.name as creator_name,
          (SELECT COUNT(*) FROM ${tableName} WHERE ${driveColumn} = jd.id) as application_count
        FROM job_drives jd
        LEFT JOIN users u ON jd.created_by = u.id
        WHERE jd.id = $1
      `, { bind: [driveId] });
      
      if (!drives || drives.length === 0) return null;
      
      return this.formatJobDriveFromNeon(drives[0]);
    } catch (error) {
      console.error('Error getting job drive with details:', error);
      throw error;
    }
  }

  /**
   * Get students who applied to a drive
   */
  async getStudentsForDrive(driveId) {
    try {
      const { tableName, driveColumn, studentColumn } = await this.getApplicationsTableConfig();
      const [students] = await this.sequelize.query(`
        SELECT 
          u.id,
          u.email,
          u.name,
          up.*,
          jda.applied_at,
          jda.status as application_status
        FROM ${tableName} jda
        JOIN users u ON jda.${studentColumn} = u.id
        LEFT JOIN user_profiles up ON u.id = up.user_id
        WHERE jda.${driveColumn} = $1
        ORDER BY jda.applied_at DESC
      `, { bind: [driveId] });
      
      return students;
    } catch (error) {
      console.error('Error getting students for drive:', error);
      throw error;
    }
  }

  /**
   * Get deleted users
   */
  async getDeletedUsers() {
    try {
      const [users] = await this.sequelize.query(`
        SELECT * FROM deleted_users
        ORDER BY deleted_at DESC
      `);
      
      return users;
    } catch (error) {
      console.error('Error getting deleted users:', error);
      throw error;
    }
  }

  /**
   * Create deletion request
   */
  async createDeletionRequest(userId, reason) {
    try {
      const [result] = await this.sequelize.query(`
        INSERT INTO deletion_requests (user_id, reason, status)
        VALUES ($1, $2, 'pending')
        RETURNING *
      `, { bind: [userId, reason] });
      
      return result[0];
    } catch (error) {
      console.error('Error creating deletion request:', error);
      throw error;
    }
  }

  /**
   * Get deletion requests
   */
  async getDeletionRequests(status = null) {
    try {
      let query = `
        SELECT 
          dr.*,
          u.email,
          u.name
        FROM deletion_requests dr
        LEFT JOIN users u ON dr.user_id = u.id
      `;
      
      const params = [];
      if (status) {
        query += ' WHERE dr.status = $1';
        params.push(status);
      }
      
      query += ' ORDER BY dr.created_at DESC';
      
      const [requests] = await this.sequelize.query(query, { bind: params });
      return requests;
    } catch (error) {
      console.error('Error getting deletion requests:', error);
      throw error;
    }
  }

  /**
   * Update deletion request
   */
  async updateDeletionRequest(requestId, updates) {
    try {
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      Object.keys(updates).forEach(key => {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex++;
      });

      values.push(requestId);
      
      const [result] = await this.sequelize.query(`
        UPDATE deletion_requests 
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `, { bind: values });
      
      return result[0];
    } catch (error) {
      console.error('Error updating deletion request:', error);
      throw error;
    }
  }

  /**
   * Get placement analytics
   */
  async getPlacementAnalytics(filters = {}) {
    try {
      const placedColumns = await this.getTableColumns('placed_students');
      const placedDriveColumn = placedColumns.has('job_drive_id') ? 'job_drive_id' : 'drive_id';
      const [analytics] = await this.sequelize.query(`
        SELECT 
          COUNT(DISTINCT ps.student_id) as total_placed,
          COUNT(DISTINCT jd.id) as total_drives,
          AVG(jd.ctc) as average_ctc,
          MAX(jd.ctc) as highest_ctc,
          MIN(jd.ctc) as lowest_ctc
        FROM placed_students ps
        LEFT JOIN job_drives jd ON ps.${placedDriveColumn} = jd.id
      `);
      
      return analytics[0];
    } catch (error) {
      console.error('Error getting placement analytics:', error);
      throw error;
    }
  }

  /**
   * Finalize placement for students
   */
  async finalizePlacement(driveId, studentIds, placementData) {
    try {
      const drive = await this.findJobDriveById(driveId);
      const placedStudents = (studentIds || []).map((studentId) => ({
        studentId,
        status: placementData.status || 'placed',
        addedBy: placementData.addedBy || null,
        addedAt: new Date(),
      }));

      await this.replacePlacedStudents(driveId, drive?.companyName || '', placedStudents, placementData.addedBy || null);

      return true;
    } catch (error) {
      console.error('Error finalizing placement:', error);
      throw error;
    }
  }

  /**
   * Update placed student
   */
  async updatePlacedStudent(driveId, studentId, updates) {
    try {
      const placedColumns = await this.getTableColumns('placed_students');
      const driveColumn = placedColumns.has('job_drive_id') ? 'job_drive_id' : 'drive_id';
      const studentColumn = placedColumns.has('student_id') ? 'student_id' : null;
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      Object.keys(updates).forEach((key) => {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex += 1;
      });

      values.push(driveId, studentId);
      const whereClause = studentColumn
        ? `${driveColumn} = $${paramIndex} AND ${studentColumn} = $${paramIndex + 1}`
        : `${driveColumn} = $${paramIndex} AND id = $${paramIndex + 1}`;

      await this.sequelize.query(`
        UPDATE placed_students 
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE ${whereClause}
      `, { bind: values });

      return true;
    } catch (error) {
      console.error('Error updating placed student:', error);
      throw error;
    }
  }

  /**
   * Delete placed student
   */
  async deletePlacedStudent(driveId, studentId) {
    try {
      const placedColumns = await this.getTableColumns('placed_students');
      const driveColumn = placedColumns.has('job_drive_id') ? 'job_drive_id' : 'drive_id';
      const studentColumn = placedColumns.has('student_id') ? 'student_id' : 'id';
      await this.sequelize.query(`
        DELETE FROM placed_students 
        WHERE ${driveColumn} = $1 AND ${studentColumn} = $2
      `, { bind: [driveId, studentId] });
      
      return true;
    } catch (error) {
      console.error('Error deleting placed student:', error);
      throw error;
    }
  }

  /**
   * Get PR jobs (jobs created by PR)
   */
  async getPRJobs(prId, department = null) {
    try {
      let query = `
        SELECT * FROM job_drives 
        WHERE created_by = $1
      `;
      const params = [prId];
      
      if (department) {
        query += ' AND spoc_dept = $2';
        params.push(department);
      }
      
      query += ' ORDER BY created_at DESC';
      
      const [jobs] = await this.sequelize.query(query, { bind: params });
      return jobs.map(j => this.formatJobDriveFromNeon(j));
    } catch (error) {
      console.error('Error getting PR jobs:', error);
      throw error;
    }
  }

  /**
   * Get PR statistics
   */
  async getPRStats(prId) {
    try {
      const { tableName, driveColumn } = await this.getApplicationsTableConfig();
      const [stats] = await this.sequelize.query(`
        SELECT 
          COUNT(*) as total_drives,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_drives,
          (SELECT COUNT(*) FROM ${tableName} jda 
           JOIN job_drives jd ON jda.${driveColumn} = jd.id 
           WHERE jd.created_by = $1) as total_applications
        FROM job_drives
        WHERE created_by = $1
      `, { bind: [prId] });
      
      return stats[0];
    } catch (error) {
      console.error('Error getting PR stats:', error);
      throw error;
    }
  }

  // ✅ ADDED
  /**
   * Get a detailed matrix of file submission status for all active drives.
   * Returns one row per (drive x required file type).
   */
  async getDetailedFileSubmissionStatus(filters = {}) {
    try {
      const params = [];
      let paramIndex = 1;
      let whereClause = 'WHERE 1=1';

      if (filters.fileType) {
        whereClause += ` AND m.f_type = $${paramIndex++}`;
        params.push(filters.fileType);
      }

      if (filters.department) {
        whereClause += ` AND m.spoc_dept = $${paramIndex++}`;
        params.push(filters.department);
      }

      if (filters.submissionStatus === 'Submitted') {
        whereClause += ' AND jdf.id IS NOT NULL';
      } else if (filters.submissionStatus === 'Not Submitted') {
        whereClause += ' AND jdf.id IS NULL';
      }

      const sql = `
        WITH file_types AS (
          SELECT 'spoc' AS f_type
          UNION ALL
          SELECT 'expenditure' AS f_type
        ),
        expected_matrix AS (
          SELECT
            jd.id AS drive_id,
            jd.company_name,
            jd.role,
            jd.spoc_dept,
            ft.f_type
          FROM job_drives jd
          CROSS JOIN file_types ft
          WHERE jd.is_active = true
        )
        SELECT DISTINCT ON (m.drive_id, m.f_type)
          m.drive_id,
          m.company_name,
          m.role,
          m.spoc_dept AS uploader_department,
          m.f_type AS file_type,
          jdf.id,
          jdf.file_name,
          jdf.file_url,
          jdf.created_at,
          u.name AS uploader_name,
          u.email AS uploader_email,
          CASE WHEN jdf.id IS NOT NULL THEN 'Submitted' ELSE 'Not Submitted' END AS submission_status,
          (
            SELECT COUNT(DISTINCT f2.file_type)
            FROM job_drive_files f2
            WHERE f2.job_drive_id::text = m.drive_id::text
              AND f2.file_type IN ('spoc', 'expenditure')
          ) = 2 AS is_drive_complete
        FROM expected_matrix m
        LEFT JOIN job_drive_files jdf
          ON m.drive_id::text = jdf.job_drive_id::text
          AND m.f_type = jdf.file_type
        LEFT JOIN users u ON jdf.uploader_id = u.id
        ${whereClause}
        ORDER BY m.drive_id ASC, m.f_type ASC, jdf.created_at DESC
      `;

      const [rows] = await this.sequelize.query(sql, { bind: params });
      return rows;
    } catch (error) {
      console.error('Error getting detailed file submission status:', error);
      throw error;
    }
  }
}

module.exports = new NeonService();
