const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const records = await pool.query('SELECT * FROM attendance_records WHERE student_id = 54');
    console.log('Attendance Records for Student 54:', records.rows);

    const enrollments = await pool.query('SELECT * FROM course_enrollments WHERE student_id = 54');
    console.log('Enrollments for Student 54:', enrollments.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
