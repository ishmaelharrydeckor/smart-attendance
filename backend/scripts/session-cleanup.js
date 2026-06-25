const db = require('../db');

async function autoCloseSessions() {
  const now = new Date();
  try {
    const res = await db.query(
      `UPDATE sessions 
       SET is_active = false 
       WHERE is_active = true AND end_time <= $1
       RETURNING id`,
      [now]
    );
    if (res.rows.length > 0) {
      console.log(`[Session Cleanup] Auto-closed ${res.rows.length} expired sessions:`, res.rows.map(r => r.id));
    }
  } catch (error) {
    console.error('[Session Cleanup] Error running auto-close sessions:', error);
  }
}

module.exports = { autoCloseSessions };
