/**
 * Fix Foreign Key Constraints for User Deletion
 * Changes CASCADE to SET NULL so job drives remain when user is deleted
 */

const { sequelize } = require('../config/neonConnection');
require('dotenv').config();

async function fixForeignKeyConstraints() {
  console.log('\n🔧 Fixing Foreign Key Constraints\n');
  console.log('='.repeat(60));
  
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to NeonDB\n');
    
    // 1. Drop existing foreign key constraint on job_drives.created_by
    console.log('1. Dropping existing foreign key on job_drives.created_by...');
    await sequelize.query(`
      ALTER TABLE job_drives 
      DROP CONSTRAINT IF EXISTS job_drives_created_by_fkey;
    `);
    console.log('   ✅ Dropped old constraint\n');
    
    // 2. Add new foreign key with SET NULL
    console.log('2. Adding new foreign key with SET NULL...');
    await sequelize.query(`
      ALTER TABLE job_drives 
      ADD CONSTRAINT job_drives_created_by_fkey 
      FOREIGN KEY (created_by) 
      REFERENCES users(id) 
      ON DELETE SET NULL;
    `);
    console.log('   ✅ Added new constraint with SET NULL\n');
    
    // 3. Fix job_drive_applications.student_id (should CASCADE)
    console.log('3. Fixing job_drive_applications.student_id...');
    await sequelize.query(`
      ALTER TABLE job_drive_applications 
      DROP CONSTRAINT IF EXISTS job_drive_applications_student_id_fkey;
    `);
    await sequelize.query(`
      ALTER TABLE job_drive_applications 
      ADD CONSTRAINT job_drive_applications_student_id_fkey 
      FOREIGN KEY (student_id) 
      REFERENCES users(id) 
      ON DELETE CASCADE;
    `);
    console.log('   ✅ Applications will be deleted with student\n');
    
    // 4. Fix placed_students.student_id (should CASCADE)
    console.log('4. Fixing placed_students.student_id...');
    await sequelize.query(`
      ALTER TABLE placed_students 
      DROP CONSTRAINT IF EXISTS placed_students_student_id_fkey;
    `);
    await sequelize.query(`
      ALTER TABLE placed_students 
      ADD CONSTRAINT placed_students_student_id_fkey 
      FOREIGN KEY (student_id) 
      REFERENCES users(id) 
      ON DELETE CASCADE;
    `);
    console.log('   ✅ Placement records will be deleted with student\n');
    
    // 5. Fix placed_students.added_by (should SET NULL)
    console.log('5. Fixing placed_students.added_by...');
    await sequelize.query(`
      ALTER TABLE placed_students 
      DROP CONSTRAINT IF EXISTS placed_students_added_by_fkey;
    `);
    await sequelize.query(`
      ALTER TABLE placed_students 
      ADD CONSTRAINT placed_students_added_by_fkey 
      FOREIGN KEY (added_by) 
      REFERENCES users(id) 
      ON DELETE SET NULL;
    `);
    console.log('   ✅ Placement records will keep but set added_by to NULL\n');
    
    // 6. Verify the changes
    console.log('6. Verifying changes...');
    const [constraints] = await sequelize.query(`
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
    `);
    
    console.log('\n   Current Foreign Key Constraints:');
    console.log('   ' + '-'.repeat(56));
    constraints.forEach(c => {
      console.log(`   ${c.table_name}.${c.column_name} -> ${c.foreign_table_name}.${c.foreign_column_name}`);
      console.log(`   ON DELETE: ${c.delete_rule}`);
      console.log('');
    });
    
    console.log('='.repeat(60));
    console.log('\n✅ Foreign key constraints fixed successfully!\n');
    console.log('Now when you delete a user:');
    console.log('  - Job drives will remain (created_by set to NULL)');
    console.log('  - Applications will be deleted');
    console.log('  - Placement records will be deleted\n');
    
  } catch (error) {
    console.error('\n❌ Error fixing constraints:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

fixForeignKeyConstraints();
