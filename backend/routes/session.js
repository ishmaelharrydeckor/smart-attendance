const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');

// Get/Poll current active session details (QR token, remaining time, etc.)
router.get('/:id/qr-status', authenticateToken, async (req, res) => {
  try {
    const sessionResult = await db.query(
      `SELECT s.*, c.name as course_name, c.code as course_code
       FROM sessions s
       JOIN courses c ON s.course_id = c.id
       WHERE s.id = $1`,
      [req.params.id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    let session = sessionResult.rows[0];
    const now = new Date();

    // Check if session is expired completely
    if (now > new Date(session.end_time)) {
      if (session.is_active) {
        // Automatically close it
        await db.query('UPDATE sessions SET is_active = false WHERE id = $1', [session.id]);
        session.is_active = false;
      }
      return res.json({ ...session, status: 'EXPIRED' });
    }

    if (!session.is_active) {
      return res.json({ ...session, status: 'INACTIVE' });
    }

    // Auto-rotation logic
    if (now > new Date(session.qr_expires_at)) {
      const newQrToken = crypto.randomBytes(32).toString('hex');
      const newSessionCode = 'ATT-' + Math.floor(1000 + Math.random() * 9000);
      const newExpiry = new Date(now.getTime() + (session.qr_rotation_interval_mins || 1) * 60 * 1000);

      const updateResult = await db.query(
        `UPDATE sessions 
         SET qr_token = $1, qr_expires_at = $2, session_code = $3
         WHERE id = $4 
         RETURNING *`,
        [newQrToken, newExpiry, newSessionCode, session.id]
      );
      session = updateResult.rows[0];
    }

    res.json({
      ...session,
      status: 'ACTIVE',
      seconds_remaining: Math.max(0, Math.round((new Date(session.end_time) - now) / 1000)),
      qr_seconds_remaining: Math.max(0, Math.round((new Date(session.qr_expires_at) - now) / 1000))
    });
  } catch (error) {
    console.error('Error fetching/rotating QR status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
