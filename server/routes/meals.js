// Connector: meals, their dishes and photos, and the dish summary.
// Every change to a meal asks for the user's profile to be rebuilt.

import { Router } from 'express';
import { checkNewMeal, toMealPatch, MAX_MEAL_PHOTOS } from '../../logic/meals.js';
import { normalizeMealDishes } from '../../logic/dishes.js';
import { canChangeMeal } from '../../logic/access.js';
import { pick, MEAL_FIELDS, MEAL_DISH_FIELDS, DISH_SUMMARY_FIELDS } from '../rows.js';
import { uploadedUrl } from '../uploads.js';
import { guardRecord, notAllowed } from '../guards.js';

const MEAL_SELECT = `
  SELECT m.*, r.name as restaurant_name, r.cuisine_type, u.name as user_name
  FROM meals m
  JOIN restaurants r ON r.id = m.restaurant_id
  JOIN users u ON u.id = m.user_id
`;

export function mealRoutes({ db, upload, refreshProfile, groupAllowed }) {
  const r = Router();
  const mealRow = db.prepare('SELECT * FROM meals WHERE id = ?');
  const mayChange = guardRecord((id) => mealRow.get(id), canChangeMeal);
  const dishesOf = db.prepare('SELECT id, name, category FROM meal_dishes WHERE meal_id = ?');
  const mealById = db.prepare(`${MEAL_SELECT} WHERE m.id = ?`);
  const insertDish = db.prepare('INSERT INTO meal_dishes (meal_id, name, category) VALUES (?, ?, ?)');
  const dishTypeNames = () => db.prepare('SELECT name FROM dish_types ORDER BY name').all().map(t => t.name);

  const toMeal = (row) => ({ ...pick(row, MEAL_FIELDS), dishes: dishesOf.all(row.id).map(d => pick(d, MEAL_DISH_FIELDS)) });
  const mealWithDishes = (id) => {
    const row = mealById.get(id);
    return row ? toMeal(row) : row;
  };
  const saveDishes = (mealId, dishes) => {
    for (const d of normalizeMealDishes(dishes, dishTypeNames())) insertDish.run(mealId, d.name, d.category);
  };

  r.get('/', (req, res) => {
    const { restaurant_id, group_id } = req.query;
    if (!groupAllowed(group_id, req.user.id)) return notAllowed(res);
    let sql = `${MEAL_SELECT} WHERE 1=1`;
    const params = [];
    if (restaurant_id) { sql += ' AND m.restaurant_id = ?'; params.push(Number(restaurant_id)); }
    if (group_id) { sql += ' AND m.group_id = ?'; params.push(Number(group_id)); }
    else { sql += ' AND m.user_id = ?'; params.push(req.user.id); }
    sql += ' ORDER BY m.visited_at DESC';
    res.json(db.prepare(sql).all(...params).map(toMeal));
  });

  r.post('/', (req, res) => {
    const input = checkNewMeal(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const v = input.value;
    if (!groupAllowed(v.group_id, req.user.id)) return notAllowed(res);
    const info = db.prepare(
      'INSERT INTO meals (restaurant_id, user_id, group_id, title, calories, rating, notes, visited_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(v.restaurant_id, req.user.id, v.group_id, v.title, v.calories, v.rating, v.notes, v.visited_at);
    if (v.dishes.length > 0) saveDishes(info.lastInsertRowid, v.dishes);
    res.status(201).json(mealWithDishes(info.lastInsertRowid));
    refreshProfile(req.user.id);
  });

  r.post('/:id/photos', mayChange, upload.array('photos', MAX_MEAL_PHOTOS), (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one photo required (JPEG, PNG, or WebP, max 5MB each)' });
    }
    const existing = JSON.parse(req.record.photo_urls || '[]');
    const photoUrls = [...existing, ...req.files.map(uploadedUrl)];
    db.prepare('UPDATE meals SET photo_urls = ? WHERE id = ?').run(JSON.stringify(photoUrls), req.params.id);
    res.json({ photo_urls: photoUrls });
  });

  r.put('/:id', mayChange, (req, res) => {
    const patch = toMealPatch(req.body);
    if (!patch.ok) return res.status(400).json({ error: patch.error });
    const { fields, dishes } = patch.value;
    if (!groupAllowed(fields.group_id, req.user.id)) return notAllowed(res);
    const columns = Object.keys(fields);
    if (columns.length > 0) {
      db.prepare(`UPDATE meals SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...Object.values(fields), req.params.id);
    }
    if (dishes) {
      db.prepare('DELETE FROM meal_dishes WHERE meal_id = ?').run(req.params.id);
      saveDishes(req.params.id, dishes);
    }
    res.json(mealWithDishes(req.params.id));
    refreshProfile(req.user.id);
  });

  r.delete('/:id', mayChange, (req, res) => {
    db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
    res.status(204).end();
    refreshProfile(req.user.id);
  });

  return r;
}

export function dishRoutes({ db }) {
  const r = Router();
  r.get('/', (req, res) => {
    const rows = db.prepare(`
      SELECT md.name, md.category, COUNT(*) as times_eaten,
             MAX(m.rating) as best_rating, MAX(m.visited_at) as last_eaten,
             GROUP_CONCAT(DISTINCT r.name) as restaurants
      FROM meal_dishes md
      JOIN meals m ON m.id = md.meal_id
      JOIN restaurants r ON r.id = m.restaurant_id
      WHERE m.user_id = ?
      GROUP BY LOWER(md.name)
      ORDER BY COUNT(*) DESC, md.name
    `).all(req.user.id);
    res.json(rows.map(row => pick(row, DISH_SUMMARY_FIELDS)));
  });
  return r;
}
