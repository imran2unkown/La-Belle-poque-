const express = require('express');
const pool = require('../config/db');
const router = express.Router();

// GET /api/menu — grouped by category
router.get('/menu', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id AS category_id, c.name AS category, c.sort_order,
             m.id, m.name, m.description, m.price, m.image_url,
             m.dietary_tags, m.is_available, m.prep_minutes
      FROM categories c
      LEFT JOIN menu_items m ON m.category_id = c.id
      WHERE c.is_active = TRUE
      ORDER BY c.sort_order, m.name
    `);

    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.category_id]) {
        grouped[row.category_id] = {
          id: row.category_id,
          name: row.category,
          items: [],
        };
      }
      if (row.id) {
        grouped[row.category_id].items.push({
          id: row.id,
          name: row.name,
          description: row.description,
          price: Number(row.price),
          image_url: row.image_url,
          dietary_tags: row.dietary_tags ? row.dietary_tags.split(',') : [],
          available: !!row.is_available,
          prep_minutes: row.prep_minutes,
        });
      }
    }
    res.json({ categories: Object.values(grouped) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load menu' });
  }
});

// GET /api/hours
router.get('/hours', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT day_of_week, open_time, close_time, is_closed FROM opening_hours ORDER BY day_of_week'
  );
  res.json(rows);
});

// GET /api/reviews
router.get('/reviews', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT customer, rating, body FROM reviews WHERE is_featured = TRUE ORDER BY created_at DESC LIMIT 6'
  );
  res.json(rows);
});

// GET /api/availability?date=YYYY-MM-DD&partySize=N
// Returns available 30-minute slots within opening hours,
// excluding slots that already have a reservation for the same date + slot.
router.get('/availability', async (req, res) => {
  const { date, partySize } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !partySize) {
    return res.status(400).json({ error: 'Valid date and partySize required' });
  }
  const size = parseInt(partySize, 10);
  if (size < 1 || size > 20) return res.status(400).json({ error: 'Invalid party size' });

  try {
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    const [hours] = await pool.query(
      'SELECT open_time, close_time, is_closed FROM opening_hours WHERE day_of_week = ?',
      [dow]
    );
    if (!hours.length || hours[0].is_closed) {
      return res.json({ date, slots: [], closed: true });
    }

    const { open_time, close_time } = hours[0];
    const slots = generateSlots(open_time, close_time);

    // Slot is blocked if a reservation already exists at that exact minute
    const [taken] = await pool.query(
      `SELECT TIME_FORMAT(reservation_time, '%H:%i') AS t
       FROM reservations
       WHERE reservation_date = ?
         AND status IN ('pending','confirmed','seated')`,
      [date]
    );
    const takenSet = new Set(taken.map(r => r.t));

    // Simple capacity model: one booking per 30-min slot.
    const available = slots.filter(s => !takenSet.has(s));
    res.json({ date, closed: false, slots: available });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Availability check failed' });
  }
});

function generateSlots(open, close) {
  const toMin = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const toStr = (m) => {
    const h = Math.floor(m / 60) % 24;
    const mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };
  let end = toMin(close);
  if (end === 0) end = 24 * 60; // midnight close
  const out = [];
  for (let m = toMin(open); m + 30 <= end; m += 30) out.push(toStr(m));
  return out;
}

module.exports = router;