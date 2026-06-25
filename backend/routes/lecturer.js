const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const crypto = require('crypto');

// Apply authentication and lecturer role verification to all lecturer endpoints
router.use(authenticateToken, requireRole('lecturer'));

// 1. Get Dashboard Statistics
router.get('/dashboard-stats', async (req, res) => {
  const { course_id, min_threshold } = req.query;
  if (!course_id) return res.status(400).json({ error: 'Course ID is required.' });

  try {
    const threshold = parseFloat(min_threshold || '75');

    // 1. Total enrolled students in this course
    const totalStudentsResult = await db.query(
      "SELECT COUNT(*) FROM course_enrollments WHERE course_id = $1",
      [course_id]
    );
    
    // 2. Total sessions held for this course
    const totalSessionsResult = await db.query(
      "SELECT COUNT(*) FROM sessions WHERE course_id = $1",
      [course_id]
    );

    // 3. Average attendance rate for this course
    const overallResult = await db.query(`
      SELECT 
        COUNT(CASE WHEN ar.is_present = true THEN 1 END) as present_count,
        COUNT(*) as total_count
      FROM attendance_records ar
      JOIN sessions s ON ar.session_id = s.id
      WHERE s.course_id = $1
    `, [course_id]);

    // 4. Students below threshold for this course
    const belowThresholdResult = await db.query(`
      SELECT COUNT(*) FROM (
        SELECT ce.student_id,
               COUNT(CASE WHEN ar.is_present = true THEN 1 END)::float / NULLIF(COUNT(DISTINCT s.id), 0) * 100 as rate
        FROM course_enrollments ce
        JOIN sessions s ON ce.course_id = s.course_id
        LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = ce.student_id
        WHERE ce.course_id = $1
        GROUP BY ce.student_id
      ) sub WHERE COALESCE(rate, 100) < $2
    `, [course_id, threshold]);

    // 5. Average duration minutes
    const avgDurationResult = await db.query(
      `SELECT AVG(duration_minutes) as avg_duration 
       FROM attendance_records ar
       JOIN sessions s ON ar.session_id = s.id
       WHERE s.course_id = $1 AND ar.duration_minutes IS NOT NULL`,
      [course_id]
    );

    // 6. Early leavers count
    const earlyLeaversResult = await db.query(
      `SELECT COUNT(*) as early_leavers_count 
       FROM attendance_records ar
       JOIN sessions s ON ar.session_id = s.id
       WHERE s.course_id = $1 AND ar.attendance_status = 'early_leaver'`,
      [course_id]
    );

    const totalStudents = parseInt(totalStudentsResult.rows[0].count) || 0;
    const totalSessions = parseInt(totalSessionsResult.rows[0].count) || 0;
    const studentsBelowThreshold = parseInt(belowThresholdResult.rows[0].count) || 0;
    
    const presentCount = parseInt(overallResult.rows[0].present_count) || 0;
    const totalCount = parseInt(overallResult.rows[0].total_count) || 0;
    const overallPercentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 100;
    
    const avgDuration = Math.round(parseFloat(avgDurationResult.rows[0].avg_duration || '0'));
    const earlyLeaversCount = parseInt(earlyLeaversResult.rows[0].early_leavers_count) || 0;

    res.json({
      totalStudents,
      totalSessions,
      studentsBelowThreshold,
      overallPercentage,
      avgDuration,
      earlyLeaversCount
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Attendance Trends (Weekly data)
router.get('/attendance-trends', async (req, res) => {
  const { course_id } = req.query;
  if (!course_id) return res.status(400).json({ error: 'Course ID is required.' });

  try {
    const trendResult = await db.query(`
      SELECT 
        s.date,
        COUNT(CASE WHEN ar.is_present = true THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100 as attendance_rate
      FROM sessions s
      LEFT JOIN attendance_records ar ON s.id = ar.session_id
      WHERE s.course_id = $1
      GROUP BY s.date, s.id
      ORDER BY s.date DESC
      LIMIT 10
    `, [course_id]);

    res.json(trendResult.rows.reverse());
  } catch (error) {
    console.error('Error fetching trend stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Courses CRUD
router.get('/courses', async (req, res) => {
  const { academic_period_id } = req.query;
  try {
    let query = `
      SELECT c.*, 
             COALESCE(ce.enrolled_count, 0) as enrolled_count,
             COALESCE(ar.rate, 100) as overall_attendance_rate
      FROM courses c
      LEFT JOIN (
        SELECT course_id, COUNT(*) as enrolled_count 
        FROM course_enrollments 
        GROUP BY course_id
      ) ce ON c.id = ce.course_id
      LEFT JOIN (
        SELECT s.course_id,
               ROUND(COUNT(CASE WHEN r.is_present = true THEN 1 END)::float / NULLIF(COUNT(r.id), 0) * 100) as rate
        FROM sessions s
        LEFT JOIN attendance_records r ON s.id = r.session_id
        GROUP BY s.course_id
      ) ar ON c.id = ar.course_id
      WHERE c.lecturer_id = $1
    `;
    const params = [req.user.id];
    if (academic_period_id) {
      query += ' AND c.academic_period_id = $2';
      params.push(academic_period_id);
    }
    query += ' ORDER BY c.name ASC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/courses', async (req, res) => {
  const { name, code, academic_period_id } = req.body;
  if (!name || !code || !academic_period_id) return res.status(400).json({ error: 'Course name, code, and academic period are required.' });

  try {
    const result = await db.query(
      'INSERT INTO courses (name, code, lecturer_id, academic_period_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, code, req.user.id, academic_period_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/courses/:id', async (req, res) => {
  const { name, code } = req.body;
  try {
    const result = await db.query(
      'UPDATE courses SET name = $1, code = $2 WHERE id = $3 AND lecturer_id = $4 RETURNING *',
      [name, code, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Course not found or unauthorized.' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/courses/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM courses WHERE id = $1 AND lecturer_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Course not found or unauthorized.' });
    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Session Operations
router.post('/sessions', async (req, res) => {
  const { course_id, duration_mins, qr_rotation_mins, location_name, gps_lat, gps_lng, allowed_radius_meters } = req.body;
  if (!course_id) return res.status(400).json({ error: 'Course ID is required.' });

  try {
    const courseRes = await db.query('SELECT academic_period_id FROM courses WHERE id = $1', [course_id]);
    if (courseRes.rows.length === 0) return res.status(404).json({ error: 'Course not found.' });
    const academicPeriodId = courseRes.rows[0].academic_period_id;

    // Generate unique session code
    const sessionCode = 'ATT-' + Math.floor(1000 + Math.random() * 9000);
    // Generate signed/unique token for initial QR
    const qrToken = crypto.randomBytes(32).toString('hex');

    const duration = duration_mins || 10;
    const rotation = qr_rotation_mins || 1;
    const radius = allowed_radius_meters || 200;

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
    const qrExpiresAt = new Date(startTime.getTime() + rotation * 60 * 1000);

    const result = await db.query(
      `INSERT INTO sessions (course_id, start_time, end_time, qr_token, session_code, is_active, qr_expires_at, qr_rotation_interval_mins, created_by, location_name, gps_lat, gps_lng, allowed_radius_meters, academic_period_id)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [course_id, startTime, endTime, qrToken, sessionCode, qrExpiresAt, rotation, req.user.id, location_name || null, gps_lat || null, gps_lng || null, radius, academicPeriodId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/sessions', async (req, res) => {
  const { academic_period_id, course_id } = req.query;
  try {
    let query = `
      SELECT s.*, c.name as course_name, c.code as course_code,
      (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND is_present = true) as present_count,
      (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND is_present = true AND checkout_timestamp IS NOT NULL) as checked_out_count,
      (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND is_present = true AND checkout_timestamp IS NULL) as not_checked_out_count,
      (SELECT COALESCE(ROUND(AVG(duration_minutes)), 0) FROM attendance_records WHERE session_id = s.id AND duration_minutes IS NOT NULL) as avg_duration_minutes,
      (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND attendance_status = 'early_leaver') as early_leavers_count
      FROM sessions s
      JOIN courses c ON s.course_id = c.id
      WHERE s.created_by = $1
    `;
    const params = [req.user.id];
    let paramIndex = 2;

    if (academic_period_id) {
      query += ` AND s.academic_period_id = $${paramIndex++}`;
      params.push(academic_period_id);
    }
    if (course_id) {
      query += ` AND s.course_id = $${paramIndex++}`;
      params.push(course_id);
    }

    query += ' ORDER BY s.id DESC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update/Toggle Session state manually (e.g. deactivate early)
router.put('/sessions/:id/toggle', async (req, res) => {
  const { is_active } = req.body;
  try {
    const result = await db.query(
      'UPDATE sessions SET is_active = $1 WHERE id = $2 AND created_by = $3 RETURNING *',
      [is_active, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found or unauthorized.' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error toggling session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Activate checkout for session
router.post('/sessions/:id/activate-checkout', async (req, res) => {
  const { checkout_window_minutes, early_leaver_threshold_minutes } = req.body;
  try {
    const sessionRes = await db.query('SELECT * FROM sessions WHERE id = $1 AND created_by = $2', [req.params.id, req.user.id]);
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Session not found or unauthorized.' });
    const session = sessionRes.rows[0];

    const now = new Date();
    const qrToken = crypto.randomBytes(32).toString('hex');
    const sessionCode = 'OUT-' + Math.floor(1000 + Math.random() * 9000);
    const rotation = session.qr_rotation_interval_mins || 1;
    const expiresAt = new Date(now.getTime() + rotation * 60 * 1000);

    const windowMins = checkout_window_minutes !== undefined ? checkout_window_minutes : (session.checkout_window_minutes || 10);
    const thresholdMins = early_leaver_threshold_minutes !== undefined ? early_leaver_threshold_minutes : (session.early_leaver_threshold_minutes || 15);

    const result = await db.query(
      `UPDATE sessions 
       SET checkout_qr_token = $1, 
           checkout_qr_expires_at = $2, 
           checkout_session_code = $3, 
           checkout_code_expires_at = $4,
           checkout_window_minutes = $5,
           early_leaver_threshold_minutes = $6
       WHERE id = $7 AND created_by = $8
       RETURNING *`,
      [qrToken, expiresAt, sessionCode, expiresAt, windowMins, thresholdMins, req.params.id, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error activating checkout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Attendance Operations (Live List / Manual Mark)
router.get('/sessions/:id/live-attendance', async (req, res) => {
  try {
    // Get all students enrolled in the course of this session
    // And join attendance_records to see who has checked in
    const result = await db.query(
      `SELECT 
         u.id as student_id,
         u.name,
         u.student_id as academic_student_id,
         u.level,
         COALESCE(ar.is_present, false) as is_present,
         ar.timestamp,
         ar.method,
         ar.gps_lat,
         ar.gps_lng,
         ar.ip_address,
         ar.checkout_timestamp,
         ar.checkout_method,
         ar.duration_minutes,
         ar.attendance_status
       FROM sessions s
       JOIN course_enrollments ce ON s.course_id = ce.course_id
       JOIN users u ON ce.student_id = u.id
       LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = u.id
       WHERE s.id = $1 AND s.created_by = $2
       ORDER BY u.name ASC`,
      [req.params.id, req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching live attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual bulk mark or single edit
router.post('/sessions/:id/manual-mark', async (req, res) => {
  const { student_id, is_present } = req.body; // db internal user id, and presence flag
  try {
    if (is_present) {
      await db.query(
        `INSERT INTO attendance_records (session_id, student_id, method, is_present)
         VALUES ($1, $2, 'manual', true)
         ON CONFLICT (session_id, student_id) 
         DO UPDATE SET is_present = true, method = 'manual', timestamp = CURRENT_TIMESTAMP`,
        [req.params.id, student_id]
      );
    } else {
      // Toggle to absent: just remove or set is_present false
      await db.query(
        `INSERT INTO attendance_records (session_id, student_id, method, is_present)
         VALUES ($1, $2, 'manual', false)
         ON CONFLICT (session_id, student_id)
         DO UPDATE SET is_present = false, method = 'manual', timestamp = CURRENT_TIMESTAMP`,
        [req.params.id, student_id]
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error manual marking attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CSV Import Manual Bulk Mark
router.post('/sessions/:id/bulk-csv-mark', async (req, res) => {
  const { student_ids } = req.body; // array of academic student IDs (e.g. ['STU001', 'STU002'])
  if (!student_ids || !Array.isArray(student_ids)) {
    return res.status(400).json({ error: 'Student IDs array is required.' });
  }

  try {
    // Look up the database ids for these academic student IDs
    const usersResult = await db.query(
      "SELECT id, student_id FROM users WHERE student_id = ANY($1) AND role = 'student'",
      [student_ids]
    );

    const successfulMarks = [];
    for (const row of usersResult.rows) {
      await db.query(
        `INSERT INTO attendance_records (session_id, student_id, method, is_present)
         VALUES ($1, $2, 'manual', true)
         ON CONFLICT (session_id, student_id) 
         DO UPDATE SET is_present = true, method = 'manual', timestamp = CURRENT_TIMESTAMP`,
        [req.params.id, row.id]
      );
      successfulMarks.push(row.student_id);
    }

    res.json({
      message: `Successfully marked ${successfulMarks.length} students present.`,
      marked_ids: successfulMarks
    });
  } catch (error) {
    console.error('Error during bulk mark:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. Reports / Flagged Students
router.get('/courses/:id/report', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         u.name,
         u.student_id as academic_student_id,
         u.level,
         s.date as session_date,
         s.session_code,
         ar.timestamp as checkin_time,
         ar.checkout_timestamp as checkout_time,
         ar.duration_minutes,
         ar.attendance_status,
         (SELECT COUNT(*) FROM sessions WHERE course_id = $1) as total_sessions,
         (SELECT COUNT(CASE WHEN is_present = true THEN 1 END) FROM attendance_records WHERE student_id = u.id AND session_id IN (SELECT id FROM sessions WHERE course_id = $1)) as attended_sessions,
         (SELECT COUNT(CASE WHEN attendance_status = 'early_leaver' THEN 1 END) FROM attendance_records WHERE student_id = u.id AND session_id IN (SELECT id FROM sessions WHERE course_id = $1)) as early_leaver_sessions
       FROM course_enrollments ce
       JOIN users u ON ce.student_id = u.id
       CROSS JOIN sessions s
       LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = u.id
       WHERE ce.course_id = $1 AND s.course_id = $1
       ORDER BY u.name ASC, s.date DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting course report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Student Management (Import, Edit)
router.get('/students', async (req, res) => {
  try {
    const students = await db.query(
      "SELECT id, name, email, student_id, level, created_at FROM users WHERE role = 'student' ORDER BY name ASC"
    );
    res.json(students.rows);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
