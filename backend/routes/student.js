const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiting on check-in endpoints to prevent spamming
const checkInLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 check-in attempts per minute
  message: { error: 'Too many check-in attempts. Please try again in a minute.' }
});

router.use(authenticateToken, requireRole('student'));

// Helper function to calculate distance using Haversine formula
const getDistanceInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
};

// 1. Get Enrolled Courses & Attendance Percentage
router.get('/courses', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         c.id, c.name, c.code,
         COUNT(CASE WHEN ar.is_present = true THEN 1 END) as attended,
         COUNT(DISTINCT s.id) as total_sessions
       FROM course_enrollments ce
       JOIN courses c ON ce.course_id = c.id
       LEFT JOIN sessions s ON s.course_id = c.id
       LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = ce.student_id
       WHERE ce.student_id = $1
       GROUP BY c.id, c.name, c.code`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching student courses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Get Student's Detailed History
router.get('/history', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         ar.timestamp, ar.method, ar.is_present,
         s.date, s.start_time,
         c.name as course_name, c.code as course_code
       FROM attendance_records ar
       JOIN sessions s ON ar.session_id = s.id
       JOIN courses c ON s.course_id = c.id
       WHERE ar.student_id = $1
       ORDER BY ar.timestamp DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching student history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. QR Check-in Endpoint
router.post('/check-in/qr', checkInLimiter, async (req, res) => {
  const { qr_token, lat, lng } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!qr_token) {
    return res.status(400).json({ error: 'QR token is required.' });
  }

  try {
    // 1. Find active session with this QR token that hasn't expired yet
    const now = new Date();
    const sessionResult = await db.query(
      `SELECT s.*, c.name as course_name, c.code as course_code 
       FROM sessions s
       JOIN courses c ON s.course_id = c.id
       WHERE s.qr_token = $1 AND s.is_active = true AND s.end_time > $2 AND s.qr_expires_at > $2`,
      [qr_token, now]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired QR code. Try scanning again.' });
    }

    const session = sessionResult.rows[0];

    // 2. Verify enrollment
    const enrollment = await db.query(
      'SELECT id FROM course_enrollments WHERE student_id = $1 AND course_id = $2',
      [req.user.id, session.course_id]
    );

    if (enrollment.rows.length === 0) {
      return res.status(403).json({ error: 'You are not enrolled in this course.' });
    }

    // 3. Optional GPS Verification
    if (process.env.GPS_VERIFICATION_ENABLED === 'true') {
      const targetLat = session.gps_lat ? parseFloat(session.gps_lat) : parseFloat(process.env.CAMPUS_LAT || '5.6037');
      const targetLng = session.gps_lng ? parseFloat(session.gps_lng) : parseFloat(process.env.CAMPUS_LNG || '-0.1870');
      const allowedRadius = parseFloat(process.env.ALLOWED_RADIUS_METERS || '200');

      if (!lat || !lng) {
        return res.status(400).json({ error: 'GPS coordinates required for verification.' });
      }

      // Check accuracy (prevent low-accuracy network fallback / mock location)
      const reqAccuracy = req.body.accuracy ? parseFloat(req.body.accuracy) : null;
      if (reqAccuracy && reqAccuracy > 150) {
        return res.status(400).json({ error: 'GPS signal accuracy is too low. Please turn on your device GPS or move near a window.' });
      }

      const distance = getDistanceInMeters(lat, lng, targetLat, targetLng);
      if (distance > allowedRadius) {
        return res.status(400).json({ error: 'Verification failed. You are outside the allowed class radius.' });
      }
    }

    // 4. Record attendance
    await db.query(
      `INSERT INTO attendance_records (session_id, student_id, method, gps_lat, gps_lng, ip_address, is_present)
       VALUES ($1, $2, 'qr', $3, $4, $5, true)
       ON CONFLICT (session_id, student_id)
       DO UPDATE SET is_present = true, method = 'qr', timestamp = CURRENT_TIMESTAMP`,
      [session.id, req.user.id, lat || null, lng || null, ipAddress]
    );

    res.json({
      success: true,
      message: `Checked in successfully for ${session.course_name} (${session.course_code})`
    });
  } catch (error) {
    console.error('Error during QR check-in:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Session Numeric Code Check-in
router.post('/check-in/code', checkInLimiter, async (req, res) => {
  const { session_code, lat, lng } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!session_code) {
    return res.status(400).json({ error: 'Session code is required.' });
  }

  try {
    // Find active session matching code
    const now = new Date();
    const sessionResult = await db.query(
      `SELECT s.*, c.name as course_name, c.code as course_code 
       FROM sessions s
       JOIN courses c ON s.course_id = c.id
       WHERE s.session_code = $1 AND s.is_active = true AND s.end_time > $2`,
      [session_code, now]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired session code.' });
    }

    const session = sessionResult.rows[0];

    // Verify enrollment
    const enrollment = await db.query(
      'SELECT id FROM course_enrollments WHERE student_id = $1 AND course_id = $2',
      [req.user.id, session.course_id]
    );

    if (enrollment.rows.length === 0) {
      return res.status(403).json({ error: 'You are not enrolled in this course.' });
    }

    // Optional GPS Verification
    if (process.env.GPS_VERIFICATION_ENABLED === 'true') {
      const targetLat = session.gps_lat ? parseFloat(session.gps_lat) : parseFloat(process.env.CAMPUS_LAT || '5.6037');
      const targetLng = session.gps_lng ? parseFloat(session.gps_lng) : parseFloat(process.env.CAMPUS_LNG || '-0.1870');
      const allowedRadius = parseFloat(process.env.ALLOWED_RADIUS_METERS || '200');

      if (!lat || !lng) {
        return res.status(400).json({ error: 'GPS coordinates required for verification.' });
      }

      // Check accuracy
      const reqAccuracy = req.body.accuracy ? parseFloat(req.body.accuracy) : null;
      if (reqAccuracy && reqAccuracy > 150) {
        return res.status(400).json({ error: 'GPS signal accuracy is too low. Please turn on your device GPS or move near a window.' });
      }

      const distance = getDistanceInMeters(lat, lng, targetLat, targetLng);
      if (distance > allowedRadius) {
        return res.status(400).json({ error: 'Verification failed. You are outside the allowed class radius.' });
      }
    }

    // Record attendance
    await db.query(
      `INSERT INTO attendance_records (session_id, student_id, method, gps_lat, gps_lng, ip_address, is_present)
       VALUES ($1, $2, 'code', $3, $4, $5, true)
       ON CONFLICT (session_id, student_id)
       DO UPDATE SET is_present = true, method = 'code', timestamp = CURRENT_TIMESTAMP`,
      [session.id, req.user.id, lat || null, lng || null, ipAddress]
    );

    res.json({
      success: true,
      message: `Checked in successfully for ${session.course_name} (${session.course_code})`
    });
  } catch (error) {
    console.error('Error during code check-in:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
