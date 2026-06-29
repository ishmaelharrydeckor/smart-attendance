const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const res = await pool.query('SELECT s.id, s.course_id, s.is_active, s.start_time, s.end_time, c.name, c.code FROM sessions s JOIN courses c ON s.course_id = c.id WHERE s.is_active = true');
    console.log('Active Sessions:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
