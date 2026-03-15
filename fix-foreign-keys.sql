-- Fix Foreign Key Constraints for User Deletion
-- Run this in your NeonDB console

-- 1. Drop existing foreign key constraint on job_drives.created_by
ALTER TABLE job_drives 
DROP CONSTRAINT IF EXISTS job_drives_created_by_fkey;

-- 2. Remove NOT NULL constraint from created_by column (CRITICAL!)
ALTER TABLE job_drives 
ALTER COLUMN created_by DROP NOT NULL;

-- 3. Add new foreign key with SET NULL (so job drives remain when user is deleted)
ALTER TABLE job_drives 
ADD CONSTRAINT job_drives_created_by_fkey 
FOREIGN KEY (created_by) 
REFERENCES users(id) 
ON DELETE SET NULL;

-- 3. Fix job_drive_applications.student_id (applications should be deleted with student)
ALTER TABLE job_drive_applications 
DROP CONSTRAINT IF EXISTS job_drive_applications_student_id_fkey;

ALTER TABLE job_drive_applications 
ADD CONSTRAINT job_drive_applications_student_id_fkey 
FOREIGN KEY (student_id) 
REFERENCES users(id) 
ON DELETE CASCADE;

-- 4. Fix placed_students.student_id (placement records should be deleted with student)
ALTER TABLE placed_students 
DROP CONSTRAINT IF EXISTS placed_students_student_id_fkey;

ALTER TABLE placed_students 
ADD CONSTRAINT placed_students_student_id_fkey 
FOREIGN KEY (student_id) 
REFERENCES users(id) 
ON DELETE CASCADE;

-- 5. Fix placed_students.added_by (keep record but set added_by to NULL)
ALTER TABLE placed_students 
DROP CONSTRAINT IF EXISTS placed_students_added_by_fkey;

ALTER TABLE placed_students 
ADD CONSTRAINT placed_students_added_by_fkey 
FOREIGN KEY (added_by) 
REFERENCES users(id) 
ON DELETE SET NULL;

-- 6. Fix PR allowlist for automatic deletion (COMPLETE SOLUTION)
-- First, clean up existing orphaned entries
DELETE FROM pr_allowlist 
WHERE email NOT IN (SELECT email FROM users);

-- Add user_id column to pr_allowlist table if it doesn't exist
ALTER TABLE pr_allowlist 
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Update existing pr_allowlist entries to link with users by email
UPDATE pr_allowlist 
SET user_id = u.id 
FROM users u 
WHERE pr_allowlist.email = u.email 
AND pr_allowlist.user_id IS NULL;

-- Add foreign key constraint for automatic deletion
ALTER TABLE pr_allowlist 
DROP CONSTRAINT IF EXISTS pr_allowlist_user_id_fkey;

ALTER TABLE pr_allowlist 
ADD CONSTRAINT pr_allowlist_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES users(id) 
ON DELETE CASCADE;

-- Verify the changes
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_name IN ('job_drives', 'job_drive_applications', 'placed_students', 'pr_allowlist')
ORDER BY tc.table_name, kcu.column_name;