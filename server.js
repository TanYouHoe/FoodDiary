import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { mkdirSync } from 'fs';
import crypto from 'crypto';
import { getSuggestions, suggestMeal } from './suggest.js';
import { rebuildProfile } from './profile.js';

const JWT_SECRET = process.env.JWT_SECRET || 'food-diary-dev-secret';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadsDir = join(__dirname, 'uploads');
mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype));
  },
});

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex');
}

const db = new Database(join(__dirname, 'fooddiary.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS groups_ (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cuisine_type TEXT,
    price_range INTEGER CHECK(price_range BETWEEN 1 AND 4),
    address TEXT,
    lat REAL,
    lng REAL,
    photo_url TEXT,
    added_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    group_id INTEGER REFERENCES groups_(id) ON DELETE SET NULL,
    title TEXT,
    calories INTEGER,
    dishes TEXT,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    photo_urls TEXT DEFAULT '[]',
    notes TEXT,
    visited_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meal_dishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meal_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cuisine_type TEXT,
    slots TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS planned_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    group_id INTEGER REFERENCES groups_(id) ON DELETE SET NULL,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dish_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    keywords TEXT NOT NULL DEFAULT '[]',
    is_seed INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_meal_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    meal_period TEXT NOT NULL,
    avg_price_range REAL,
    adventure_ratio REAL NOT NULL DEFAULT 0,
    avg_rating_threshold REAL NOT NULL DEFAULT 0,
    meal_frequency REAL NOT NULL DEFAULT 0,
    group_ratio REAL NOT NULL DEFAULT 0,
    total_meals INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, day_of_week, meal_period)
  );
