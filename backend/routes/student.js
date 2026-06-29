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

// 5. Student ID & Short Code Lookup Fallback Check-in (allows students with camera issues to check in)
router.post('/check-in/fallback', checkInLimiter, async (req, res) => {
  const { student_id, session_code, lat, lng } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!student_id || !session_code) {
    return res.status(400).json({ error: 'Student ID and Session Code are required.' });
  }

  try {
    const now = new Date();
    // 1. Find the student user record
    const studentRes = await db.query(
      'SELECT id FROM users WHERE student_id = $1 AND role = \'student\'',
      [student_id]
    );
    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student ID not found.' });
    }
    const student = studentRes.rows[0];

    // 2. Find active session matching code
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

    // 3. Verify enrollment
    const enrollment = await db.query(
      'SELECT id FROM course_enrollments WHERE student_id = $1 AND course_id = $2',
      [student.id, session.course_id]
    );

    if (enrollment.rows.length === 0) {
      return res.status(403).json({ error: 'Student is not enrolled in this course.' });
    }

    // 4. Optional GPS Verification
    if (process.env.GPS_VERIFICATION_ENABLED === 'true') {
      const targetLat = session.gps_lat ? parseFloat(session.gps_lat) : parseFloat(process.env.CAMPUS_LAT || '5.6037');
      const targetLng = session.gps_lng ? parseFloat(session.gps_lng) : parseFloat(process.env.CAMPUS_LNG || '-0.1870');
      const allowedRadius = session.allowed_radius_meters ? parseFloat(session.allowed_radius_meters) : parseFloat(process.env.ALLOWED_RADIUS_METERS || '200');

      if (!lat || !lng) {
        return res.status(400).json({ error: 'GPS coordinates required for verification.' });
      }

      const distance = getDistanceInMeters(lat, lng, targetLat, targetLng);
      if (distance > allowedRadius) {
        return res.status(400).json({ error: 'Verification failed. You are outside the allowed class radius.' });
      }
    }

    // 5. Calculate Grace Period Status
    const timeElapsedMins = Math.max(0, (now.getTime() - new Date(session.start_time).getTime()) / 1000 / 60);
    const gracePeriod = session.late_grace_period_minutes || 10;
    const attendanceStatus = timeElapsedMins <= gracePeriod ? 'present' : 'late';

    // 6. Record attendance
    await db.query(
      `INSERT INTO attendance_records (session_id, student_id, method, gps_lat, gps_lng, ip_address, is_present, attendance_status)
       VALUES ($1, $2, 'manual_id_code', $3, $4, $5, true, $6)
       ON CONFLICT (session_id, student_id)
       DO UPDATE SET is_present = true, method = 'manual_id_code', timestamp = CURRENT_TIMESTAMP, attendance_status = $6`,
      [session.id, student.id, lat || null, lng || null, ipAddress, attendanceStatus]
    );

    res.json({
      success: true,
      message: `Checked in successfully for ${session.course_name} (${session.course_code})`
    });
  } catch (error) {
    console.error('Error during fallback check-in:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.use(authenticateToken, requireRole('student'));

// Helper function to calculate distance using Haversine formula is now defined at the top before the public check-in route.

// 1. Get Enrolled Courses & Attendance Percentage
router.get('/courses', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         c.id, c.name, c.code,
         COUNT(CASE WHEN ar.is_present = true THEN 1 END) as attended,
         COALESCE(c.total_sessions, COUNT(DISTINCT s.id))::integer as total_sessions
       FROM course_enrollments ce
       JOIN courses c ON ce.course_id = c.id
       JOIN academic_periods ap ON c.academic_period_id = ap.id
       LEFT JOIN sessions s ON s.course_id = c.id
       LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = ce.student_id
       WHERE ce.student_id = $1 AND ap.is_current = true
       GROUP BY c.id, c.name, c.code, c.total_sessions`,
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
         ar.checkout_timestamp, ar.duration_minutes, ar.attendance_status,
         s.date, s.start_time, s.end_time, s.id as session_id,
         s.checkout_qr_token, s.checkout_window_minutes,
         c.name as course_name, c.code as course_code
       FROM attendance_records ar
       JOIN sessions s ON ar.session_id = s.id
       JOIN courses c ON s.course_id = c.id
       WHERE ar.student_id = $1
       ORDER BY ar.timestamp DESC`,
      [req.user.id]
    );
    res.set('Cache-Control', 'no-store');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching student history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get active session for student's enrolled courses
router.get('/active-session', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, c.name as course_name, c.code as course_code
       FROM sessions s
       JOIN courses c ON s.course_id = c.id
       JOIN course_enrollments ce ON s.course_id = ce.course_id
       WHERE ce.student_id = $1 AND s.is_active = true AND s.end_time > CURRENT_TIMESTAMP
       LIMIT 1`,
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching active session:', error);
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
      const allowedRadius = session.allowed_radius_meters ? parseFloat(session.allowed_radius_meters) : parseFloat(process.env.ALLOWED_RADIUS_METERS || '200');

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

    // 4. Record attendance with grace period check
    const timeElapsedMins = Math.max(0, (now - new Date(session.start_time)) / 1000 / 60);
    const gracePeriod = session.late_grace_period_minutes || 10;
    const attendanceStatus = timeElapsedMins <= gracePeriod ? 'present' : 'late';

    await db.query(
      `INSERT INTO attendance_records (session_id, student_id, method, gps_lat, gps_lng, ip_address, is_present, attendance_status)
       VALUES ($1, $2, 'qr', $3, $4, $5, true, $6)
       ON CONFLICT (session_id, student_id)
       DO UPDATE SET is_present = true, method = 'qr', timestamp = CURRENT_TIMESTAMP, attendance_status = $6`,
      [session.id, req.user.id, lat || null, lng || null, ipAddress, attendanceStatus]
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
      const allowedRadius = session.allowed_radius_meters ? parseFloat(session.allowed_radius_meters) : parseFloat(process.env.ALLOWED_RADIUS_METERS || '200');

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

    // Record attendance with grace period check
    const timeElapsedMins = Math.max(0, (now - new Date(session.start_time)) / 1000 / 60);
    const gracePeriod = session.late_grace_period_minutes || 10;
    const attendanceStatus = timeElapsedMins <= gracePeriod ? 'present' : 'late';

    await db.query(
      `INSERT INTO attendance_records (session_id, student_id, method, gps_lat, gps_lng, ip_address, is_present, attendance_status)
       VALUES ($1, $2, 'code', $3, $4, $5, true, $6)
       ON CONFLICT (session_id, student_id)
       DO UPDATE SET is_present = true, method = 'code', timestamp = CURRENT_TIMESTAMP, attendance_status = $6`,
      [session.id, req.user.id, lat || null, lng || null, ipAddress, attendanceStatus]
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

// 5. Student ID & Short Code Lookup Fallback Check-in is now defined as a public route at the top of the file.

// Checkout via QR token
router.post('/check-out', async (req, res) => {
  const { session_id, qr_token } = req.body;
  const studentId = req.user.id;
  try {
    const sessionRes = await db.query('SELECT * FROM sessions WHERE id = $1', [session_id]);
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
    const session = sessionRes.rows[0];

    const now = new Date();
    if (session.checkout_qr_token !== qr_token || now > new Date(session.checkout_qr_expires_at)) {
      return res.status(400).json({ error: 'Invalid or expired checkout QR code.' });
    }

    const checkinRes = await db.query(
      'SELECT * FROM attendance_records WHERE session_id = $1 AND student_id = $2 AND is_present = true',
      [session_id, studentId]
    );
    if (checkinRes.rows.length === 0) {
      return res.status(400).json({ error: 'You must check in first before checking out.' });
    }
    const checkin = checkinRes.rows[0];
    if (checkin.checkout_timestamp) {
      return res.status(400).json({ error: 'You have already checked out for this session.' });
    }

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

    await db.query(
      `UPDATE attendance_records
       SET checkout_timestamp = $1, checkout_method = 'qr', duration_minutes = $2, attendance_status = $3
       WHERE session_id = $4 AND student_id = $5`,
      [now, duration, attendance_status, session_id, studentId]
    );

    res.json({
      duration_minutes: duration,
      attendance_status: attendance_status === 'late_checkout' ? 'present' : attendance_status
    });
  } catch (error) {
    console.error('Error during student QR checkout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Checkout via session code
router.post('/check-out/code', async (req, res) => {
  const { session_id, code } = req.body;
  const studentId = req.user.id;
  try {
    const sessionRes = await db.query('SELECT * FROM sessions WHERE id = $1', [session_id]);
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
    const session = sessionRes.rows[0];

    const now = new Date();
    if (session.checkout_session_code !== code || now > new Date(session.checkout_code_expires_at)) {
      return res.status(400).json({ error: 'Invalid or expired checkout code.' });
    }

    const checkinRes = await db.query(
      'SELECT * FROM attendance_records WHERE session_id = $1 AND student_id = $2 AND is_present = true',
      [session_id, studentId]
    );
    if (checkinRes.rows.length === 0) {
      return res.status(400).json({ error: 'You must check in first before checking out.' });
    }
    const checkin = checkinRes.rows[0];
    if (checkin.checkout_timestamp) {
      return res.status(400).json({ error: 'You have already checked out for this session.' });
    }

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

    await db.query(
      `UPDATE attendance_records
       SET checkout_timestamp = $1, checkout_method = 'code', duration_minutes = $2, attendance_status = $3
       WHERE session_id = $4 AND student_id = $5`,
      [now, duration, attendance_status, session_id, studentId]
    );

    res.json({
      duration_minutes: duration,
      attendance_status: attendance_status === 'late_checkout' ? 'present' : attendance_status
    });
  } catch (error) {
    console.error('Error during student code checkout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
