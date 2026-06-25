const { pool } = require('./db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Altering users table role constraint...');
    // Drop old constraint if it exists (usually users_role_check)
    await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
    
    // Add new constraint allowing 'ta' role
    await client.query(`
      ALTER TABLE users 
      ADD CONSTRAINT users_role_check 
      CHECK (role IN ('lecturer', 'student', 'ta'))
    `);

    console.log('Creating invite_codes table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invite_codes (
          id SERIAL PRIMARY KEY,
          code VARCHAR(50) UNIQUE NOT NULL,
          created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          intended_role VARCHAR(20) NOT NULL CHECK (intended_role IN ('lecturer', 'ta')),
          course_ids JSONB DEFAULT '[]'::jsonb,
          used BOOLEAN NOT NULL DEFAULT FALSE,
          used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `);

    console.log('Creating course_ta_assignments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS course_ta_assignments (
          id SERIAL PRIMARY KEY,
          ta_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          assigned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT unique_ta_course UNIQUE (ta_user_id, course_id)
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
