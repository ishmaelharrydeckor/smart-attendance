const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';

// Student Registration
router.post('/register', async (req, res) => {
  const { name, email, password, student_id, level, course_ids } = req.body;

  if (!name || !email || !password || !student_id || !level) {
    return res.status(400).json({ error: 'All student details are required.' });
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

module.exports = router;
