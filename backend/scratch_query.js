const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const q = `
      SELECT s.id, s.date, s.start_time, c.name as course_name, c.code,
             u.name as lecturer_name
      FROM sessions s
      JOIN courses c ON s.course_id = c.id
      JOIN users u ON c.lecturer_id = u.id
      WHERE c.code = (
        SELECT code FROM courses
        WHERE lecturer_id = (SELECT id FROM users WHERE role = 'lecturer' LIMIT 1)
        ORDER BY id ASC
        LIMIT 1
      )
      ORDER BY s.start_time DESC;
    `;
    const res = await pool.query(q);
    console.log("Sessions matching first course:", res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
