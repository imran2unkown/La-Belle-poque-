const express = require('express');
const pool = require('../config/db');
const router = express.Router();

function validateReservation(body) {
  const errors = [];
  const { full_name, email, phone, party_size, reservation_date, reservation_time } = body;
  if (!full_name || full_name.length < 2) errors.push('Full name required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) errors.push('Valid email required');
  if (!phone || phone.length < 6) errors.push('Valid phone required');
  const size = parseInt(party_size, 10);
  if (!size || size < 1 || size > 20) errors.push('Party size must be 1–20');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation_date || '')) errors.push('Valid date required');
  if (!/^\d{2}:\d{2}$/.test(reservation_time || '')) errors.push('Valid time required');
  return errors;
}

// POST /api/reservations
router.post('/', async (req, res) => {
  const errors = validateReservation(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const { full_name, email, phone, party_size, reservation_date, reservation_time, notes } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the slot by checking existing reservations (UNIQUE index also enforces this)
    const [existing] = await conn.query(
      `SELECT id FROM reservations
       WHERE reservation_date = ? AND reservation_time = ?
         AND status IN ('pending','confirmed','seated')
       FOR UPDATE`,
      [reservation_date, reservation_time]
    );
    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'That time slot is already booked. Please choose another.' });
    }

    // Upsert customer
    const [cust] = await conn.query(
      `INSERT INTO customers (email, full_name, phone) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), phone = VALUES(phone), id = LAST_INSERT_ID(id)`,
      [email, full_name, phone]
    );
    const customerId = cust.insertId;

    const [result] = await conn.query(
      `INSERT INTO reservations
        (customer_id, full_name, email, phone, party_size, reservation_date, reservation_time, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [customerId, full_name, email, phone, parseInt(party_size, 10),
       reservation_date, reservation_time, notes || null]
    );

    await conn.commit();
    res.status(201).json({
      id: result.insertId,
      message: 'Reservation confirmed',
      reservation_date,
      reservation_time,
      party_size: parseInt(party_size, 10),
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That time slot is already booked.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Reservation failed' });
  } finally {
    conn.release();
  }
});

module.exports = router;