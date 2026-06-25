# Smart Attendance Management System

A production-ready, highly secure web application designed for university lecturers to manage and log student attendance dynamically. The application supports up to 600+ students across Levels 100 to 400 with automatic anti-fraud mitigations.

---

## 🚀 Key Features

### 1. Verification Methods
- **Dynamic QR Code Check-in**: A projector-friendly QR code that rotates every N minutes to prevent code sharing. Includes option for GPS proximity boundary matching.
- **Student self-checkin code**: Numeric code check-in (e.g. `ATT-1001`) for students with broken cameras.
- **Bulk CSV Upload**: Bulk-mark attendance using clean list of student academic IDs.
- **Manual Live Toggles**: Real-time update grid for lecture sessions.

### 2. Analytics & Reporting
- Detailed dashboard statistics tracking present/absent today and historical trend tracking.
- Minimum attendance percentage rule settings with flagged rosters.
- Clean CSV spreadsheet export matching course codes.

---

## 🛠️ Tech Stack & Setup

- **Frontend**: React.js, Vite, Tailwind CSS, Lucide Icons, html5-qrcode
- **Backend**: Node.js, Express.js, JWT Auth, Bcryptjs, pg (Postgres client)
- **Database**: PostgreSQL

---

## 📦 Local Installation Guide

### Option A: Run Database via Docker Compose (Recommended)
1. Ensure Docker is running.
2. Spin up PostgreSQL by running:
   ```bash
   docker-compose up -d
   ```

### Option B: Native Setup
1. Create a local PostgreSQL database named `attendance_management`.
2. Configure your environment file.

### ⚙️ Environment Configuration
1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Update the credentials in `.env` to match your local setup.

---

## 🏃 Run Services

### 1. Initialize & Seed Database
In the `/backend` directory:
```bash
cd backend
npm install
npm run seed
```
This runs the migrations inside `schema.sql` and generates:
- 1 Lecturer account (`lecturer@university.edu` with password `password123`)
- 50 Students accounts (`student1@university.edu` to `student50@university.edu` with password `password123`)
- 3 courses (e.g. `CS-101`)
- 10 class sessions containing 70%-90% presence history.

### 2. Start Backend Server
```bash
npm run dev
```
The API server will listen on port `5000`.

### 3. Start Frontend Client
In the `/frontend` directory:
```bash
cd ../frontend
npm install
npm run dev
```
The React development bundle will load on `http://localhost:3000`.

---

## 🔒 Security & Anti-Fraud Config
- **CORS**: Strict CORS parameters configured.
- **JWT Protection**: Secure API middleware checks JWT payload claims before allowing operations.
- **Geo-Fencing**: Enable `GPS_VERIFICATION_ENABLED=true` inside `.env` to enforce student GPS matching within radius (default `200m`) of the campus center.
- **QR Rotation**: Custom duration set inside Lecturer Console Settings automatically invalidates older scanned sessions.