`);

// Migrations for existing databases
const migrations = [
  { check: () => !db.prepare("SELECT * FROM pragma_table_info('meals') WHERE name='photo_urls'").get(), sql: "ALTER TABLE meals ADD COLUMN photo_urls TEXT DEFAULT '[]'" },
  { check: () => !db.prepare("SELECT * FROM pragma_table_info('restaurants') WHERE name='photo_url'").get(), sql: "ALTER TABLE restaurants ADD COLUMN photo_url TEXT" },
  { check: () => !db.prepare("SELECT * FROM pragma_table_info('meals') WHERE name='title'").get(), sql: "ALTER TABLE meals ADD COLUMN title TEXT" },
  { check: () => !db.prepare("SELECT * FROM pragma_table_info('meals') WHERE name='calories'").get(), sql: "ALTER TABLE meals ADD COLUMN calories INTEGER" },
  { check: () => !db.prepare("SELECT * FROM pragma_table_info('meals') WHERE name='dishes'").get(), sql: "ALTER TABLE meals ADD COLUMN dishes TEXT" },
  { check: () => !db.prepare("SELECT * FROM pragma_table_info('meals') WHERE name='meal_type_id'").get(), sql: "ALTER TABLE meals ADD COLUMN meal_type_id INTEGER REFERENCES meal_types(id)" },
  { check: () => !db.prepare("SELECT * FROM pragma_table_info('meal_dishes') WHERE name='slot_name'").get(), sql: "ALTER TABLE meal_dishes ADD COLUMN slot_name TEXT" },
  { check: () => !db.prepare("SELECT * FROM pragma_table_info('meal_dishes') WHERE name='category'").get(), sql: "ALTER TABLE meal_dishes ADD COLUMN category TEXT" },
  { check: () => !db.prepare("SELECT * FROM pragma_table_info('meal_types') WHERE name='is_seed'").get(), sql: "ALTER TABLE meal_types ADD COLUMN is_seed INTEGER DEFAULT 0" },
  { check: () => { try { db.prepare('SELECT 1 FROM dish_types LIMIT 1').get(); return false; } catch { return true; } }, sql: "CREATE TABLE IF NOT EXISTS dish_types (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, keywords TEXT NOT NULL DEFAULT '[]', is_seed INTEGER DEFAULT 0)" },
];
for (const m of migrations) {
  try { if (m.check()) db.exec(m.sql); } catch {}
}

// Seed meal types if empty
if (db.prepare('SELECT COUNT(*) as c FROM meal_types').get().c === 0) {
  const S = JSON.stringify;
  const seed = db.prepare('INSERT INTO meal_types (name, cuisine_type, slots, is_seed) VALUES (?, ?, ?, 1)');
  seed.run('Chinese Traditional', 'Chinese', S([{name:'Soup'},{name:'Rice'},{name:'Main'},{name:'Side'},{name:'Side'}]));
  seed.run('Chinese Noodle Set', 'Chinese', S([{name:'Noodle'},{name:'Main'},{name:'Side'},{name:'Drink'}]));
  seed.run('Western Set', 'Western', S([{name:'Main'},{name:'Side'},{name:'Side'},{name:'Drink'}]));
  seed.run('Western Fine Dining', 'Western', S([{name:'Appetizer'},{name:'Soup'},{name:'Main'},{name:'Dessert'}]));
  seed.run('Japanese Teishoku', 'Japanese', S([{name:'Soup'},{name:'Rice'},{name:'Main'},{name:'Side'}]));
  seed.run('Japanese Bento', 'Japanese', S([{name:'Rice'},{name:'Main'},{name:'Side'},{name:'Side'},{name:'Side'}]));
  seed.run('Malay Nasi Set', 'Malay', S([{name:'Rice'},{name:'Main'},{name:'Side'},{name:'Side'},{name:'Drink'}]));
  seed.run('Korean Set', 'Korean', S([{name:'Soup'},{name:'Rice'},{name:'Main'},{name:'Side'},{name:'Side'},{name:'Side'}]));
  seed.run('Thai Set', 'Thai', S([{name:'Soup'},{name:'Rice'},{name:'Main'},{name:'Side'}]));
  seed.run('Italian Course', 'Italian', S([{name:'Appetizer'},{name:'Noodle'},{name:'Main'},{name:'Dessert'}]));
  seed.run('Indian Thali', 'Indian', S([{name:'Bread'},{name:'Main'},{name:'Main'},{name:'Side'},{name:'Side'},{name:'Side'}]));
  seed.run('Simple Meal', null, S([{name:'Main'},{name:'Side'},{name:'Drink'}]));
}

// Backfill is_seed for existing databases where seeds were inserted without the flag
db.prepare("UPDATE meal_types SET is_seed = 1 WHERE (is_seed IS NULL OR is_seed = 0) AND name IN ('Chinese Traditional','Chinese Noodle Set','Western Set','Western Fine Dining','Japanese Teishoku','Japanese Bento','Malay Nasi Set','Korean Set','Thai Set','Italian Course','Indian Thali','Simple Meal')").run();

// --- Dish auto-categorization ---
function categorizeDish(dishName) {
  const lower = dishName.toLowerCase().trim();
  const types = db.prepare('SELECT name FROM dish_types ORDER BY name').all();
  for (const type of types) {
    if (lower.includes(type.name.toLowerCase())) return type.name.toLowerCase();
  }
  return 'main';
}

// Seed dish types if empty
if (db.prepare('SELECT COUNT(*) as c FROM dish_types').get().c === 0) {
  const seedDT = db.prepare('INSERT INTO dish_types (name, keywords, is_seed) VALUES (?, ?, 1)');
  const defaultTypes = ['Soup', 'Rice', 'Noodle', 'Bread', 'Main', 'Side', 'Dessert', 'Drink', 'Appetizer'];
  for (const name of defaultTypes) {
    seedDT.run(name, '[]');
  }
}

const app = express();
app.use(cors());
app.use(express.json());

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token required' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = db.prepare('SELECT id, name, email, avatar_url, created_at FROM users WHERE id = ?').get(payload.id);
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Serve uploaded photos
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// Serve React build in production
app.use(express.static(join(__dirname, 'dist')));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// --- Auth ---
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Name, email, and password required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name.trim(), email.trim(), password_hash);
  const user = { id: info.lastInsertRowid, name: name.trim(), email: email.trim() };
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password_hash, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json(req.user);
});

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential required' });

  try {
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    if (!email) return res.status(400).json({ error: 'No email in Google account' });

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      const randomPass = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const info = db.prepare('INSERT INTO users (name, email, password_hash, avatar_url) VALUES (?, ?, ?, ?)')
        .run(name || email.split('@')[0], email, randomPass, picture || null);
      user = db.prepare('SELECT id, name, email, avatar_url, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
    } else {
      if (picture && !user.avatar_url) {
        db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(picture, user.id);
      }
      const { password_hash, ...safe } = user;
      user = safe;
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// --- Restaurants ---
app.get('/api/restaurants', authenticate, (req, res) => {
  const { cuisine, price_range, search } = req.query;
  let sql = 'SELECT * FROM restaurants WHERE 1=1';
  const params = [];

  if (cuisine) { sql += ' AND cuisine_type = ?'; params.push(cuisine); }
  if (price_range) { sql += ' AND price_range = ?'; params.push(Number(price_range)); }
  if (search) { sql += ' AND name LIKE ?'; params.push(`%${search}%`); }

  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/restaurants/:id', authenticate, (req, res) => {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!restaurant) return res.status(404).json({ error: 'Not found' });
  res.json(restaurant);
});

app.post('/api/restaurants', authenticate, (req, res) => {
  const { name, cuisine_type, price_range, address, lat, lng } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

  const info = db.prepare(
    'INSERT INTO restaurants (name, cuisine_type, price_range, address, lat, lng, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name.trim(), cuisine_type || null, price_range || null, address || null, lat || null, lng || null, req.user.id);

  res.status(201).json(db.prepare('SELECT * FROM restaurants WHERE id = ?').get(info.lastInsertRowid));
});

app.post('/api/restaurants/:id/photo', authenticate, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Photo required' });
  const photo_url = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE restaurants SET photo_url = ? WHERE id = ?').run(photo_url, req.params.id);
  res.json({ photo_url });
});

app.put('/api/restaurants/:id', authenticate, (req, res) => {
  const { name, cuisine_type, price_range, address, lat, lng } = req.body;
  db.prepare(
    'UPDATE restaurants SET name=?, cuisine_type=?, price_range=?, address=?, lat=?, lng=? WHERE id=?'
  ).run(name, cuisine_type || null, price_range || null, address || null, lat || null, lng || null, req.params.id);

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!restaurant) return res.status(404).json({ error: 'Not found' });
  res.json(restaurant);
});

app.delete('/api/restaurants/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM restaurants WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- Meal Types ---
app.get('/api/meal-types', authenticate, (req, res) => {
  const { cuisine_type } = req.query;
  let sql = 'SELECT * FROM meal_types';
  const params = [];
  if (cuisine_type) {
    sql += ' WHERE cuisine_type = ? OR cuisine_type IS NULL';
    params.push(cuisine_type);
  }
  sql += ' ORDER BY name';
  const types = db.prepare(sql).all(...params);
  res.json(types.map(t => ({ ...t, slots: JSON.parse(t.slots) })));
});

app.post('/api/meal-types', authenticate, (req, res) => {
  const { name, cuisine_type, slots } = req.body;
  if (!name || !slots) return res.status(400).json({ error: 'Name and slots required' });
  const info = db.prepare('INSERT INTO meal_types (name, cuisine_type, slots) VALUES (?, ?, ?)').run(name, cuisine_type || null, JSON.stringify(slots));
  const created = db.prepare('SELECT * FROM meal_types WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...created, slots: JSON.parse(created.slots) });
});

app.put('/api/meal-types/:id', authenticate, (req, res) => {
  const mt = db.prepare('SELECT * FROM meal_types WHERE id = ?').get(req.params.id);
  if (!mt) return res.status(404).json({ error: 'Meal type not found' });
  if (mt.is_seed) return res.status(403).json({ error: 'Cannot edit built-in meal types' });
  const { name, cuisine_type, slots } = req.body;
  if (!name || !slots) return res.status(400).json({ error: 'Name and slots required' });
  db.prepare('UPDATE meal_types SET name = ?, cuisine_type = ?, slots = ? WHERE id = ?')
    .run(name, cuisine_type || null, JSON.stringify(slots), req.params.id);
  const updated = db.prepare('SELECT * FROM meal_types WHERE id = ?').get(req.params.id);
  res.json({ ...updated, slots: JSON.parse(updated.slots) });
});

app.delete('/api/meal-types/:id', authenticate, (req, res) => {
  const mt = db.prepare('SELECT * FROM meal_types WHERE id = ?').get(req.params.id);
  if (!mt) return res.status(404).json({ error: 'Meal type not found' });
  if (mt.is_seed) return res.status(403).json({ error: 'Cannot delete built-in meal types' });
  db.prepare('DELETE FROM meal_types WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- Dishes (aggregated from meal_dishes) ---
app.get('/api/dishes', authenticate, (req, res) => {
  const dishes = db.prepare(`
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
  res.json(dishes);
});

