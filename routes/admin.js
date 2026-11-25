const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const [rows] = await pool.query('SELECT * FROM admins WHERE email = ?', [email]);
  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

  const admin = rows[0];
  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  req.session.adminId = admin.id;
  await pool.query('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);
  res.json({ ok: true, admin: { id: admin.id, email: admin.email, full_name: admin.full_name } });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAdmin, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, email, full_name FROM admins WHERE id = ?', [req.session.adminId]
  );
  res.json(rows[0] || null);
});

// ---- Menu management ----
router.post('/menu-items', requireAdmin, async (req, res) => {
  const { category_id, name, description, price, image_url, dietary_tags, prep_minutes, is_available } = req.body;
  try {
    const [r] = await pool.query(
      `INSERT INTO menu_items
        (category_id, name, description, price, image_url, dietary_tags, prep_minutes, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [category_id, name, description || null, price, image_url || null,
       Array.isArray(dietary_tags) ? dietary_tags.join(',') : (dietary_tags || null),
       prep_minutes || 15, is_available !== false]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Could not create item' });
  }
});

router.put('/menu-items/:id', requireAdmin, async (req, res) => {
  const { name, description, price, image_url, dietary_tags, prep_minutes, is_available, category_id } = req.body;
  try {
    await pool.query(
      `UPDATE menu_items SET
        category_id = COALESCE(?, category_id),
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        price = COALESCE(?, price),
        image_url = COALESCE(?, image_url),
        dietary_tags = COALESCE(?, dietary_tags),
        prep_minutes = COALESCE(?, prep_minutes),
        is_available = COALESCE(?, is_available)
       WHERE id = ?`,
      [category_id, name, description, price, image_url,
       Array.isArray(dietary_tags) ? dietary_tags.join(',') : dietary_tags,
       prep_minutes, is_available, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Update failed' });
  }
});

router.delete('/menu-items/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM menu_items WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Cannot delete item (may be referenced by orders)' });
  }
});

// ---- Opening hours ----
router.put('/hours', requireAdmin, async (req, res) => {
  const hours = req.body.hours || [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const h of hours) {
      await conn.query(
        `INSERT INTO opening_hours (day_of_week, open_time, close_time, is_closed)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE open_time = VALUES(open_time), close_time = VALUES(close_time), is_closed = VALUES(is_closed)`,
        [h.day_of_week, h.open_time, h.close_time, h.is_closed ? 1 : 0]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: 'Hours update failed' });
  } finally { conn.release(); }
});

// ---- Reservations ----
router.get('/reservations', requireAdmin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM reservations ORDER BY reservation_date DESC, reservation_time DESC LIMIT 200`
  );
  res.json(rows);
});

router.patch('/reservations/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending','confirmed','cancelled','seated','completed'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await pool.query('UPDATE reservations SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ ok: true });
});

// ---- Orders ----
router.get('/orders', requireAdmin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM orders ORDER BY created_at DESC LIMIT 200`
  );
  for (const o of rows) {
    const [items] = await pool.query(
      'SELECT item_name, quantity, unit_price FROM order_items WHERE order_id = ?', [o.id]
    );
    o.items = items;
  }
  res.json(rows);
});

router.patch('/orders/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending','preparing','ready','out_for_delivery','completed','cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;