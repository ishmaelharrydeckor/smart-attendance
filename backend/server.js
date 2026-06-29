const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const db = require('./db');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: '*', // Adjust to specific frontend domain in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Increased limit to allow live dashboard polling
  message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api', globalLimiter);

// Import Routes
const authRoutes = require('./routes/auth');
const lecturerRoutes = require('./routes/lecturer');
const studentRoutes = require('./routes/student');
const sessionRoutes = require('./routes/session');

// Bind API Routes
app.use('/api/auth', authRoutes);
app.use('/api/lecturer', lecturerRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/sessions', sessionRoutes);

// Public endpoint to download the latest APK directly from Cloudflare R2
app.get('/api/download-apk', async (req, res) => {
  try {
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const r2AccountId = process.env.R2_ACCOUNT_ID;
    const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
    const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;
    const r2Bucket = process.env.R2_BUCKET_NAME;

    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket) {
      // Fallback: if R2 is not configured, try to serve local file if it exists
      const path = require('path');
      const fs = require('fs');
      const localApkPath = path.join(__dirname, 'smartroll-preview.apk');
      if (fs.existsSync(localApkPath)) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment; filename="smartroll-preview.apk"');
        return fs.createReadStream(localApkPath).pipe(res);
      }
      return res.status(500).json({ error: 'R2 storage not configured and local backup file missing.' });
    }

    const s3Client = new S3Client({
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
      region: 'auto',
    });

    const getObjectParams = {
      Bucket: r2Bucket,
      Key: 'smartroll-preview.apk',
    };

    const s3Response = await s3Client.send(new GetObjectCommand(getObjectParams));

    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="smartroll-preview.apk"');
    
    // s3Response.Body is a readable stream in Node.js S3 Client
    s3Response.Body.pipe(res);
  } catch (error) {
    console.error('Error fetching APK from R2:', error);
    res.status(500).json({ error: 'Failed to retrieve the APK package.' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const { autoCloseSessions } = require('./scripts/session-cleanup');

// Run server
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  
  // Run session end auto-close check every minute
  setInterval(autoCloseSessions, 60 * 1000);
  autoCloseSessions();
});
