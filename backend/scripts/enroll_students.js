const db = require('../db');

async function main() {
  try {
    // 1. Get all students
    const studentsRes = await db.query("SELECT id, name FROM users WHERE role = 'student'");
    const students = studentsRes.rows;
    console.log(`Found ${students.length} students in system.`);

    // 2. Find course AI-102 (id = 10)
    const courseRes = await db.query("SELECT id, name, code FROM courses WHERE code = 'AI-102'");
    if (courseRes.rows.length === 0) {
      console.log('AI-102 course not found.');
      return;
    }
    const courseId = courseRes.rows[0].id;
    console.log(`Course AI-102 has ID: ${courseId}`);

    // 3. Enroll students in AI-102
    for (const student of students) {
      const enrollCheck = await db.query(
        "SELECT * FROM course_enrollments WHERE student_id = $1 AND course_id = $2",
        [student.id, courseId]
      );
      if (enrollCheck.rows.length === 0) {
        await db.query(
          "INSERT INTO course_enrollments (student_id, course_id) VALUES ($1, $2)",
          [student.id, courseId]
        );
        console.log(`Enrolled student ${student.name} (ID: ${student.id}) in AI-102.`);
      } else {
        console.log(`Student ${student.name} already enrolled.`);
      }
    }
    console.log('Enrollment update completed.');
  } catch (err) {
    console.error('Error running script:', err);
  } finally {
    process.exit(0);
  }
}

main();
