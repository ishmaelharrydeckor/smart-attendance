const db = require('./db');

const migrate = async () => {
  console.log('Starting Check-out Database Migration...');
  try {
    // 1. Alter attendance_records table
    await db.query(`
      ALTER TABLE attendance_records 
      ADD COLUMN IF NOT EXISTS checkout_timestamp TIMESTAMP WITH TIME ZONE;
    `);
    
    await db.query(`
      ALTER TABLE attendance_records 
      ADD COLUMN IF NOT EXISTS checkout_method VARCHAR(20) CHECK (checkout_method IN ('qr', 'code', 'manual'));
    `);

    await db.query(`
      ALTER TABLE attendance_records 
      ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
    `);

    const resCol = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='attendance_records' AND column_name='attendance_status';
    `);
    if (resCol.rows.length === 0) {
      await db.query(`
        ALTER TABLE attendance_records 
        ADD COLUMN attendance_status VARCHAR(30) DEFAULT 'present' NOT NULL 
        CHECK (attendance_status IN ('present', 'late_checkout', 'early_leaver', 'absent'));
      `);
    }

    // 2. Alter sessions table
    await db.query(`
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS checkout_qr_token TEXT;
    `);

    await db.query(`
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS checkout_qr_expires_at TIMESTAMP WITH TIME ZONE;
    `);

    await db.query(`
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS checkout_session_code VARCHAR(20);
    `);

    await db.query(`
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS checkout_code_expires_at TIMESTAMP WITH TIME ZONE;
    `);

    await db.query(`
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS checkout_window_minutes INTEGER DEFAULT 10;
    `);

    await db.query(`
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS early_leaver_threshold_minutes INTEGER DEFAULT 15;
    `);

    // 3. Initialize existing records
    await db.query(`
      UPDATE attendance_records 
      SET attendance_status = 'present' 
      WHERE attendance_status IS NULL;
    `);

    console.log('Database migration successfully completed.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrate();
