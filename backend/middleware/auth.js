const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';

const db = require('../db');

// Verify token and append user payload to req
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

// Role-based authorization middleware creators
const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `Access forbidden. Requires ${role} role.` });
    }
    next();
  };
};

const requireLecturerOrTA = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Access denied. User not authenticated.' });
  }

  if (req.user.role !== 'lecturer' && req.user.role !== 'ta') {
    return res.status(403).json({ error: 'Access forbidden. Requires lecturer or TA role.' });
  }

  if (req.user.role === 'ta') {
    try {
      const result = await db.query(
        'SELECT course_id FROM course_ta_assignments WHERE ta_user_id = $1',
        [req.user.id]
      );
      req.assignedCourseIds = result.rows.map(row => row.course_id);
    } catch (error) {
      console.error('Error fetching TA course assignments:', error);
      return res.status(500).json({ error: 'Internal server error while verifying access permissions.' });
    }
  }

  next();
};

const requireCourseAccess = async (req, res, next) => {
  let courseIdStr = req.params.course_id || req.params.courseId || req.query.course_id || req.query.courseId || (req.body && (req.body.course_id || req.body.courseId));
  let courseId = courseIdStr ? parseInt(courseIdStr) : null;

  if (!courseId) {
    const sessionIdStr = req.params.sessionId || req.params.session_id || req.params.id || req.query.session_id || req.query.sessionId || (req.body && (req.body.session_id || req.body.sessionId));
    if (sessionIdStr) {
      try {
        const sessionRes = await db.query('SELECT course_id FROM sessions WHERE id = $1', [parseInt(sessionIdStr)]);
        if (sessionRes.rows.length > 0) {
          courseId = sessionRes.rows[0].course_id;
        }
      } catch (err) {
        console.error('Error resolving session course_id:', err);
      }
    }
  }

  if (!courseId && req.params.id && req.originalUrl.includes('/sessions/')) {
    try {
      const sessionRes = await db.query('SELECT course_id FROM sessions WHERE id = $1', [parseInt(req.params.id)]);
      if (sessionRes.rows.length > 0) {
        courseId = sessionRes.rows[0].course_id;
      }
    } catch (err) {
      console.error('Error resolving session ID:', err);
    }
  }

  if (!courseId) {
    return next();
  }

  if (req.user.role === 'lecturer') {
    try {
      const result = await db.query('SELECT lecturer_id FROM courses WHERE id = $1', [courseId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Course not found.' });
      }
      if (result.rows[0].lecturer_id !== req.user.id) {
        return res.status(403).json({ error: 'Access forbidden. You do not own this course.' });
      }
      next();
    } catch (error) {
      console.error('Error verifying course ownership:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.user.role === 'ta') {
    if (!req.assignedCourseIds || !req.assignedCourseIds.includes(courseId)) {
      return res.status(403).json({ error: 'Access forbidden. You are not assigned to this course.' });
    }
    next();
  } else {
    res.status(403).json({ error: 'Access forbidden.' });
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  requireLecturerOrTA,
  requireCourseAccess
};
