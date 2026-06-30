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
  const path = require('path');
  const fs = require('fs');

  const serveLocalFallback = () => {
    const localApkPath = path.join(__dirname, '../smartroll-preview.apk');
    if (fs.existsSync(localApkPath)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="smartroll.apk"');
      return fs.createReadStream(localApkPath).pipe(res);
    }
    return res.status(503).json({ error: 'APK temporarily unavailable. Please try again later.' });
  };

  try {
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const r2AccountId = process.env.R2_ACCOUNT_ID ? process.env.R2_ACCOUNT_ID.trim() : '';
    const r2AccessKey = process.env.R2_ACCESS_KEY_ID ? process.env.R2_ACCESS_KEY_ID.trim() : '';
    const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY ? process.env.R2_SECRET_ACCESS_KEY.trim() : '';
    const r2Bucket = process.env.R2_BUCKET_NAME ? process.env.R2_BUCKET_NAME.trim() : '';

    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket) {
      console.log('R2 env vars not configured, serving local backup APK...');
      return serveLocalFallback();
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
    res.setHeader('Content-Disposition', 'attachment; filename="smartroll.apk"');
    
    s3Response.Body.on('error', (streamErr) => {
      console.error('R2 stream error mid-transfer:', streamErr);
      res.destroy();
    });

    s3Response.Body.pipe(res);
  } catch (error) {
    console.error('R2 unavailable, falling back to local copy:', error.message);
    return res.status(503).json({
      error: 'APK temporarily unavailable. Please try again later.',
      debug_message: error.message,
      debug_stack: error.stack
    });
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
