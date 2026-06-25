const { pool } = require('./db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Altering sessions table...');
    await client.query(`
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS late_grace_period_minutes INTEGER DEFAULT 10
    `);

    console.log('Altering attendance_records check constraints...');
    // Drop old constraints
    await client.query('ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_method_check');
    await client.query('ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_checkout_method_check');
    await client.query('ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_attendance_status_check');

    // Add new constraints
    await client.query(`
      ALTER TABLE attendance_records 
      ADD CONSTRAINT attendance_records_method_check 
      CHECK (method IN ('qr', 'manual', 'code', 'manual_id_code'))
    `);

    await client.query(`
      ALTER TABLE attendance_records 
      ADD CONSTRAINT attendance_records_checkout_method_check 
      CHECK (checkout_method IN ('qr', 'code', 'manual', 'manual_id_code'))
    `);

    await client.query(`
      ALTER TABLE attendance_records 
      ADD CONSTRAINT attendance_records_attendance_status_check 
      CHECK (attendance_status IN ('present', 'late', 'late_checkout', 'early_leaver', 'absent'))
    `);

    console.log('Creating attendance_audit_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_audit_logs (
          id SERIAL PRIMARY KEY,
          record_id INTEGER NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
          changed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          old_value VARCHAR(50),
          new_value VARCHAR(50),
          reason TEXT,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

migrate().then(() => process.exit(0));
