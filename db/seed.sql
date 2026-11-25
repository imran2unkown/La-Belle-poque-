USE luxury_restaurant;

-- Admin (password = AdminPass123! — regenerate hash via script if you prefer)
-- The server will auto-create/replace this on first boot if missing.
-- bcrypt hash below is placeholder; server.js handles real hashing.

INSERT INTO categories (name, sort_order) VALUES
  ('Starters', 1), ('Mains', 2), ('Desserts', 3), ('Drinks', 4)
ON DUPLICATE KEY UPDATE name = name;

INSERT INTO menu_items (category_id, name, description, price, image_url, dietary_tags, prep_minutes) VALUES
(1,'Truffle Arancini','Crispy risotto pearls with black truffle and parmesan',14.50,'https://images.unsplash.com/photo-1541529086526-db283c563270?w=600','vegetarian',12),
(1,'Burrata & Heirloom Tomato','Creamy burrata, basil oil, aged balsamic',16.00,'https://images.unsplash.com/photo-1626200419199-391ae4be7a41?w=600','vegetarian,gluten_free',10),
(2,'Wagyu Ribeye','A5 wagyu, roasted bone marrow, red wine jus',68.00,'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=600','gluten_free',35),
(2,'Lobster Linguine','Fresh lobster, saffron cream, cherry tomato',42.00,'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600','',25),
(2,'Wild Mushroom Risotto','Carnaroli rice, porcini, thyme, parmesan crisp',28.00,'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=600','vegetarian,gluten_free',22),
(3,'Dark Chocolate Fondant','70% Valrhona, salted caramel, vanilla bean ice cream',14.00,'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600','vegetarian',15),
(3,'Pistachio Tiramisu','Mascarpone, espresso-soaked savoiardi, pistachio',13.00,'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600','vegetarian',10),
(4,'Signature Negroni','Gin, Campari, sweet vermouth, orange zest',16.00,'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=600','',5),
(4,'Sparkling Elderflower','Elderflower, lime, soda, mint',9.00,'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600','vegan,gluten_free',4);

INSERT INTO opening_hours (day_of_week, open_time, close_time, is_closed) VALUES
(0,'12:00:00','22:00:00',FALSE),
(1,'18:00:00','23:00:00',FALSE),
(2,'18:00:00','23:00:00',FALSE),
(3,'18:00:00','23:00:00',FALSE),
(4,'12:00:00','00:00:00',FALSE),
(5,'12:00:00','00:00:00',FALSE),
(6,'12:00:00','22:00:00',FALSE);

INSERT INTO reviews (customer, rating, body, is_featured) VALUES
('Sophia Laurent',5,'An unforgettable evening. The wagyu melted like butter and the service was flawless.',TRUE),
('Marcus Chen',5,'Easily the best truffle arancini in the city. The ambiance is pure luxury.',TRUE),
('Amelia Ross',4,'Beautiful interior and inventive cocktails. Will return for the tiramisu alone.',TRUE);