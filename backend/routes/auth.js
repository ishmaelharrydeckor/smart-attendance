const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');


const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';

// Student Registration
router.post('/register', async (req, res) => {
  const { name, email, password, student_id, level, course_ids } = req.body;

  if (!name || !email || !password || !student_id || !level) {
    return res.status(400).json({ error: 'All student details are required.' });
  }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@(st\.)?knust\.edu\.gh$/i;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Only KNUST student emails (@st.knust.edu.gh or @knust.edu.gh) are allowed.' });
  }

  if (!course_ids || !Array.isArray(course_ids) || course_ids.length === 0) {
    return res.status(400).json({ error: 'You must select at least one course to register.' });
  }

  try {
    // Check if email or student ID exists
    const checkUser = await db.query(
      'SELECT id FROM users WHERE email = $1 OR student_id = $2',
      [email, student_id]
    );

    if (checkUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email or Student ID already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const newUser = await db.query(
      `INSERT INTO users (name, email, password_hash, role, student_id, level)
       VALUES ($1, $2, $3, 'student', $4, $5) RETURNING id, name, email, role, student_id, level`,
      [name, email, passwordHash, student_id, level]
    );

    const studentDbId = newUser.rows[0].id;

    // Enroll into courses if provided
    if (course_ids && Array.isArray(course_ids)) {
      for (const courseId of course_ids) {
        await db.query(
          'INSERT INTO course_enrollments (student_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [studentDbId, courseId]
        );
      }
    }

    // Generate Token
    const token = jwt.sign(
      { id: studentDbId, role: 'student', name, student_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Student registered successfully',
      token,
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login (Lecturers use Email, Students use Student ID or Email)
router.post('/login', async (req, res) => {
  const { login_id, password } = req.body; // login_id can be email or student_id

  if (!login_id || !password) {
    return res.status(400).json({ error: 'Login identifier and password are required.' });
  }

  try {
    // Try email first, then student_id
    const userResult = await db.query(
      'SELECT * FROM users WHERE email = $1 OR student_id = $2',
      [login_id, login_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = userResult.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Generate Token
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, student_id: user.student_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        student_id: user.student_id,
        level: user.level
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get list of all available courses for student registration selection (Public)
router.get('/courses', async (req, res) => {
  const { academic_period_id } = req.query;
  try {
    let result;
    if (academic_period_id) {
      result = await db.query(
        'SELECT id, name, code, academic_period_id FROM courses WHERE academic_period_id = $1 ORDER BY code ASC',
        [academic_period_id]
      );
    } else {
      result = await db.query('SELECT id, name, code, academic_period_id FROM courses ORDER BY code ASC');
    }
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching public courses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all academic periods (Public)
router.get('/academic-periods', async (req, res) => {
  try {
    const result = await db.query('SELECT id, academic_year, semester, is_current FROM academic_periods ORDER BY academic_year DESC, semester DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching academic periods:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Staff / TA Registration with Invite Code
router.post('/register/staff', async (req, res) => {
  const { name, email, password, invite_code } = req.body;

  if (!name || !email || !password || !invite_code) {
    return res.status(400).json({ error: 'All fields (name, email, password, invite_code) are required.' });
  }

  // Validate email format
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  try {
    // Check if email already registered
    const emailCheck = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email is already registered.' });
    }

    // Verify invite code
    const codeRes = await db.query(
      'SELECT * FROM invite_codes WHERE code = $1',
      [invite_code]
    );

    if (codeRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid invite code.' });
    }

    const invite = codeRes.rows[0];

    if (invite.used) {
      return res.status(400).json({ error: 'This invite code has already been used.' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This invite code has expired.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // Start Transaction
    await db.query('BEGIN');

    // Create user
    const userRes = await db.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, role`,
      [name, email, passwordHash, invite.intended_role]
    );

    const newUser = userRes.rows[0];

    // If intended_role is 'ta', read course_ids from the invite code and assign to course_ta_assignments
    if (invite.intended_role === 'ta') {
      let courseIds = [];
      if (typeof invite.course_ids === 'string') {
        courseIds = JSON.parse(invite.course_ids);
      } else if (Array.isArray(invite.course_ids)) {
        courseIds = invite.course_ids;
      }

      for (const courseId of courseIds) {
        await db.query(
          `INSERT INTO course_ta_assignments (ta_user_id, course_id, assigned_by)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [newUser.id, courseId, invite.created_by]
        );
      }
    }

    // Mark invite code as used
    await db.query(
      'UPDATE invite_codes SET used = true, used_by = $1 WHERE id = $2',
      [newUser.id, invite.id]
    );

    await db.query('COMMIT');

    // Generate token
    const token = jwt.sign(
      { id: newUser.id, role: newUser.role, name: newUser.name, student_id: null },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Staff registered successfully',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        student_id: null,
        level: null
      }
    });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Staff registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change Password
router.post('/change-password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  try {
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = userRes.rows[0];

    const validPassword = await bcrypt.compare(current_password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    const salt = await bcrypt.genSalt(12);
    const newPasswordHash = await bcrypt.hash(new_password, salt);

    await db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, req.user.id]
    );

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
