// server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const path = require('path');
const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('--- ENV CHECK ---');
console.log('DB_HOST     :', process.env.DB_HOST);
console.log('DB_PORT     :', process.env.DB_PORT);
console.log('DB_USER     :', process.env.DB_USER);
console.log('DB_PASSWORD :', process.env.DB_PASSWORD ? '(set)' : '(EMPTY / MISSING)');
console.log('DB_NAME     :', process.env.DB_NAME);
console.log('NODE_ENV    :', process.env.NODE_ENV);
console.log('PORT        :', PORT);
console.log('-----------------');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
}));

try {
  app.use('/api', require('./routes/public'));
  app.use('/api/reservations', require('./routes/reservations'));
  app.use('/api/orders', require('./routes/orders'));
  app.use('/api/track', require('./routes/order_tracking'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/staff', require('./routes/staff'));
  console.log('✅ All route modules loaded');
} catch (err) {
  console.error('❌ Failed to load routes:', err.message);
  process.exit(1);
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) {
      console.error('❌ Could not send index.html:', err.message);
      res.status(500).send('Frontend not found');
    }
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Unhandled route error:', err);
  res.status(500).json({ error: 'Server error' });
});

async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const [rows] = await pool.query('SELECT id FROM admins WHERE email = ?', [email]);
  if (!rows.length) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      'INSERT INTO admins (email, password_hash, full_name) VALUES (?, ?, ?)',
      [email, hash, 'Administrator']
    );
    console.log(`   → ✅ Admin created: ${email}`);
  } else {
    console.log('   → ✅ Admin already exists');
  }
}

async function bootstrapStaff() {
  const defaultPass = process.env.STAFF_DEFAULT_PASSWORD || 'StaffPass123!';
  const hash = await bcrypt.hash(defaultPass, 12);
  try {
    const [placeholder] = await pool.query(
      "SELECT id, email FROM staff WHERE password_hash = '$2b$10$PLACEHOLDER_HASH_WILL_BE_REPLACED'"
    );
    for (const s of placeholder) {
      await pool.query('UPDATE staff SET password_hash = ? WHERE id = ?', [hash, s.id]);
      console.log(`   → ✅ Staff password set for ${s.email}`);
    }
    if (placeholder.length) {
      console.log(`   → ℹ️  All staff default password = ${defaultPass}`);
    } else {
      console.log('   → ✅ All staff already have passwords');
    }
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      console.log('   → ⚠️  staff table missing — run db/migration_staff_kenya.sql');
    } else {
      console.log('   → ⚠️  Staff bootstrap skipped:', e.message);
    }
  }
}

async function testDatabase() {
  console.log('🔍 Testing MySQL connection...');
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT DATABASE() AS db, VERSION() AS version');
    console.log(`   → ✅ Connected to MySQL ${rows[0].version}`);
    console.log(`   → ✅ Using database: ${rows[0].db}`);
  } finally {
    conn.release();
  }
}

console.log('🚀 Starting server...');
(async () => {
  try {
    await testDatabase();
    await bootstrapAdmin();
    await bootstrapStaff();
  } catch (err) {
    console.error('❌ Startup failed:', err.message);
    console.error('   Full error:', err);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 Luxury Restaurant running on http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Run: taskkill /F /IM node.exe`);
    } else {
      console.error('❌ Server listen error:', err);
    }
    process.exit(1);
  });

  const shutdown = () => {
    console.log('\n🛑 Shutting down...');
    server.close(async () => {
      await pool.end();
      console.log('👋 Bye');
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();

process.on('unhandledRejection', (reason) => console.error('❌ Unhandled promise rejection:', reason));
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
  process.exit(1);
});