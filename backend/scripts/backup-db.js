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

    // Cloudflare R2 upload
    const date = new Date().toISOString().split('T')[0];
    try {
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      const r2AccountId = process.env.R2_ACCOUNT_ID;
      const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
      const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;
      const r2Bucket = process.env.R2_BUCKET_NAME;

      if (r2AccountId && r2AccessKey && r2SecretKey && r2Bucket) {
        const s3Client = new S3Client({
          endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: r2AccessKey,
            secretAccessKey: r2SecretKey,
          },
          region: 'auto',
        });

        await s3Client.send(
          new PutObjectCommand({
            Bucket: r2Bucket,
            Key: `backups/smartroll-${date}.json`,
            Body: fs.readFileSync(filepath),
            ContentType: 'application/json',
          })
        );
        console.log(`Backup uploaded to R2: backups/smartroll-${date}.json`);
      }
    } catch (r2Error) {
      console.error(r2Error);
    }
  } catch (error) {
    logMessage(`Backup failed: ${error.message}`);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runBackup();
