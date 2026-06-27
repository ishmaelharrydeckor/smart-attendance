const { pool } = require('./db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Altering courses table to add total_sessions column...');
    await client.query(`
      ALTER TABLE courses 
      ADD COLUMN IF NOT EXISTS total_sessions INTEGER DEFAULT NULL
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
