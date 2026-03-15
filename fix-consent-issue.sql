-- Fix Consent Issue - Update User View and Check Data
-- Run this in your NeonDB console

-- 1. First, let's update the user view to include consent data
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

-- 2. Check if placement_consents table exists and has data
SELECT 'Checking placement_consents table...' as status;
SELECT COUNT(*) as total_consent_records FROM placement_consents;

-- 3. Check if there are any consent records with has_agreed = true
SELECT COUNT(*) as agreed_consents FROM placement_consents WHERE has_agreed = true;

-- 4. Show recent consent submissions
SELECT 
    pc.user_id,
    u.email,
    pc.has_agreed,
    pc.agreed_at,
    pc.signature,
    pc.created_at
FROM placement_consents pc
LEFT JOIN users u ON pc.user_id = u.id
ORDER BY pc.created_at DESC
LIMIT 10;

-- 5. Check the updated view for a specific user (replace with your user ID)
-- SELECT * FROM v_users_complete WHERE email = 'your-email@example.com';

-- 6. If you need to manually fix a consent record, use this (replace USER_ID):
-- UPDATE placement_consents 
-- SET has_agreed = true, agreed_at = NOW(), updated_at = NOW()
-- WHERE user_id = 'YOUR_USER_ID_HERE';