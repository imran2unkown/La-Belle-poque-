const express = require('express');
const pool = require('../config/db');
const router = express.Router();

router.get('/:orderNumber', async (req, res) => {
  const { orderNumber } = req.params;
  const [orders] = await pool.query(
    'SELECT id, order_number, status, fulfillment, total, created_at, delivered_at FROM orders WHERE order_number = ?',
    [orderNumber]
  );
  if (!orders.length) return res.status(404).json({ error: 'Order not found' });
  const order = orders[0];

  const [items] = await pool.query(
    'SELECT item_name, quantity, unit_price FROM order_items WHERE order_id = ?', [order.id]
  );
  const [history] = await pool.query(
    'SELECT status, note, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at',
    [order.id]
  );

  res.json({ order, items, history });
});

module.exports = router;