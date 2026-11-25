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

// ---------- VERBOSE ENV CHECK ----------
console.log('--- ENV CHECK ---');
console.log('DB_HOST     :', process.env.DB_HOST);
console.log('DB_PORT     :', process.env.DB_PORT);
console.log('DB_USER     :', process.env.DB_USER);
console.log('DB_PASSWORD :', process.env.DB_PASSWORD ? '(set)' : '(EMPTY / MISSING)');
console.log('DB_NAME     :', process.env.DB_NAME);
console.log('NODE_ENV    :', process.env.NODE_ENV);
console.log('PORT        :', PORT);
console.log('-----------------');

// ---------- MIDDLEWARE ----------
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

// ---------- ROUTES ----------
try {
  app.use('/api', require('./routes/public'));
  app.use('/api/reservations', require('./routes/reservations'));
  app.use('/api/orders', require('./routes/orders'));
  app.use('/api/admin', require('./routes/admin'));
  console.log('✅ All route modules loaded');
} catch (err) {
  console.error('❌ Failed to load routes:', err.message);
  process.exit(1);
}

// ---------- STATIC + SPA FALLBACK ----------
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) {
      console.error('❌ Could not send index.html:', err.message);
      res.status(500).send('Frontend not found — is public/index.html present?');
    }
  });
});

// ---------- ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error('❌ Unhandled route error:', err);
  res.status(500).json({ error: 'Server error' });
});

// ---------- ADMIN BOOTSTRAP ----------
async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('ℹ️  ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin bootstrap');
    return;
  }

  console.log(`🔍 Checking admin account: ${email}`);
  const [rows] = await pool.query('SELECT id FROM admins WHERE email = ?', [email]);

  if (!rows.length) {
    console.log('   → Admin not found, creating...');
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

// ---------- DATABASE CONNECTIVITY TEST ----------
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

// ---------- STARTUP ----------
console.log('🚀 Starting server...');

(async () => {
  try {
    await testDatabase();
    await bootstrapAdmin();
  } catch (err) {
    console.error('❌ Startup failed:', err.message);
    console.error('   Full error:', err);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   → Check DB_USER and DB_PASSWORD in .env');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('   → Database does not exist. Run: mysql -u root -p < db/schema.sql');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('   → MySQL is not running. Start XAMPP MySQL or "net start MySQL80"');
    }
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 Luxury Restaurant running on http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use.`);
      console.error(`   → Run: netstat -ano | findstr :${PORT}`);
      console.error(`   → Then: taskkill /F /PID <pid>`);
    } else {
      console.error('❌ Server listen error:', err);
    }
    process.exit(1);
  });

  // Graceful shutdown
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

// ---------- CATCH UNHANDLED PROMISE REJECTIONS ----------
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
  process.exit(1);
});