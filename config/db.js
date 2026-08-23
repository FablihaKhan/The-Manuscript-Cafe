// Single shared PostgreSQL pool. Credentials come from .env (never hardcode).
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'Maindb',
  password: process.env.PGPASSWORD || '1234',
  port: parseInt(process.env.PGPORT || '5432', 10),
  max: parseInt(process.env.PGPOOL_MAX || '10', 10),
});

pool.on('error', (err) => console.error('Unexpected PG pool error:', err.message));

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
