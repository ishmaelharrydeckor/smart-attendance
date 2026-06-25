const fs = require('fs');
const path = require('path');
const db = require('../db');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const LOG_FILE = path.join(BACKUP_DIR, 'backups.log');

// Ensure backups directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function logMessage(msg) {
  const logStr = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  fs.appendFileSync(LOG_FILE, logStr);
}

async function runBackup() {
  logMessage('Starting database backup...');
  try {
    const tables = [
      'academic_periods',
      'users',
      'courses',
      'course_enrollments',
      'sessions',
      'attendance_records',
      'attendance_audit_logs'
    ];

    const backupData = {};

    for (const table of tables) {
      logMessage(`Backing up table: ${table}`);
      const res = await db.query(`SELECT * FROM ${table}`);
      backupData[table] = res.rows;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));

    const stats = fs.statSync(filepath);
    logMessage(`Backup completed successfully. Saved to ${filename} (${(stats.size / 1024).toFixed(2)} KB)`);
  } catch (error) {
    logMessage(`Backup failed: ${error.message}`);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runBackup();
