-- Database Schema for Smart Attendance Management System

-- Drop tables if they exist (for easy resetting/seeding)
DROP TABLE IF EXISTS attendance_records CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS course_enrollments CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS academic_periods CASCADE;

-- 1. Academic Periods Table
CREATE TABLE academic_periods (
    id SERIAL PRIMARY KEY,
    academic_year VARCHAR(20) NOT NULL,
    semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
    is_current BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX only_one_current_semester ON academic_periods (is_current) WHERE is_current = true;

-- 2. Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('lecturer', 'student')),
    student_id VARCHAR(50) UNIQUE, -- NULL for lecturers
    level VARCHAR(10) CHECK (level IN ('100', '200', '300', '400')), -- NULL for lecturers
    profile_photo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Courses Table
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    lecturer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    academic_period_id INTEGER REFERENCES academic_periods(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Course Enrollments Table (Many-to-Many between Students and Courses)
CREATE TABLE course_enrollments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE(student_id, course_id)
);

-- 4. Sessions Table
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    qr_token TEXT NOT NULL,
    session_code VARCHAR(10) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    qr_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    qr_rotation_interval_mins INTEGER DEFAULT 1,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    location_name VARCHAR(100),
    gps_lat DOUBLE PRECISION,
    gps_lng DOUBLE PRECISION,
    allowed_radius_meters INTEGER DEFAULT 200,
    academic_period_id INTEGER REFERENCES academic_periods(id) ON DELETE SET NULL,
    checkout_qr_token TEXT,
    checkout_qr_expires_at TIMESTAMP WITH TIME ZONE,
    checkout_session_code VARCHAR(20),
    checkout_code_expires_at TIMESTAMP WITH TIME ZONE,
    checkout_window_minutes INTEGER DEFAULT 10,
    early_leaver_threshold_minutes INTEGER DEFAULT 15,
    checkout_active BOOLEAN DEFAULT FALSE
);

-- 5. Attendance Records Table
CREATE TABLE attendance_records (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL CHECK (method IN ('qr', 'manual', 'code')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    gps_lat DOUBLE PRECISION,
    gps_lng DOUBLE PRECISION,
    ip_address VARCHAR(45),
    is_present BOOLEAN DEFAULT TRUE,
    checkout_timestamp TIMESTAMP WITH TIME ZONE,
    checkout_method VARCHAR(20) CHECK (checkout_method IN ('qr', 'code', 'manual')),
    duration_minutes INTEGER,
    attendance_status VARCHAR(30) DEFAULT 'present' NOT NULL CHECK (attendance_status IN ('present', 'late_checkout', 'early_leaver', 'absent')),
    UNIQUE(session_id, student_id)
);

-- Create Indexes for optimization
CREATE INDEX idx_users_student_id ON users(student_id);
CREATE INDEX idx_course_enrollments_student ON course_enrollments(student_id);
CREATE INDEX idx_course_enrollments_course ON course_enrollments(course_id);
CREATE INDEX idx_sessions_course ON sessions(course_id);
CREATE INDEX idx_sessions_active ON sessions(is_active);
CREATE INDEX idx_attendance_session ON attendance_records(session_id);
CREATE INDEX idx_attendance_student ON attendance_records(student_id);
