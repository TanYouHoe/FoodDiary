// Connector: restaurants and their cover photo.

import { Router } from 'express';
import { checkRestaurantInput } from '../../logic/restaurants.js';
import { canChangeRestaurant } from '../../logic/access.js';
import { pick, RESTAURANT_FIELDS } from '../rows.js';
import { uploadedUrl } from '../uploads.js';
import { guardRecord } from '../guards.js';

const toRestaurant = (row) => pick(row, RESTAURANT_FIELDS);

export function restaurantRoutes({ db, upload }) {
  const r = Router();
  const getById = db.prepare('SELECT * FROM restaurants WHERE id = ?');
  const mayChange = guardRecord((id) => getById.get(id), canChangeRestaurant);

  r.get('/', (req, res) => {
    const { cuisine, price_range, search } = req.query;
    let sql = 'SELECT * FROM restaurants WHERE 1=1';
    const params = [];
    if (cuisine) { sql += ' AND cuisine_type = ?'; params.push(cuisine); }
    if (price_range) { sql += ' AND price_range = ?'; params.push(Number(price_range)); }
    if (search) { sql += ' AND name LIKE ?'; params.push(`%${search}%`); }
    sql += ' ORDER BY created_at DESC';
    res.json(db.prepare(sql).all(...params).map(toRestaurant));
  });

  r.get('/:id', (req, res) => {
    const row = getById.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(toRestaurant(row));
  });

  r.post('/', (req, res) => {
    const input = checkRestaurantInput(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const v = input.value;
    const info = db.prepare(
      'INSERT INTO restaurants (name, cuisine_type, price_range, address, lat, lng, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(v.name, v.cuisine_type, v.price_range, v.address, v.lat, v.lng, req.user.id);
    res.status(201).json(toRestaurant(getById.get(info.lastInsertRowid)));
  });

  r.post('/:id/photo', mayChange, upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Photo required' });
    const photo_url = uploadedUrl(req.file);
    db.prepare('UPDATE restaurants SET photo_url = ? WHERE id = ?').run(photo_url, req.params.id);
    res.json({ photo_url });
  });

  r.put('/:id', mayChange, (req, res) => {
    const input = checkRestaurantInput(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const v = input.value;
    db.prepare('UPDATE restaurants SET name=?, cuisine_type=?, price_range=?, address=?, lat=?, lng=? WHERE id=?')
      .run(v.name, v.cuisine_type, v.price_range, v.address, v.lat, v.lng, req.params.id);
    res.json(toRestaurant(getById.get(req.params.id)));
  });

  r.delete('/:id', mayChange, (req, res) => {
    db.prepare('DELETE FROM restaurants WHERE id = ?').run(req.params.id);
    res.status(204).end();
  });

  return r;
}
