const bcrypt = require('bcryptjs');
const db = require('./db');
const fs = require('fs');
const path = require('path');

const seed = async () => {
  console.log('Starting Database Seed...');

  try {
    // 1. Read and execute schema.sql first
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await db.query(schemaSql);
    console.log('Database schema successfully reset.');

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash('password123', salt);

    // 2. Insert Lecturer
    const lecturerResult = await db.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Dr. Sarah Jenkins', 'lecturer@university.edu', $1, 'lecturer')
       RETURNING id`,
      [passwordHash]
    );
    const lecturerId = lecturerResult.rows[0].id;
    console.log('Lecturer user created.');

    // 3. Insert Courses
    const courses = [
      { name: 'Introduction to Computer Science', code: 'CS-101' },
      { name: 'Data Structures and Algorithms', code: 'CS-201' },
      { name: 'Software Engineering Principles', code: 'CS-301' }
    ];

    const courseIds = [];
    for (const c of courses) {
      const res = await db.query(
        'INSERT INTO courses (name, code, lecturer_id) VALUES ($1, $2, $3) RETURNING id',
        [c.name, c.code, lecturerId]
      );
      courseIds.push(res.rows[0].id);
    }
    console.log('Courses created.');

    // 4. Create 50 students across levels 100-400
    const studentDbIds = [];
    const levels = ['100', '200', '300', '400'];

    for (let i = 1; i <= 50; i++) {
      const padId = String(i).padStart(3, '0');
      const studentId = `STU${padId}`;
      const name = `Student ${i}`;
      const email = `student${i}@university.edu`;
      const level = levels[i % 4];

      const studentRes = await db.query(
        `INSERT INTO users (name, email, password_hash, role, student_id, level)
         VALUES ($1, $2, $3, 'student', $4, $5)
         RETURNING id`,
        [name, email, passwordHash, studentId, level]
      );
      const studentDbId = studentRes.rows[0].id;
      studentDbIds.push(studentDbId);

      // Enroll student into 2 random courses
      const firstCourseIndex = i % 3;
      const secondCourseIndex = (i + 1) % 3;

      await db.query(
        'INSERT INTO course_enrollments (student_id, course_id) VALUES ($1, $2)',
        [studentDbId, courseIds[firstCourseIndex]]
      );
      await db.query(
        'INSERT INTO course_enrollments (student_id, course_id) VALUES ($1, $2)',
        [studentDbId, courseIds[secondCourseIndex]]
      );
    }
    console.log('50 students registered and enrolled in courses.');

    // 5. Create 10 sessions (8 past, 2 today/active)
    const sessions = [];
    const today = new Date();

    for (let j = 1; j <= 10; j++) {
      const courseId = courseIds[j % 3];
      const isToday = j >= 9;
      const sessionDate = new Date();
      if (!isToday) {
        sessionDate.setDate(today.getDate() - (10 - j));
      }

      const start = new Date(sessionDate);
      start.setHours(9, 0, 0, 0);
      const end = new Date(sessionDate);
      end.setHours(11, 0, 0, 0);

      const qrToken = `qr-token-session-${j}`;
      const sessionCode = `ATT-${1000 + j}`;

      const sessionRes = await db.query(
        `INSERT INTO sessions (course_id, date, start_time, end_time, qr_token, session_code, is_active, qr_expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, course_id`,
        [
          courseId,
          sessionDate.toISOString().split('T')[0],
          start,
          end,
          qrToken,
          sessionCode,
          isToday,
          end, // QR expires when session ends
          lecturerId
        ]
      );
      sessions.push(sessionRes.rows[0]);
    }
    console.log('10 sessions created.');

    // 6. Create Attendance records (random check-ins with 70%-90% presence)
    let recordsCount = 0;
    for (const session of sessions) {
      // Find students enrolled in this course
      const enrolledResult = await db.query(
        'SELECT student_id FROM course_enrollments WHERE course_id = $1',
        [session.course_id]
      );

      for (const row of enrolledResult.rows) {
        // Attendance probability: 80% present
        const isPresent = Math.random() < 0.8;
        const method = ['qr', 'code', 'manual'][Math.floor(Math.random() * 3)];
        
        await db.query(
          `INSERT INTO attendance_records (session_id, student_id, method, gps_lat, gps_lng, is_present)
           VALUES ($1, $2, $3, 5.6037, -0.1870, $4)`,
          [session.id, row.student_id, method, isPresent]
        );
        recordsCount++;
      }
    }
    console.log(`Seeded ${recordsCount} attendance records.`);
    console.log('Database Seeding Completed Successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seed();
