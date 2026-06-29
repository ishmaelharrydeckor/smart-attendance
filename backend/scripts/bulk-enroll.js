// ============================================================
// TEST DATA SCRIPT — DO NOT RUN IN PRODUCTION
// This script bulk-enrolls hardcoded test students into a
// specific course. It is for development/seeding only.
// Running this on the production database will enroll fake
// students into real courses and corrupt attendance records.
// ============================================================

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: bulk-enroll.js must not be run in production.')
  console.error('Set NODE_ENV to development or test to use this script.')
  process.exit(1)
}

const fs = require('fs');
const path = require('path');
const db = require('../db');

async function main() {
  const args = process.argv.slice(2);
  const courseId = args[0];
  const csvPath = args[1] || './test-students.csv';  // default path if not provided

  if (!courseId) {
    console.error('Usage: node bulk-enroll.js <course_id> [path/to/students.csv] [--dry-run]');
    console.error('Example: node bulk-enroll.js 3 ./scripts/test-students.csv');
    process.exit(1);
  }

  // Validate courseId is a number
  if (isNaN(Number(courseId))) {
    console.error('ERROR: course_id must be a numeric database ID, not a course code.');
    console.error('Find the course ID by running: SELECT id, code, name FROM courses;');
    process.exit(1);
  }

  const isDryRun = args.includes('--dry-run');

  try {
    // Read and parse CSV file (or get students from database as fallback if CSV does not exist)
    let students = [];
    if (fs.existsSync(csvPath)) {
      console.log(`Reading students from CSV: ${csvPath}`);
      const fileContent = fs.readFileSync(csvPath, 'utf8');
      const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      for (let i = 0; i < lines.length; i++) {
        // Skip header
        if (i === 0 && (lines[i].toLowerCase().includes('name') || lines[i].toLowerCase().includes('email'))) {
          continue;
        }
        const parts = lines[i].split(',').map(p => p.trim());
        if (parts.length >= 2) {
          students.push({
            name: parts[0],
            student_id: parts[1],
            email: parts[2] || `${parts[1]}@student.edu`
          });
        }
      }
    } else {
      console.log(`CSV file not found at ${csvPath}. Falling back to system students from DB...`);
      const studentsRes = await db.query("SELECT id, name, email, student_id FROM users WHERE role = 'student'");
      students = studentsRes.rows;
    }

    if (students.length === 0) {
      console.log('No students found to enroll.');
      return;
    }

    if (isDryRun) {
      console.log('[DRY RUN] No changes will be written to the database.');
      console.log('[DRY RUN] Would enroll the following students into course', courseId, ':');
      students.forEach(s => console.log(' -', s.name, '|', s.student_id, '|', s.email));
      process.exit(0);
    }

    // Database changes
    console.log(`Enrolling ${students.length} students into course ID ${courseId}...`);
    for (const student of students) {
      const userRes = await db.query(
        "SELECT id FROM users WHERE student_id = $1 OR email = $2",
        [student.student_id, student.email]
      );

      if (userRes.rows.length === 0) {
        console.warn(`Warning: Student ${student.name} (${student.student_id}) does not exist in the users table. Skipping.`);
        continue;
      }

      const dbUserId = userRes.rows[0].id;

      await db.query(
        `INSERT INTO course_enrollments (student_id, course_id)
         VALUES ($1, $2)
         ON CONFLICT (student_id, course_id) DO NOTHING`,
        [dbUserId, Number(courseId)]
      );
      console.log(`Enrolled student ${student.name} (ID: ${dbUserId}) in course ${courseId}.`);
    }

    console.log('Enrollment update completed successfully.');
  } catch (err) {
    console.error('Error running script:', err);
  } finally {
    process.exit(0);
  }
}

main();
