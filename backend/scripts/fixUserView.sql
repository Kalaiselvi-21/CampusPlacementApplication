-- Fix v_users_complete view to include placement consent and verification status

DROP VIEW IF EXISTS v_users_complete CASCADE;

CREATE OR REPLACE VIEW v_users_complete AS
SELECT 
    u.id,
    u.name,
    u.email,
    u.password,
    u.role,
    u.is_verified,
    u.verification_token,
    u.verification_token_expires,
    u.created_at,
    u.updated_at,
    -- User Profile fields
    up.profile_name,
    up.roll_number,
    up.department,
    up.cgpa,
    up.graduation_year,
    up.is_profile_complete,
    up.profile_completion_percentage,
    up.is_placed,
    up.placement_status,
    up.phone_number,
    up.linkedin_url,
    -- Placement Consent fields
    pc.has_agreed AS consent_has_agreed,
    pc.agreed_at AS consent_agreed_at,
    pc.signature AS consent_signature,
    -- Verification Status fields
    vs.otp_verified,
    vs.is_verified AS otp_is_verified,
    vs.otp_code,
    vs.otp_expires,
    vs.otp_attempts,
    vs.otp_resend_count,
    vs.last_otp_sent,
    vs.verified_at
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
LEFT JOIN placement_consents pc ON u.id = pc.user_id
LEFT JOIN verification_status vs ON u.id = vs.user_id;

-- Grant appropriate permissions
GRANT SELECT ON v_users_complete TO PUBLIC;
