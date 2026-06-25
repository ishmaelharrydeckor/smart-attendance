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

    // Auto-rotation logic for check-in
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

    // Auto-rotation logic for check-out (if active/generated)
    if (session.checkout_qr_token && now > new Date(session.checkout_qr_expires_at)) {
      const newCheckoutQrToken = crypto.randomBytes(32).toString('hex');
      const newExpiry = new Date(now.getTime() + (session.qr_rotation_interval_mins || 1) * 60 * 1000);
      const updateResult = await db.query(
        `UPDATE sessions 
         SET checkout_qr_token = $1, checkout_qr_expires_at = $2
         WHERE id = $3 
         RETURNING *`,
        [newCheckoutQrToken, newExpiry, session.id]
      );
      session = updateResult.rows[0];
    }
    if (session.checkout_session_code && now > new Date(session.checkout_code_expires_at)) {
      const newCheckoutSessionCode = 'OUT-' + Math.floor(1000 + Math.random() * 9000);
      const newExpiry = new Date(now.getTime() + (session.qr_rotation_interval_mins || 1) * 60 * 1000);
      const updateResult = await db.query(
        `UPDATE sessions 
         SET checkout_session_code = $1, checkout_code_expires_at = $2
         WHERE id = $3 
         RETURNING *`,
        [newCheckoutSessionCode, newExpiry, session.id]
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

// Student Checkout Endpoint
router.post('/:sessionId/checkout', authenticateToken, async (req, res) => {
  const studentId = req.user.role === 'student' ? req.user.id : req.body.student_id;
  const { method, qr_token, session_code } = req.body;
  const { sessionId } = req.params;

  if (!method || (method === 'qr' && !qr_token) || (method === 'code' && !session_code)) {
    return res.status(400).json({ error: 'Checkout method and token/code are required.' });
  }

  try {
    // 1. Get session details
    const sessionRes = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const session = sessionRes.rows[0];

    // 2. Validate token or code
    const now = new Date();
    if (method === 'qr') {
      if (session.checkout_qr_token !== qr_token || now > new Date(session.checkout_qr_expires_at)) {
        return res.status(400).json({ error: 'Invalid or expired checkout QR code.' });
      }
    } else if (method === 'code') {
      if (session.checkout_session_code !== session_code || now > new Date(session.checkout_code_expires_at)) {
        return res.status(400).json({ error: 'Invalid or expired checkout session code.' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid checkout method.' });
    }

    // 3. Find check-in record
    const checkinRes = await db.query(
      'SELECT * FROM attendance_records WHERE session_id = $1 AND student_id = $2 AND is_present = true',
      [sessionId, studentId]
    );

    if (checkinRes.rows.length === 0) {
      return res.status(400).json({ error: 'You must check in first before checking out.' });
    }

    const checkin = checkinRes.rows[0];
    if (checkin.checkout_timestamp) {
      return res.status(400).json({ error: 'You have already checked out for this session.' });
    }

    // 4. Compute status and duration
    const duration = Math.max(0, Math.round((now - new Date(checkin.timestamp)) / 1000 / 60));
    const sessionEndTime = new Date(session.end_time);
    const diffMs = sessionEndTime - now;
    const diffMins = diffMs / 1000 / 60;

    let attendance_status = 'present';
    if (now > sessionEndTime) {
      attendance_status = 'late_checkout';
    } else if (diffMins > session.early_leaver_threshold_minutes) {
      attendance_status = 'early_leaver';
    }

    // 5. Update record
    const updateRes = await db.query(
      `UPDATE attendance_records
       SET checkout_timestamp = $1, checkout_method = $2, duration_minutes = $3, attendance_status = $4
       WHERE session_id = $5 AND student_id = $6
       RETURNING *`,
      [now, method, duration, attendance_status, sessionId, studentId]
    );

    res.json({
      success: true,
      message: 'Checked out successfully.',
      record: updateRes.rows[0]
    });
  } catch (error) {
    console.error('Error during student checkout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Lecturer Manual Checkout Endpoint (Bulk/Single)
router.post('/:sessionId/checkout/manual', authenticateToken, async (req, res) => {
  if (req.user.role !== 'lecturer') {
    return res.status(403).json({ error: 'Unauthorized.' });
  }
  const { student_ids } = req.body;
  const { sessionId } = req.params;
  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return res.status(400).json({ error: 'Array of student IDs is required.' });
  }

  try {
    const sessionRes = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const session = sessionRes.rows[0];
    const now = new Date();
    const sessionEndTime = new Date(session.end_time);
    const diffMs = sessionEndTime - now;
    const diffMins = diffMs / 1000 / 60;
    
    let attendance_status = 'present';
    if (now > sessionEndTime) {
      attendance_status = 'late_checkout';
    } else if (diffMins > session.early_leaver_threshold_minutes) {
      attendance_status = 'early_leaver';
    }

    const updatedRecords = [];
    for (const studentId of student_ids) {
      const checkinRes = await db.query(
        'SELECT * FROM attendance_records WHERE session_id = $1 AND student_id = $2 AND is_present = true',
        [sessionId, studentId]
      );
      if (checkinRes.rows.length > 0) {
        const checkin = checkinRes.rows[0];
        const duration = Math.max(0, Math.round((now - new Date(checkin.timestamp)) / 1000 / 60));
        
        const updateRes = await db.query(
          `UPDATE attendance_records
           SET checkout_timestamp = $1, checkout_method = 'manual', duration_minutes = $2, attendance_status = $3
           WHERE session_id = $4 AND student_id = $5
           RETURNING *`,
          [now, duration, attendance_status, sessionId, studentId]
        );
        if (updateRes.rows.length > 0) {
          updatedRecords.push(updateRes.rows[0]);
        }
      }
    }
    res.json({ success: true, updatedRecords });
  } catch (error) {
    console.error('Error during manual checkout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
