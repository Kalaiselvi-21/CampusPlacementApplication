-- ============================================================================
-- NEONDB (PostgreSQL) COMPLETE SCHEMA - PART 1
-- Includes ALL business logic, triggers, and functions
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- For password hashing

-- ============================================================================
-- SYSTEM CONFIGURATION TABLE
-- ============================================================================
CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID
);

INSERT INTO system_config (config_key, config_value, description) VALUES
('median_ctc', '6.0', 'Median CTC in LPA for dream job calculation'),
('min_password_length', '8', 'Minimum password length'),
('otp_expiry_minutes', '10', 'OTP expiry time in minutes'),
('max_otp_attempts', '5', 'Maximum OTP attempts before lockout');

-- ============================================================================
-- TABLE 1: users (with all validation)
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'placement_officer', 'placement_representative', 'admin', 'po', 'pr')),
    is_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    verification_token_expires TIMESTAMP,
    reset_password_token VARCHAR(255),
    reset_password_expires TIMESTAMP,
    
    -- Placement Policy Consent
    consent_has_agreed BOOLEAN DEFAULT FALSE,
    consent_agreed_at TIMESTAMP,
    consent_signature TEXT,
    consent_pdf_path VARCHAR(500),
    consent_ip_address VARCHAR(45),
    consent_user_agent TEXT,
    
    -- OTP Verification Status
    otp_is_verified BOOLEAN DEFAULT FALSE,
    otp_code VARCHAR(10),
    otp_expires TIMESTAMP,
    otp_verified BOOLEAN DEFAULT FALSE,
    otp_verified_at TIMESTAMP,
    otp_attempts INTEGER DEFAULT 0,
    otp_last_sent TIMESTAMP,
    otp_resend_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Email format validation
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    
    -- Students must use institutional email
    CONSTRAINT check_student_email CHECK (
        role != 'student' OR email ~* '@gct\.ac\.in$'
    )
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_role_verified ON users(role, is_verified);
CREATE INDEX idx_users_verification_token ON users(verification_token);
CREATE INDEX idx_users_created_at ON users(created_at DESC);
