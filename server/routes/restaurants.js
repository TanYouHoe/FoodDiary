// Connector: restaurants and their cover photo.

import { Router } from 'express';
import { checkRestaurantInput } from '../../logic/restaurants.js';
import { canChangeRestaurant, canDeleteRestaurant, RESTAURANT_IN_USE } from '../../logic/access.js';
import { pick, RESTAURANT_FIELDS } from '../rows.js';
import { uploadedUrl, removeUploaded, removeStoredUrl } from '../uploads.js';
import { guardRecord, refuseUnless, notFound } from '../guards.js';

const toRestaurant = (row) => pick(row, RESTAURANT_FIELDS);

export function restaurantRoutes({ db, upload, uploadsDir, refreshProfile }) {
  const r = Router();
  const getById = db.prepare('SELECT * FROM restaurants WHERE id = ?');
  const mayChange = guardRecord((id) => getById.get(id), refuseUnless(canChangeRestaurant));
  const setPhoto = db.prepare('UPDATE restaurants SET photo_url = ? WHERE id = ?');
  const countOne = (sql) => { const stmt = db.prepare(sql); return (...params) => stmt.get(...params).c; };
  const otherUsersMeals = countOne('SELECT COUNT(*) AS c FROM meals WHERE restaurant_id = ? AND user_id != ?');
  const otherUsersPlanned = countOne('SELECT COUNT(*) AS c FROM planned_visits WHERE restaurant_id = ? AND user_id != ?');
  const groupMeals = countOne('SELECT COUNT(*) AS c FROM meals WHERE restaurant_id = ? AND group_id IS NOT NULL');
  const groupPlanned = countOne('SELECT COUNT(*) AS c FROM planned_visits WHERE restaurant_id = ? AND group_id IS NOT NULL');
  const mealUserIds = db.prepare('SELECT DISTINCT user_id FROM meals WHERE restaurant_id = ?');

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
    if (!row) return notFound(res);
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

  // The restaurant may have gone while the file uploaded: read and write in one
  // transaction. A refused or failed upload removes its file; a replaced cover
  // photo removes the old file.
  r.post('/:id/photo', mayChange, upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Photo required' });
    const photo_url = uploadedUrl(req.file);
    let previous;
    try {
      previous = db.transaction(() => {
        const current = getById.get(req.params.id);
        if (!current) return null;
        setPhoto.run(photo_url, current.id);
        return current;
      })();
    } catch (err) {
      removeUploaded([req.file]);
      throw err;
    }
    if (!previous) {
      removeUploaded([req.file]);
      return notFound(res);
    }
    if (previous.photo_url && previous.photo_url !== photo_url) removeStoredUrl(uploadsDir, previous.photo_url);
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

  // The delete cascades to meals and planned visits, so the usage counts, the
  // list of users whose meals go, and the delete run in one transaction. Those
  // users' profiles are rebuilt afterwards.
  r.delete('/:id', mayChange, (req, res) => {
    const { id } = req.record;
    const outcome = db.transaction(() => {
      const usage = {
        otherUsersMeals: otherUsersMeals(id, req.user.id),
        otherUsersPlanned: otherUsersPlanned(id, req.user.id),
        groupMeals: groupMeals(id),
        groupPlanned: groupPlanned(id),
      };
      if (!canDeleteRestaurant(req.user, req.record, usage)) return null;
      const userIds = mealUserIds.all(id).map(row => row.user_id);
      db.prepare('DELETE FROM restaurants WHERE id = ?').run(id);
      return { userIds };
    })();
    if (!outcome) return res.status(409).json({ error: RESTAURANT_IN_USE });
    res.status(204).end();
    for (const userId of outcome.userIds) refreshProfile(userId);
  });

  return r;
}
