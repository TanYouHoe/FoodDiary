// Connector: planned visits.

import { Router } from 'express';
import { checkPlannedInput } from '../../logic/planned.js';
import { canDeletePlanned } from '../../logic/access.js';
import { parseGroupId } from '../../logic/accounts.js';
import { priorityOrderSql } from '../sql.js';
import { pick, PLANNED_FIELDS } from '../rows.js';
import { guardRecord, refuseUnless, badRequest, notAllowed } from '../guards.js';

const PLANNED_SELECT = `
  SELECT pv.*, r.name as restaurant_name, r.cuisine_type, r.price_range, r.address
  FROM planned_visits pv
  JOIN restaurants r ON r.id = pv.restaurant_id
`;

const toPlanned = (row) => pick(row, PLANNED_FIELDS);

export function plannedRoutes({ db, groupAllowed }) {
  const r = Router();
  const plannedRow = db.prepare('SELECT * FROM planned_visits WHERE id = ?');
  const mayDelete = guardRecord((id) => plannedRow.get(id), refuseUnless(canDeletePlanned));

  r.get('/', (req, res) => {
    const group = parseGroupId(req.query.group_id);
    if (!group.ok) return badRequest(res, group.error);
    if (!groupAllowed(group.value, req.user.id)) return notAllowed(res);
    let sql = PLANNED_SELECT;
    const params = [];
    if (group.value !== null) {
      sql += ' WHERE pv.group_id = ?';
      params.push(group.value);
    } else {
      sql += ' WHERE pv.user_id = ? AND pv.group_id IS NULL';
      params.push(req.user.id);
    }
    sql += ` ORDER BY ${priorityOrderSql('pv.priority')}, pv.created_at DESC`;
    res.json(db.prepare(sql).all(...params).map(toPlanned));
  });

  r.post('/', (req, res) => {
    const input = checkPlannedInput(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const v = input.value;
    if (!groupAllowed(v.group_id, req.user.id)) return notAllowed(res);
    const info = db.prepare('INSERT INTO planned_visits (restaurant_id, user_id, group_id, priority, notes) VALUES (?, ?, ?, ?, ?)')
      .run(v.restaurant_id, req.user.id, v.group_id, v.priority, v.notes);
    res.status(201).json(toPlanned(db.prepare(`${PLANNED_SELECT} WHERE pv.id = ?`).get(info.lastInsertRowid)));
  });

  r.delete('/:id', mayDelete, (req, res) => {
    db.prepare('DELETE FROM planned_visits WHERE id = ?').run(req.params.id);
    res.status(204).end();
  });

  return r;
}
