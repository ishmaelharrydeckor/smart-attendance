const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    // 1. Add checkout_active to sessions table
    await pool.query("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS checkout_active BOOLEAN DEFAULT FALSE;");
    console.log("Successfully added checkout_active column to sessions table.");

    // 2. Update existing active checkout sessions to have checkout_active = true if they have checkout_qr_token
    await pool.query("UPDATE sessions SET checkout_active = TRUE WHERE checkout_qr_token IS NOT NULL;");
    console.log("Updated checkout_active status for existing checkouts.");

    // 3. Verify columns list again
    const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sessions'");
    console.log("Updated columns of sessions table:", res.rows.map(r => r.column_name));
  } catch (err) {
    console.error("DB migration error:", err.message);
  } finally {
    await pool.end();
  }
}

run();
