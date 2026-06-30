const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function uploadApk() {
  try {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const r2AccountId = process.env.R2_ACCOUNT_ID ? process.env.R2_ACCOUNT_ID.trim() : '';
    const r2AccessKey = process.env.R2_ACCESS_KEY_ID ? process.env.R2_ACCESS_KEY_ID.trim() : '';
    const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY ? process.env.R2_SECRET_ACCESS_KEY.trim() : '';
    const r2Bucket = process.env.R2_BUCKET_NAME ? process.env.R2_BUCKET_NAME.trim() : '';

    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket) {
      console.error("Missing R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME). Cannot upload APK.");
      process.exit(1);
    }

    const s3Client = new S3Client({
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
      region: 'auto',
    });

    const apkPath = path.join(__dirname, '../../smartroll-preview.apk');
    if (!fs.existsSync(apkPath)) {
      console.error("APK file not found at:", apkPath);
      process.exit(1);
    }

    console.log("Uploading APK to Cloudflare R2...");
    await s3Client.send(
      new PutObjectCommand({
        Bucket: r2Bucket,
        Key: 'smartroll-preview.apk',
        Body: fs.readFileSync(apkPath),
        ContentType: 'application/vnd.android.package-archive',
      })
    );

    console.log("APK uploaded successfully to R2 bucket as 'smartroll-preview.apk'.");
    process.exit(0);
  } catch (err) {
    console.error("Error uploading APK to R2:", err);
    process.exit(1);
  }
}

uploadApk();
