const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole, requireLecturerOrTA, requireCourseAccess } = require('../middleware/auth');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const AdmZip = require('adm-zip');



// Apply authentication to all lecturer endpoints
router.use(authenticateToken);

// 1. Get Dashboard Statistics
router.get('/dashboard-stats', requireLecturerOrTA, requireCourseAccess, async (req, res) => {
  const { course_id, min_threshold } = req.query;
  if (!course_id) return res.status(400).json({ error: 'Course ID is required.' });

  try {
    const threshold = parseFloat(min_threshold || '75');

    // Fetch the course to check if there is a manual total_sessions value
    const courseResult = await db.query(
      "SELECT total_sessions FROM courses WHERE id = $1",
      [course_id]
    );
    const courseLimit = courseResult.rows[0]?.total_sessions;

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
    const sessionsHeld = parseInt(totalSessionsResult.rows[0].count) || 0;
    const totalSessions = courseLimit !== null && courseLimit !== undefined ? courseLimit : sessionsHeld;

    // 3. Average attendance rate for this course
    const overallResult = await db.query(`
      SELECT 
        COUNT(CASE WHEN ar.is_present = true THEN 1 END) as present_count
      FROM attendance_records ar
      JOIN sessions s ON ar.session_id = s.id
      WHERE s.course_id = $1
    `, [course_id]);

    // 4. Students below threshold for this course
    const belowThresholdResult = await db.query(`
      SELECT COUNT(*) FROM (
        SELECT ce.student_id,
               COUNT(CASE WHEN ar.is_present = true THEN 1 END)::float as attended_count
         FROM course_enrollments ce
         LEFT JOIN sessions s ON ce.course_id = s.course_id
         LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = ce.student_id
         WHERE ce.course_id = $1
         GROUP BY ce.student_id
       ) sub WHERE COALESCE((attended_count / NULLIF($3, 0)) * 100, 100) < $2
     `, [course_id, threshold, totalSessions]);
 
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
     const studentsBelowThreshold = parseInt(belowThresholdResult.rows[0].count) || 0;
     
     const presentCount = parseInt(overallResult.rows[0].present_count) || 0;
     const totalPotentialCheckins = totalStudents * totalSessions;
     const overallPercentage = totalPotentialCheckins > 0 ? Math.round((presentCount / totalPotentialCheckins) * 100) : 100;
     
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
 router.get('/attendance-trends', requireLecturerOrTA, requireCourseAccess, async (req, res) => {
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
router.get('/courses', requireLecturerOrTA, async (req, res) => {
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
    `;
    let params = [];
    if (req.user.role === 'ta') {
      query += ` JOIN course_ta_assignments cta ON c.id = cta.course_id WHERE cta.ta_user_id = $1`;
      params.push(req.user.id);
    } else {
      query += ` WHERE c.lecturer_id = $1`;
      params.push(req.user.id);
    }
    let paramIndex = params.length + 1;
    if (academic_period_id) {
      query += ` AND c.academic_period_id = $${paramIndex}`;
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

router.post('/courses', requireRole('lecturer'), async (req, res) => {
  const { name, code, academic_period_id, total_sessions } = req.body;
  if (!name || !code || !academic_period_id) return res.status(400).json({ error: 'Course name, code, and academic period are required.' });

  try {
    const periodRes = await db.query('SELECT semester FROM academic_periods WHERE id = $1', [academic_period_id]);
    if (periodRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid academic period.' });
    }
    const semester = periodRes.rows[0].semester;
    const match = code.trim().match(/(\d+)$/);
    if (match) {
      const lastNumber = parseInt(match[1]);
      const isOdd = lastNumber % 2 !== 0;
      if (isOdd && semester !== 1) {
        return res.status(400).json({ error: 'Course codes ending in odd numbers are for first semesters.' });
      }
      if (!isOdd && semester !== 2) {
        return res.status(400).json({ error: 'Course codes ending in even numbers are for second semesters.' });
      }
    }

    const result = await db.query(
      'INSERT INTO courses (name, code, lecturer_id, academic_period_id, total_sessions) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, code, req.user.id, academic_period_id, total_sessions !== undefined && total_sessions !== '' ? parseInt(total_sessions) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.put('/courses/:id', requireRole('lecturer'), async (req, res) => {
  const { name, code, total_sessions } = req.body;
  try {
    if (code) {
      const courseCheck = await db.query(
        'SELECT c.academic_period_id, ap.semester FROM courses c JOIN academic_periods ap ON c.academic_period_id = ap.id WHERE c.id = $1 AND c.lecturer_id = $2',
        [req.params.id, req.user.id]
      );
      if (courseCheck.rows.length === 0) return res.status(404).json({ error: 'Course not found or unauthorized.' });
      
      const semester = courseCheck.rows[0].semester;
      const match = code.trim().match(/(\d+)$/);
      if (match) {
        const lastNumber = parseInt(match[1]);
        const isOdd = lastNumber % 2 !== 0;
        if (isOdd && semester !== 1) {
          return res.status(400).json({ error: 'Course codes ending in odd numbers are for first semesters.' });
        }
        if (!isOdd && semester !== 2) {
          return res.status(400).json({ error: 'Course codes ending in even numbers are for second semesters.' });
        }
      }
    }

    const result = await db.query(
      'UPDATE courses SET name = $1, code = $2, total_sessions = $3 WHERE id = $4 AND lecturer_id = $5 RETURNING *',
      [name, code, total_sessions !== undefined && total_sessions !== '' ? parseInt(total_sessions) : null, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Course not found or unauthorized.' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/courses/:id', requireRole('lecturer'), async (req, res) => {
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
router.post('/sessions', requireLecturerOrTA, requireCourseAccess, async (req, res) => {
  const { course_id, duration_mins, qr_rotation_mins, location_name, gps_lat, gps_lng, allowed_radius_meters, late_grace_period_minutes } = req.body;
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
    const gracePeriod = late_grace_period_minutes || 10;

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
    const qrExpiresAt = new Date(startTime.getTime() + rotation * 60 * 1000);

    const result = await db.query(
      `INSERT INTO sessions (course_id, start_time, end_time, qr_token, session_code, is_active, qr_expires_at, qr_rotation_interval_mins, created_by, location_name, gps_lat, gps_lng, allowed_radius_meters, academic_period_id, late_grace_period_minutes)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [course_id, startTime, endTime, qrToken, sessionCode, qrExpiresAt, rotation, req.user.id, location_name || null, gps_lat || null, gps_lng || null, radius, academicPeriodId, gracePeriod]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/sessions', requireLecturerOrTA, async (req, res) => {
  const { academic_period_id, course_id } = req.query;
  try {
    let query = `
      SELECT s.*, c.name as course_name, c.code as course_code, u.name as creator_name,
      (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND is_present = true) as present_count,
      (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND is_present = true AND checkout_timestamp IS NOT NULL) as checked_out_count,
      (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND is_present = true AND checkout_timestamp IS NULL) as not_checked_out_count,
      (SELECT COALESCE(ROUND(AVG(duration_minutes)), 0) FROM attendance_records WHERE session_id = s.id AND duration_minutes IS NOT NULL) as avg_duration_minutes,
      (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND attendance_status = 'early_leaver') as early_leavers_count
      FROM sessions s
      JOIN courses c ON s.course_id = c.id
      LEFT JOIN users u ON s.created_by = u.id
    `;
    let params = [];
    if (req.user.role === 'ta') {
      query += ` JOIN course_ta_assignments cta ON c.id = cta.course_id WHERE cta.ta_user_id = $1`;
      params.push(req.user.id);
    } else {
      query += ` WHERE c.lecturer_id = $1`;
      params.push(req.user.id);
    }
    let paramIndex = params.length + 1;

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
router.put('/sessions/:id/toggle', requireLecturerOrTA, requireCourseAccess, async (req, res) => {
  const { is_active } = req.body;
  try {
    const result = await db.query(
      'UPDATE sessions SET is_active = $1 WHERE id = $2 RETURNING *',
      [is_active, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error toggling session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Activate checkout for session
router.post('/sessions/:id/activate-checkout', requireLecturerOrTA, requireCourseAccess, async (req, res) => {
  const { checkout_window_minutes, early_leaver_threshold_minutes } = req.body;
  try {
    const sessionRes = await db.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
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
       WHERE id = $7
       RETURNING *`,
      [qrToken, expiresAt, sessionCode, expiresAt, windowMins, thresholdMins, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error activating checkout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Attendance Operations (Live List / Manual Mark)
router.get('/sessions/:id/live-attendance', requireLecturerOrTA, requireCourseAccess, async (req, res) => {
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
       WHERE s.id = $1
       ORDER BY u.name ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching live attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual bulk mark or single edit
router.post('/sessions/:id/manual-mark', requireLecturerOrTA, requireCourseAccess, async (req, res) => {
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
router.post('/sessions/:id/bulk-csv-mark', requireLecturerOrTA, requireCourseAccess, async (req, res) => {
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
router.get('/courses/:id/report', requireRole('lecturer'), requireCourseAccess, async (req, res) => {
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
         COALESCE((SELECT total_sessions FROM courses WHERE id = $1), (SELECT COUNT(*) FROM sessions WHERE course_id = $1)) as total_sessions,
         (SELECT COUNT(CASE WHEN is_present = true THEN 1 END) FROM attendance_records WHERE student_id = u.id AND session_id IN (SELECT id FROM sessions WHERE course_id = $1)) as attended_sessions,
         (SELECT COUNT(CASE WHEN attendance_status = 'early_leaver' THEN 1 END) FROM attendance_records WHERE student_id = u.id AND session_id IN (SELECT id FROM sessions WHERE course_id = $1)) as early_leaver_sessions
       FROM course_enrollments ce
       JOIN users u ON ce.student_id = u.id
       LEFT JOIN sessions s ON s.course_id = ce.course_id
       LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = u.id
       WHERE ce.course_id = $1
       ORDER BY u.name ASC, s.date DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting course report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download personal QR codes for all enrolled students in a ZIP archive
router.get('/courses/:id/download-qrs-zip', requireRole('lecturer'), requireCourseAccess, async (req, res) => {
  try {
    const courseResult = await db.query("SELECT name, code FROM courses WHERE id = $1", [req.params.id]);
    if (courseResult.rows.length === 0) return res.status(404).json({ error: 'Course not found' });
    const course = courseResult.rows[0];

    const enrollResult = await db.query(
      `SELECT u.id, u.name, u.student_id 
       FROM course_enrollments ce
       JOIN users u ON ce.student_id = u.id
       WHERE ce.course_id = $1`,
      [req.params.id]
    );

    const students = enrollResult.rows;
    if (students.length === 0) {
      return res.status(400).json({ error: 'No students enrolled in this course.' });
    }

    const zip = new AdmZip();

    for (const student of students) {
      const qrBuffer = await QRCode.toBuffer(student.student_id, { width: 350, margin: 2 });
      const safeName = student.name.trim().replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${safeName}_${student.student_id}.png`;
      zip.addFile(filename, qrBuffer);
    }

    const zipBuffer = zip.toBuffer();
    const cleanCourseCode = course.code.trim().replace(/[^a-zA-Z0-9]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=qrcodes-${cleanCourseCode}.zip`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.end(zipBuffer, 'binary');
  } catch (error) {
    console.error('Error generating QR codes ZIP:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Student Management (Import, Edit)
router.get('/students', requireRole('lecturer'), async (req, res) => {
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

// CSV Roster Bulk Import & Enrollment
router.post('/courses/:id/bulk-enroll', requireRole('lecturer'), requireCourseAccess, async (req, res) => {
  const { students } = req.body;
  const courseId = req.params.id;

  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'List of students is required.' });
  }

  try {
    const enrolledList = [];
    const hash = await bcrypt.hash('TempPassword123', 10);

    for (const s of students) {
      const name = s.name || s.Name;
      const studentId = s.student_id || s['Student ID'] || s['Reference Number'] || s['Ref Number'];
      const indexNumber = s.index_number || s['Index Number'] || null;
      const level = s.level || s.Level;
      const email = s.email || s.Email;

      if (!name || !studentId || !level || !email) {
        continue;
      }

      // Check duplicate student_id or index_number registered under a different email
      const checkIdResult = await db.query(
        'SELECT email FROM users WHERE student_id = $1 OR (index_number IS NOT NULL AND index_number = $2)',
        [studentId, indexNumber]
      );
      if (checkIdResult.rows.length > 0 && checkIdResult.rows[0].email !== email) {
        return res.status(400).json({
          error: `Student ID ${studentId} or Index Number ${indexNumber} is already registered under email ${checkIdResult.rows[0].email}`
        });
      }

      // Find or create user
      let userId;
      const userResult = await db.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id;
        // Update student_id, index_number, and level if not set
        await db.query(
          'UPDATE users SET student_id = COALESCE(student_id, $1), index_number = COALESCE(index_number, $2), level = COALESCE(level, $3) WHERE id = $4',
          [studentId, indexNumber, level.toString(), userId]
        );
      } else {
        const insertUser = await db.query(
          `INSERT INTO users (name, email, password_hash, role, student_id, index_number, level)
           VALUES ($1, $2, $3, 'student', $4, $5, $6)
           RETURNING id`,
          [name, email, hash, studentId, indexNumber, level.toString()]
        );
        userId = insertUser.rows[0].id;
      }

      // Link to course enrollments
      await db.query(
        `INSERT INTO course_enrollments (student_id, course_id)
         VALUES ($1, $2)
         ON CONFLICT (student_id, course_id) DO NOTHING`,
        [userId, courseId]
      );

      enrolledList.push({ name, studentId, email, level });
    }

    res.json({ success: true, enrolled: enrolledList });
  } catch (error) {
    console.error('Error during bulk enrollment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual Attendance Override with Audit Logging
router.post('/sessions/:sessionId/override', requireLecturerOrTA, requireCourseAccess, async (req, res) => {
  const { sessionId } = req.params;
  const { student_id, is_present, attendance_status, reason } = req.body;
  const lecturerId = req.user.id;

  if (student_id === undefined || is_present === undefined || !reason) {
    return res.status(400).json({ error: 'Student ID, presence state, and reason are required.' });
  }

  try {
    // 1. Get student user db id
    const studentUserRes = await db.query('SELECT id FROM users WHERE id = $1', [student_id]);
    if (studentUserRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    // 2. Fetch existing attendance record
    const existingRes = await db.query(
      'SELECT * FROM attendance_records WHERE session_id = $1 AND student_id = $2',
      [sessionId, student_id]
    );

    const oldStatus = existingRes.rows.length > 0 
      ? (existingRes.rows[0].is_present ? existingRes.rows[0].attendance_status : 'absent')
      : 'absent';

    const newStatus = is_present ? (attendance_status || 'present') : 'absent';

    let recordId;
    if (existingRes.rows.length === 0) {
      const insertRes = await db.query(
        `INSERT INTO attendance_records (session_id, student_id, method, is_present, attendance_status)
         VALUES ($1, $2, 'manual', $3, $4)
         RETURNING id`,
        [sessionId, student_id, is_present, newStatus]
      );
      recordId = insertRes.rows[0].id;
    } else {
      recordId = existingRes.rows[0].id;
      await db.query(
        `UPDATE attendance_records
         SET is_present = $1, attendance_status = $2, method = 'manual', timestamp = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [is_present, newStatus, recordId]
      );
    }

    // 3. Log to audit trail
    await db.query(
      `INSERT INTO attendance_audit_logs (record_id, changed_by, old_value, new_value, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [recordId, lecturerId, oldStatus, newStatus, reason]
    );

    res.json({ success: true, message: 'Attendance overridden successfully.' });
  } catch (error) {
    console.error('Error overriding attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch Audit Logs for a Session
router.get('/sessions/:sessionId/audit-logs', requireLecturerOrTA, requireCourseAccess, async (req, res) => {
  const { sessionId } = req.params;
  try {
    const logs = await db.query(
      `SELECT 
         l.id, l.old_value, l.new_value, l.reason, l.timestamp,
         u_lecturer.name as changed_by_name,
         u_student.name as student_name,
         u_student.student_id as academic_student_id
       FROM attendance_audit_logs l
       JOIN attendance_records ar ON l.record_id = ar.id
       JOIN users u_lecturer ON l.changed_by = u_lecturer.id
       JOIN users u_student ON ar.student_id = u_student.id
       WHERE ar.session_id = $1
       ORDER BY l.timestamp DESC`,
      [sessionId]
    );
    res.json(logs.rows);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a new Academic Period
router.post('/academic-periods', requireRole('lecturer'), async (req, res) => {
  const { academic_year, semester, is_current } = req.body;
  if (!academic_year || !semester) {
    return res.status(400).json({ error: 'Academic year and semester are required.' });
  }

  try {
    if (is_current) {
      await db.query('UPDATE academic_periods SET is_current = false');
    }

    const result = await db.query(
      'INSERT INTO academic_periods (academic_year, semester, is_current) VALUES ($1, $2, $3) RETURNING id, academic_year, semester, is_current',
      [academic_year, parseInt(semester), !!is_current]
    );

    res.json({ success: true, academicPeriod: result.rows[0] });
  } catch (error) {
    console.error('Error adding academic period:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set an Academic Period as Current
router.put('/academic-periods/:id/set-current', requireRole('lecturer'), async (req, res) => {
  const { id } = req.params;

  try {
    await db.query('UPDATE academic_periods SET is_current = false');
    const result = await db.query(
      'UPDATE academic_periods SET is_current = true WHERE id = $1 RETURNING id, academic_year, semester, is_current',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Academic period not found.' });
    }

    res.json({ success: true, academicPeriod: result.rows[0] });
  } catch (error) {
    console.error('Error setting current academic period:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit an Academic Period
router.put('/academic-periods/:id', requireRole('lecturer'), async (req, res) => {
  const { id } = req.params;
  const { academic_year, semester } = req.body;

  if (!academic_year || !semester) {
    return res.status(400).json({ error: 'Academic year and semester are required.' });
  }

  try {
    const result = await db.query(
      'UPDATE academic_periods SET academic_year = $1, semester = $2 WHERE id = $3 RETURNING id, academic_year, semester, is_current',
      [academic_year, parseInt(semester), id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Academic period not found.' });
    }

    res.json({ success: true, academicPeriod: result.rows[0] });
  } catch (error) {
    console.error('Error editing academic period:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete an Academic Period
router.delete('/academic-periods/:id', requireRole('lecturer'), async (req, res) => {
  const { id } = req.params;

  try {
    const courseCheck = await db.query('SELECT id FROM courses WHERE academic_period_id = $1 LIMIT 1', [id]);
    if (courseCheck.rowCount > 0) {
      return res.status(400).json({ error: 'Cannot delete academic period. There are courses enrolled under this semester.' });
    }

    const result = await db.query('DELETE FROM academic_periods WHERE id = $1 RETURNING id, is_current', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Academic period not found.' });
    }

    const deletedPeriod = result.rows[0];
    if (deletedPeriod.is_current) {
      const fallback = await db.query('SELECT id FROM academic_periods ORDER BY academic_year DESC, semester DESC LIMIT 1');
      if (fallback.rowCount > 0) {
        await db.query('UPDATE academic_periods SET is_current = true WHERE id = $1', [fallback.rows[0].id]);
      }
    }

    res.json({ success: true, message: 'Academic period deleted successfully.' });
  } catch (error) {
    console.error('Error deleting academic period:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 7. Invite Code Management (Lecturer Only)
router.post('/invite-codes/generate', requireRole('lecturer'), async (req, res) => {
  const { intended_role, course_ids, expires_in_hours } = req.body;
  if (!intended_role || !['lecturer', 'ta'].includes(intended_role)) {
    return res.status(400).json({ error: 'Valid intended_role ("lecturer" or "ta") is required.' });
  }

  const code = crypto.randomBytes(4).toString('hex').toUpperCase();

  let dbCourseIds = '[]';
  if (intended_role === 'ta') {
    if (!course_ids || !Array.isArray(course_ids) || course_ids.length === 0) {
      return res.status(400).json({ error: 'At least one course assignment is required for TA invites.' });
    }

    try {
      const verifyRes = await db.query(
        'SELECT id FROM courses WHERE lecturer_id = $1 AND id = ANY($2)',
        [req.user.id, course_ids]
      );
      if (verifyRes.rows.length !== course_ids.length) {
        return res.status(403).json({ error: 'You can only assign courses that you own.' });
      }
      dbCourseIds = JSON.stringify(course_ids);
    } catch (err) {
      console.error('Error verifying courses:', err);
      return res.status(500).json({ error: 'Internal server error while verifying courses.' });
    }
  }

  const hours = expires_in_hours || 48;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  try {
    const result = await db.query(
      `INSERT INTO invite_codes (code, created_by, intended_role, course_ids, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [code, req.user.id, intended_role, dbCourseIds, expiresAt]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error generating invite code:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/invite-codes', requireRole('lecturer'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ic.*, u.name as used_by_name,
        (SELECT COUNT(*)::integer FROM course_ta_assignments 
         WHERE ta_user_id = ic.used_by 
         AND course_id IN (
           SELECT jsonb_array_elements_text(
             CASE 
               WHEN jsonb_typeof(ic.course_ids) = 'array' THEN ic.course_ids 
               ELSE '[]'::jsonb 
             END
           )::integer
         )
        ) as active_assignment_count
       FROM invite_codes ic
       LEFT JOIN users u ON ic.used_by = u.id
       WHERE ic.created_by = $1
       ORDER BY ic.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching invite codes:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/invite-codes/:id/revoke', requireRole('lecturer'), async (req, res) => {
  try {
    const inviteRes = await db.query(
      'SELECT * FROM invite_codes WHERE id = $1 AND created_by = $2',
      [req.params.id, req.user.id]
    );

    if (inviteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invite code not found or unauthorized.' });
    }

    const invite = inviteRes.rows[0];
    if (!invite.used || !invite.used_by) {
      return res.status(400).json({ error: 'This invite code has not been redeemed yet.' });
    }

    let courseIds = [];
    if (typeof invite.course_ids === 'string') {
      courseIds = JSON.parse(invite.course_ids);
    } else if (Array.isArray(invite.course_ids)) {
      courseIds = invite.course_ids;
    }

    if (courseIds.length > 0) {
      await db.query(
        'DELETE FROM course_ta_assignments WHERE ta_user_id = $1 AND course_id = ANY($2)',
        [invite.used_by, courseIds]
      );
    }

    res.json({ message: 'TA access revoked successfully.' });
  } catch (err) {
    console.error('Error revoking TA access:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/invite-codes/:id', requireRole('lecturer'), async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM invite_codes WHERE id = $1 AND created_by = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invite code not found or unauthorized.' });
    }
    res.json({ message: 'Invite code deleted successfully.' });
  } catch (err) {
    console.error('Error deleting invite code:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
