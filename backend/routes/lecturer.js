const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const crypto = require('crypto');

// Apply authentication and lecturer role verification to all lecturer endpoints
router.use(authenticateToken, requireRole('lecturer'));

// 1. Get Dashboard Statistics
router.get('/dashboard-stats', async (req, res) => {
  try {
    // Total enrolled students
    const totalStudentsResult = await db.query(
      "SELECT COUNT(*) FROM users WHERE role = 'student'"
    );
    
    // Present Today / Absent Today (across today's sessions)
    const todayStatsResult = await db.query(`
      SELECT 
        COUNT(CASE WHEN ar.is_present = true THEN 1 END) as present_today,
        COUNT(CASE WHEN ar.is_present = false THEN 1 END) as absent_today
      FROM attendance_records ar
      JOIN sessions s ON ar.session_id = s.id
      WHERE s.date = CURRENT_DATE
    `);

    // Overall attendance %
    const overallResult = await db.query(`
      SELECT 
        COUNT(CASE WHEN is_present = true THEN 1 END) as present_count,
        COUNT(*) as total_count
      FROM attendance_records
    `);

    const totalStudents = parseInt(totalStudentsResult.rows[0].count) || 0;
    const presentToday = parseInt(todayStatsResult.rows[0].present_today) || 0;
    const absentToday = parseInt(todayStatsResult.rows[0].absent_today) || 0;
    
    const presentCount = parseInt(overallResult.rows[0].present_count) || 0;
    const totalCount = parseInt(overallResult.rows[0].total_count) || 0;
    const overallPercentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 100;

    res.json({
      totalStudents,
      presentToday,
      absentToday,
      overallPercentage
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Attendance Trends (Weekly data)
router.get('/attendance-trends', async (req, res) => {
  try {
    const trendResult = await db.query(`
      SELECT 
        s.date,
        COUNT(CASE WHEN ar.is_present = true THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100 as attendance_rate
      FROM sessions s
      LEFT JOIN attendance_records ar ON s.id = ar.session_id
      GROUP BY s.date
      ORDER BY s.date DESC
      LIMIT 10
    `);

    res.json(trendResult.rows.reverse());
  } catch (error) {
    console.error('Error fetching trend stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Courses CRUD
router.get('/courses', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT c.*, COUNT(ce.id) as enrolled_count FROM courses c LEFT JOIN course_enrollments ce ON c.id = ce.course_id WHERE c.lecturer_id = $1 GROUP BY c.id ORDER BY c.name ASC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/courses', async (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Course name and code are required.' });

  try {
    const result = await db.query(
      'INSERT INTO courses (name, code, lecturer_id) VALUES ($1, $2, $3) RETURNING *',
      [name, code, req.user.id]
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
      `INSERT INTO sessions (course_id, start_time, end_time, qr_token, session_code, is_active, qr_expires_at, qr_rotation_interval_mins, created_by, location_name, gps_lat, gps_lng, allowed_radius_meters)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [course_id, startTime, endTime, qrToken, sessionCode, qrExpiresAt, rotation, req.user.id, location_name || null, gps_lat || null, gps_lng || null, radius]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, c.name as course_name, c.code as course_code,
       (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND is_present = true) as present_count
       FROM sessions s
       JOIN courses c ON s.course_id = c.id
       WHERE s.created_by = $1
       ORDER BY s.id DESC`,
      [req.user.id]
    );
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
         ar.ip_address
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
         u.id as student_id,
         u.name,
         u.student_id as academic_student_id,
         u.level,
         COUNT(CASE WHEN ar.is_present = true THEN 1 END) as attended_sessions,
         (SELECT COUNT(*) FROM sessions WHERE course_id = $1) as total_sessions
       FROM course_enrollments ce
       JOIN users u ON ce.student_id = u.id
       LEFT JOIN sessions s ON s.course_id = ce.course_id
       LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = u.id
       WHERE ce.course_id = $1
       GROUP BY u.id
       ORDER BY u.name ASC`,
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
