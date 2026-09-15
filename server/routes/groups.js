// Connector: groups, invite codes and members.

import { Router } from 'express';
import crypto from 'node:crypto';
import { checkGroupName, checkInviteCode, parseGroupId, OWNER_ROLE, INVITE_CODE_BYTES } from '../../logic/accounts.js';
import { pick, GROUP_FIELDS, GROUP_MEMBER_FIELDS } from '../rows.js';
import { badRequest, notAllowed } from '../guards.js';

const newInviteCode = () => crypto.randomBytes(INVITE_CODE_BYTES).toString('hex');
const toGroup = (row) => pick(row, GROUP_FIELDS);

export function groupRoutes({ db, groupAllowed }) {
  const r = Router();
  const getById = db.prepare('SELECT * FROM groups_ WHERE id = ?');

  r.get('/', (req, res) => {
    const rows = db.prepare(`
      SELECT g.*, gm.role,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
      FROM groups_ g
      JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
      ORDER BY g.created_at DESC
    `).all(req.user.id);
    res.json(rows.map(row => ({ ...toGroup(row), role: row.role, member_count: row.member_count })));
  });

  r.post('/', (req, res) => {
    const input = checkGroupName(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const info = db.prepare('INSERT INTO groups_ (name, invite_code, created_by) VALUES (?, ?, ?)')
      .run(input.value.name, newInviteCode(), req.user.id);
    db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)')
      .run(info.lastInsertRowid, req.user.id, OWNER_ROLE);
    res.status(201).json(toGroup(getById.get(info.lastInsertRowid)));
  });

  r.get('/:id/members', (req, res) => {
    const group = parseGroupId(req.params.id);
    if (!group.ok) return badRequest(res, group.error);
    if (!groupAllowed(group.value, req.user.id)) return notAllowed(res);
    const rows = db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_url, gm.role, gm.joined_at
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY gm.joined_at
    `).all(group.value);
    res.json(rows.map(row => pick(row, GROUP_MEMBER_FIELDS)));
  });

  r.post('/join', (req, res) => {
    const input = checkInviteCode(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const group = db.prepare('SELECT * FROM groups_ WHERE invite_code = ?').get(input.value.invite_code);
    if (!group) return res.status(404).json({ error: 'Invalid invite code' });
    const member = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, req.user.id);
    if (member) return res.status(409).json({ error: 'Already a member' });
    db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(group.id, req.user.id);
    res.status(201).json(toGroup(group));
  });

  return r;
}
