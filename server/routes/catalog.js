// Connector: the meal-type and dish-type catalogues.

import { Router } from 'express';
import { checkMealTypeInput, checkDishTypeInput, builtInLockError } from '../../logic/catalog.js';
import { pick, MEAL_TYPE_FIELDS, DISH_TYPE_FIELDS } from '../rows.js';

const toMealType = (row) => ({ ...pick(row, MEAL_TYPE_FIELDS), slots: JSON.parse(row.slots) });
const toDishType = (row) => pick(row, DISH_TYPE_FIELDS);
const isUniqueViolation = (err) => err.message?.includes('UNIQUE');

export function mealTypeRoutes({ db }) {
  const r = Router();
  const getById = db.prepare('SELECT * FROM meal_types WHERE id = ?');

  r.get('/', (req, res) => {
    const { cuisine_type } = req.query;
    let sql = 'SELECT * FROM meal_types';
    const params = [];
    if (cuisine_type) {
      sql += ' WHERE cuisine_type = ? OR cuisine_type IS NULL';
      params.push(cuisine_type);
    }
    sql += ' ORDER BY name';
    res.json(db.prepare(sql).all(...params).map(toMealType));
  });

  r.post('/', (req, res) => {
    const input = checkMealTypeInput(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const { name, cuisine_type, slots } = input.value;
    const info = db.prepare('INSERT INTO meal_types (name, cuisine_type, slots) VALUES (?, ?, ?)')
      .run(name, cuisine_type, JSON.stringify(slots));
    res.status(201).json(toMealType(getById.get(info.lastInsertRowid)));
  });

  r.put('/:id', (req, res) => {
    const row = getById.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Meal type not found' });
    const locked = builtInLockError(row, 'meal', 'edit');
    if (locked) return res.status(403).json({ error: locked });
    const input = checkMealTypeInput(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const { name, cuisine_type, slots } = input.value;
    db.prepare('UPDATE meal_types SET name = ?, cuisine_type = ?, slots = ? WHERE id = ?')
      .run(name, cuisine_type, JSON.stringify(slots), req.params.id);
    res.json(toMealType(getById.get(req.params.id)));
  });

  r.delete('/:id', (req, res) => {
    const row = getById.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Meal type not found' });
    const locked = builtInLockError(row, 'meal', 'delete');
    if (locked) return res.status(403).json({ error: locked });
    db.prepare('DELETE FROM meal_types WHERE id = ?').run(req.params.id);
    res.status(204).end();
  });

  return r;
}

export function dishTypeRoutes({ db }) {
  const r = Router();
  const getById = db.prepare('SELECT * FROM dish_types WHERE id = ?');
  const duplicate = (res) => res.status(409).json({ error: 'A dish type with that name already exists' });

  r.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM dish_types ORDER BY name').all().map(toDishType));
  });

  r.post('/', (req, res) => {
    const input = checkDishTypeInput(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    try {
      const info = db.prepare('INSERT INTO dish_types (name, keywords) VALUES (?, ?)').run(input.value.name, '[]');
      res.status(201).json(toDishType(getById.get(info.lastInsertRowid)));
    } catch (err) {
      if (isUniqueViolation(err)) return duplicate(res);
      throw err;
    }
  });

  r.put('/:id', (req, res) => {
    const row = getById.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Dish type not found' });
    const locked = builtInLockError(row, 'dish', 'edit');
    if (locked) return res.status(403).json({ error: locked });
    const input = checkDishTypeInput(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    try {
      db.prepare('UPDATE dish_types SET name = ? WHERE id = ?').run(input.value.name, req.params.id);
      res.json(toDishType(getById.get(req.params.id)));
    } catch (err) {
      if (isUniqueViolation(err)) return duplicate(res);
      throw err;
    }
  });

  r.delete('/:id', (req, res) => {
    const row = getById.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Dish type not found' });
    const locked = builtInLockError(row, 'dish', 'delete');
    if (locked) return res.status(403).json({ error: locked });
    db.prepare('DELETE FROM dish_types WHERE id = ?').run(req.params.id);
    res.status(204).end();
  });

  return r;
}
