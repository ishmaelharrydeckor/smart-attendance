const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const res = await pool.query("SELECT ar.id, ar.student_id, ar.session_id, ar.timestamp, ar.checkout_timestamp, ar.is_present, c.name as course_name FROM attendance_records ar JOIN sessions s ON ar.session_id = s.id JOIN courses c ON s.course_id = c.id WHERE ar.timestamp >= '2026-06-29 00:00:00Z'");
    console.log("Today's Attendance Records:", res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
