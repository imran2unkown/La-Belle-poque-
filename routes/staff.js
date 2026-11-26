const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const router = express.Router();

function requireStaff(roles = null) {
  return (req, res, next) => {
    const s = req.session && req.session.staff;
    if (!s) return res.status(401).json({ error: 'Staff login required' });
    if (roles && !roles.includes(s.role)) return res.status(403).json({ error: 'Not allowed for your role' });
    next();
  };
}

// ---------- AUTH ----------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const [rows] = await pool.query('SELECT * FROM staff WHERE email = ? AND is_active = TRUE', [email]);
  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
  const staff = rows[0];
  const ok = await bcrypt.compare(password, staff.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.staff = {
    id: staff.id, email: staff.email, full_name: staff.full_name, role: staff.role,
  };
  await pool.query('UPDATE staff SET last_login = NOW() WHERE id = ?', [staff.id]);
  res.json({ ok: true, staff: req.session.staff });
});

router.post('/logout', (req, res) => {
  if (req.session) req.session.staff = null;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (req.session && req.session.staff) return res.json(req.session.staff);
  res.status(401).json({ error: 'Not logged in' });
});

// ---------- LIST ORDERS ----------
router.get('/orders', requireStaff(), async (req, res) => {
  const filter = (req.query.status || '').split(',').filter(Boolean);
  let sql = `SELECT o.*, s.full_name AS delivery_name, s.email AS delivery_email
             FROM orders o
             LEFT JOIN staff s ON s.id = o.assigned_delivery_staff_id`;
  const params = [];
  if (filter.length) {
    sql += ` WHERE o.status IN (${filter.map(() => '?').join(',')})`;
    params.push(...filter);
  }
  sql += ' ORDER BY o.created_at DESC LIMIT 200';
  const [rows] = await pool.query(sql, params);

  for (const o of rows) {
    const [items] = await pool.query(
      'SELECT item_name, quantity, unit_price FROM order_items WHERE order_id = ?', [o.id]
    );
    o.items = items;
    const [hist] = await pool.query(
      'SELECT status, changed_by, note, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at', [o.id]
    );
    o.history = hist;
  }
  res.json(rows);
});

// ---------- ROLE TRANSITIONS ----------
// waiter:     confirmed -> preparing -> ready
// kitchen:    preparing -> ready
// cashier:    pending -> confirmed, cancelled; also handles pickup handoff
// delivery:   ready -> out_for_delivery -> delivered
// manager:    any
const ROLE_TRANSITIONS = {
  cashier:  { pending: ['confirmed', 'cancelled'], ready: ['completed'] },
  waiter:   { confirmed: ['preparing'], preparing: ['ready'] },
  kitchen:  { preparing: ['ready'] },
  delivery: { ready: ['out_for_delivery'], out_for_delivery: ['delivered'] },
  manager:  null,
};

router.patch('/orders/:id/status', requireStaff(), async (req, res) => {
  const { status } = req.body;
  const id = parseInt(req.params.id, 10);
  if (!status || !id) return res.status(400).json({ error: 'status required' });

  const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Order not found' });
  const order = rows[0];

  const role = req.session.staff.role;
  if (role !== 'manager') {
    const allowed = ROLE_TRANSITIONS[role] || {};
    const next = allowed[order.status] || [];
    if (!next.includes(status)) {
      return res.status(403).json({
        error: `Your role (${role}) cannot move order from ${order.status} to ${status}`,
      });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE orders SET status = ?, delivered_at = IF(? = "delivered", NOW(), delivered_at) WHERE id = ?',
      [status, status, id]
    );
    await conn.query(
      'INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, ?, ?)',
      [id, status, req.session.staff.email]
    );
    await conn.commit();
    res.json({ ok: true, status });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Status update failed' });
  } finally { conn.release(); }
});

// ---------- ASSIGN DELIVERY ----------
router.patch('/orders/:id/assign-delivery', requireStaff(['cashier', 'manager']), async (req, res) => {
  const { staff_id } = req.body;
  const id = parseInt(req.params.id, 10);
  if (!staff_id) return res.status(400).json({ error: 'staff_id required' });
  const [rows] = await pool.query(
    'SELECT id FROM staff WHERE id = ? AND role = "delivery" AND is_active = TRUE',
    [staff_id]
  );
  if (!rows.length) return res.status(400).json({ error: 'Not an active delivery staff member' });
  await pool.query('UPDATE orders SET assigned_delivery_staff_id = ? WHERE id = ?', [staff_id, id]);
  await pool.query(
    'INSERT INTO order_status_history (order_id, status, changed_by, note) SELECT id, status, ?, ? FROM orders WHERE id = ?',
    [req.session.staff.email, 'assigned delivery', id]
  );
  res.json({ ok: true });
});

router.get('/delivery-staff', requireStaff(['cashier', 'manager']), async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, full_name, email FROM staff WHERE role = "delivery" AND is_active = TRUE'
  );
  res.json(rows);
});

module.exports = router;