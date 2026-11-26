const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const router = express.Router();

const TAX_RATE = 0.16;        // Kenya VAT
const DELIVERY_FEE = 150;     // KES

function orderNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `LB-${ts}-${rand}`;
}

router.post('/', async (req, res) => {
  const { full_name, email, phone, fulfillment, address, notes, items } = req.body;

  const errors = [];
  if (!full_name || full_name.length < 2) errors.push('Name required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) errors.push('Valid email required');
  if (!phone || phone.length < 6) errors.push('Phone required');
  if (!['pickup', 'delivery'].includes(fulfillment)) errors.push('Fulfillment must be pickup or delivery');
  if (fulfillment === 'delivery' && (!address || address.length < 10)) errors.push('Address required for delivery');
  if (!Array.isArray(items) || !items.length) errors.push('Cart is empty');
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const ids = items.map(i => parseInt(i.id, 10));
    if (ids.some(n => !n)) throw Object.assign(new Error('Invalid item id'), { code: 'BAD_ITEM' });

    const [menuRows] = await conn.query(
      `SELECT id, name, price, is_available FROM menu_items WHERE id IN (?)`,
      [ids]
    );
    const menuMap = new Map(menuRows.map(r => [r.id, r]));

    let subtotal = 0;
    const lineItems = [];
    for (const it of items) {
      const id = parseInt(it.id, 10);
      const qty = parseInt(it.quantity, 10);
      const menu = menuMap.get(id);
      if (!menu) throw Object.assign(new Error(`Item ${id} not found`), { code: 'BAD_ITEM' });
      if (!menu.is_available) throw Object.assign(new Error(`${menu.name} is unavailable`), { code: 'UNAVAILABLE' });
      if (!qty || qty < 1 || qty > 50) throw Object.assign(new Error('Invalid quantity'), { code: 'BAD_QTY' });
      const price = Number(menu.price);
      subtotal += price * qty;
      lineItems.push({ id, name: menu.name, price, quantity: qty, customizations: it.customizations || null });
    }

    const tax = +(subtotal * TAX_RATE).toFixed(2);
    const deliveryFee = fulfillment === 'delivery' ? DELIVERY_FEE : 0;
    const total = +(subtotal + tax + deliveryFee).toFixed(2);

    const [cust] = await conn.query(
      `INSERT INTO customers (email, full_name, phone) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), phone = VALUES(phone), id = LAST_INSERT_ID(id)`,
      [email, full_name, phone]
    );
    const customerId = cust.insertId;

    const num = orderNumber();
    const [orderRes] = await conn.query(
      `INSERT INTO orders
        (order_number, customer_id, full_name, email, phone, fulfillment, address,
         subtotal, tax, delivery_fee, total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [num, customerId, full_name, email, phone, fulfillment,
       fulfillment === 'delivery' ? address : null,
       subtotal, tax, deliveryFee, total, notes || null]
    );
    const orderId = orderRes.insertId;

    for (const li of lineItems) {
      await conn.query(
        `INSERT INTO order_items
          (order_id, menu_item_id, item_name, unit_price, quantity, customizations)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, li.id, li.name, li.price, li.quantity,
         li.customizations ? JSON.stringify(li.customizations) : null]
      );
    }

    await conn.query(
      'INSERT INTO order_status_history (order_id, status, changed_by, note) VALUES (?, ?, ?, ?)',
      [orderId, 'pending', 'system', 'Order received']
    );

    await conn.commit();
    res.status(201).json({
      order_number: num,
      tracking_url: `/track.html?order=${num}`,
      subtotal, tax, delivery_fee: deliveryFee, total,
      items: lineItems,
      status: 'pending',
    });
  } catch (err) {
    await conn.rollback();
    if (['BAD_ITEM', 'BAD_QTY', 'UNAVAILABLE'].includes(err.code)) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Order failed' });
  } finally {
    conn.release();
  }
});

module.exports = router;