// --- Dish Types ---
app.get('/api/dish-types', authenticate, (req, res) => {
  const types = db.prepare('SELECT * FROM dish_types ORDER BY name').all();
  res.json(types);
});

app.post('/api/dish-types', authenticate, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const info = db.prepare('INSERT INTO dish_types (name, keywords) VALUES (?, ?)').run(name.trim(), '[]');
    const created = db.prepare('SELECT * FROM dish_types WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'A dish type with that name already exists' });
    throw err;
  }
});

app.put('/api/dish-types/:id', authenticate, (req, res) => {
  const dt = db.prepare('SELECT * FROM dish_types WHERE id = ?').get(req.params.id);
  if (!dt) return res.status(404).json({ error: 'Dish type not found' });
  if (dt.is_seed) return res.status(403).json({ error: 'Cannot edit built-in dish types' });
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    db.prepare('UPDATE dish_types SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
    const updated = db.prepare('SELECT * FROM dish_types WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'A dish type with that name already exists' });
    throw err;
  }
});

app.delete('/api/dish-types/:id', authenticate, (req, res) => {
  const dt = db.prepare('SELECT * FROM dish_types WHERE id = ?').get(req.params.id);
  if (!dt) return res.status(404).json({ error: 'Dish type not found' });
  if (dt.is_seed) return res.status(403).json({ error: 'Cannot delete built-in dish types' });
  db.prepare('DELETE FROM dish_types WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- Meals ---
app.get('/api/meals', authenticate, (req, res) => {
  const { restaurant_id, group_id } = req.query;
  let sql = `
    SELECT m.*, r.name as restaurant_name, r.cuisine_type, u.name as user_name
    FROM meals m
    JOIN restaurants r ON r.id = m.restaurant_id
    JOIN users u ON u.id = m.user_id
    WHERE 1=1
  `;
  const params = [];

  if (restaurant_id) { sql += ' AND m.restaurant_id = ?'; params.push(Number(restaurant_id)); }
  if (group_id) { sql += ' AND m.group_id = ?'; params.push(Number(group_id)); }
  else { sql += ' AND m.user_id = ?'; params.push(req.user.id); }

  sql += ' ORDER BY m.visited_at DESC';
  const meals = db.prepare(sql).all(...params);
  const dishStmt = db.prepare('SELECT id, name, category FROM meal_dishes WHERE meal_id = ?');
  for (const meal of meals) {
    meal.dishes = dishStmt.all(meal.id);
  }
  res.json(meals);
});

function getMealWithDishes(mealId) {
  const meal = db.prepare(`
    SELECT m.*, r.name as restaurant_name, r.cuisine_type, u.name as user_name
    FROM meals m JOIN restaurants r ON r.id = m.restaurant_id JOIN users u ON u.id = m.user_id
    WHERE m.id = ?
  `).get(mealId);
  if (meal) {
    meal.dishes = db.prepare('SELECT id, name, category FROM meal_dishes WHERE meal_id = ?').all(mealId);
  }
  return meal;
}

app.post('/api/meals', authenticate, (req, res) => {
  const { restaurant_id, group_id, title, calories, dishes, rating, notes, visited_at } = req.body;
  if (!restaurant_id || !rating || !visited_at) {
    return res.status(400).json({ error: 'Restaurant, rating, and visit date required' });
  }

  const info = db.prepare(
    'INSERT INTO meals (restaurant_id, user_id, group_id, title, calories, rating, notes, visited_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(restaurant_id, req.user.id, group_id || null, title || null, calories || null, rating, notes || null, visited_at);

  if (Array.isArray(dishes) && dishes.length > 0) {
    const insert = db.prepare('INSERT INTO meal_dishes (meal_id, name, category) VALUES (?, ?, ?)');
    for (const dish of dishes) {
      const name = typeof dish === 'object' ? dish.name?.trim() : typeof dish === 'string' ? dish.trim() : null;
      if (name) {
        const cat = (typeof dish === 'object' && dish.category) ? dish.category : categorizeDish(name);
        insert.run(info.lastInsertRowid, name, cat);
      }
    }
  }

  res.status(201).json(getMealWithDishes(info.lastInsertRowid));
  try { rebuildProfile(db, req.user.id); } catch {}
});

app.post('/api/meals/:id/photos', authenticate, upload.array('photos', 10), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'At least one photo required (JPEG, PNG, or WebP, max 5MB each)' });
  const meal = db.prepare('SELECT photo_urls FROM meals WHERE id = ?').get(req.params.id);
  const existing = meal ? JSON.parse(meal.photo_urls || '[]') : [];
  const newUrls = req.files.map(f => `/uploads/${f.filename}`);
  const allUrls = [...existing, ...newUrls];
  db.prepare('UPDATE meals SET photo_urls = ? WHERE id = ?').run(JSON.stringify(allUrls), req.params.id);
  res.json({ photo_urls: allUrls });
});

app.put('/api/meals/:id', authenticate, (req, res) => {
  const { restaurant_id, title, calories, dishes, rating, notes, visited_at, group_id } = req.body;
  const updates = [];
  const params = [];
  if (restaurant_id != null) { updates.push('restaurant_id = ?'); params.push(restaurant_id); }
  if (title !== undefined) { updates.push('title = ?'); params.push(title || null); }
  if (calories !== undefined) { updates.push('calories = ?'); params.push(calories || null); }
  if (rating != null) { updates.push('rating = ?'); params.push(rating); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  if (visited_at !== undefined) { updates.push('visited_at = ?'); params.push(visited_at); }
  if (group_id !== undefined) { updates.push('group_id = ?'); params.push(group_id || null); }
  if (updates.length > 0) {
    params.push(req.params.id);
    db.prepare(`UPDATE meals SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  if (Array.isArray(dishes)) {
    db.prepare('DELETE FROM meal_dishes WHERE meal_id = ?').run(req.params.id);
    const insert = db.prepare('INSERT INTO meal_dishes (meal_id, name, category) VALUES (?, ?, ?)');
    for (const dish of dishes) {
      const name = typeof dish === 'object' ? dish.name?.trim() : typeof dish === 'string' ? dish.trim() : null;
      if (name) {
        const cat = (typeof dish === 'object' && dish.category) ? dish.category : categorizeDish(name);
        insert.run(req.params.id, name, cat);
      }
    }
  }
  if (updates.length === 0 && !Array.isArray(dishes)) {
    return res.status(400).json({ error: 'Nothing to update' });
  }
  res.json(getMealWithDishes(req.params.id));
  try { rebuildProfile(db, req.user.id); } catch {}
});

app.delete('/api/meals/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
  res.status(204).end();
  try { rebuildProfile(db, req.user.id); } catch {}
});

// --- Groups ---
app.get('/api/groups', authenticate, (req, res) => {
  const groups = db.prepare(`
    SELECT g.*, gm.role,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
    FROM groups_ g
    JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
    ORDER BY g.created_at DESC
  `).all(req.user.id);
  res.json(groups);
});

app.post('/api/groups', authenticate, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Group name required' });

  const invite_code = generateInviteCode();
  const info = db.prepare(
    'INSERT INTO groups_ (name, invite_code, created_by) VALUES (?, ?, ?)'
  ).run(name.trim(), invite_code, req.user.id);

  db.prepare(
    'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
  ).run(info.lastInsertRowid, req.user.id, 'owner');

  res.status(201).json(db.prepare('SELECT * FROM groups_ WHERE id = ?').get(info.lastInsertRowid));
});

app.get('/api/groups/:id/members', authenticate, (req, res) => {
  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_url, gm.role, gm.joined_at
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.joined_at
  `).all(req.params.id);
  res.json(members);
});

app.post('/api/groups/join', authenticate, (req, res) => {
  const { invite_code } = req.body;
  if (!invite_code) return res.status(400).json({ error: 'Invite code required' });

  const group = db.prepare('SELECT * FROM groups_ WHERE invite_code = ?').get(invite_code);
  if (!group) return res.status(404).json({ error: 'Invalid invite code' });

  const existing = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(group.id, req.user.id);
  if (existing) return res.status(409).json({ error: 'Already a member' });

  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(group.id, req.user.id);
  res.status(201).json(group);
});

// --- Planned Visits ---
app.get('/api/planned', authenticate, (req, res) => {
  const { group_id } = req.query;
  let sql = `
    SELECT pv.*, r.name as restaurant_name, r.cuisine_type, r.price_range, r.address
    FROM planned_visits pv
    JOIN restaurants r ON r.id = pv.restaurant_id
  `;
  const params = [];

  if (group_id) {
    sql += ' WHERE pv.group_id = ?';
    params.push(Number(group_id));
  } else {
    sql += ' WHERE pv.user_id = ? AND pv.group_id IS NULL';
    params.push(req.user.id);
  }

  sql += " ORDER BY CASE pv.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END, pv.created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/planned', authenticate, (req, res) => {
  const { restaurant_id, group_id, priority, notes } = req.body;
  if (!restaurant_id) return res.status(400).json({ error: 'Restaurant required' });

  const info = db.prepare(
    'INSERT INTO planned_visits (restaurant_id, user_id, group_id, priority, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(restaurant_id, req.user.id, group_id || null, priority || 'medium', notes || null);

  const planned = db.prepare(`
    SELECT pv.*, r.name as restaurant_name, r.cuisine_type, r.price_range, r.address
    FROM planned_visits pv JOIN restaurants r ON r.id = pv.restaurant_id
    WHERE pv.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json(planned);
});

app.delete('/api/planned/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM planned_visits WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- Suggestions ---
app.get('/api/suggest', authenticate, (req, res) => {
  const { group_id, cuisine, price_range, type, meal_type_id } = req.query;
  if (type === 'meal') {
    const suggestions = suggestMeal(db, {
      userId: req.user.id,
      groupId: group_id ? Number(group_id) : null,
      cuisine: cuisine || null,
      priceRange: price_range || null,
      mealTypeId: meal_type_id ? Number(meal_type_id) : null,
    });
    res.json(suggestions);
  } else {
    const suggestions = getSuggestions(db, {
      userId: req.user.id,
      groupId: group_id ? Number(group_id) : null,
      cuisine: cuisine || null,
      priceRange: price_range || null,
    });
    res.json(suggestions);
  }
});

// --- Profile ---
app.get('/api/profile', authenticate, (req, res) => {
  const profile = db.prepare(
    'SELECT * FROM user_meal_profiles WHERE user_id = ? ORDER BY day_of_week, meal_period'
  ).all(req.user.id);
  res.json(profile);
});

// SPA fallback
app.get('*splat', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const PORT = Number(process.env.PORT) || 3004;
app.listen(PORT, () => console.log(`Food Diary: First Bite running on http://localhost:${PORT}`));

export { db, app };
