-- Fix Foreign Key Constraint for User Deletion
-- Change from CASCADE to SET NULL so job drives remain when user is deleted

-- 1. Drop the existing foreign key constraint
ALTER TABLE job_drives 
DROP CONSTRAINT IF EXISTS job_drives_created_by_fkey;

-- 2. Add new foreign key constraint with SET NULL
ALTER TABLE job_drives 
ADD CONSTRAINT job_drives_created_by_fkey 
FOREIGN KEY (created_by) 
REFERENCES users(id) 
ON DELETE SET NULL;

-- 3. Also fix job_drive_applications if needed
ALTER TABLE job_drive_applications 
DROP CONSTRAINT IF EXISTS job_drive_applications_student_id_fkey;

ALTER TABLE job_drive_applications 
ADD CONSTRAINT job_drive_applications_student_id_fkey 
FOREIGN KEY (student_id) 
REFERENCES users(id) 
ON DELETE CASCADE;  -- Applications should be deleted when student is deleted

-- 4. Fix placed_students table
ALTER TABLE placed_students 
DROP CONSTRAINT IF EXISTS placed_students_student_id_fkey;

ALTER TABLE placed_students 
ADD CONSTRAINT placed_students_student_id_fkey 
FOREIGN KEY (student_id) 
REFERENCES users(id) 
ON DELETE CASCADE;  -- Placement records should be deleted when student is deleted

-- 5. Fix placed_students added_by
ALTER TABLE placed_students 
DROP CONSTRAINT IF EXISTS placed_students_added_by_fkey;

ALTER TABLE placed_students 
ADD CONSTRAINT placed_students_added_by_fkey 
FOREIGN KEY (added_by) 
REFERENCES users(id) 
ON DELETE SET NULL;  -- Keep placement record but set added_by to NULL

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
AND tc.table_name IN ('job_drives', 'job_drive_applications', 'placed_students')
ORDER BY tc.table_name, kcu.column_name;
