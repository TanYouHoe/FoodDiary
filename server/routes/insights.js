// Connector: suggestions and the learned eating profile.

import { Router } from 'express';
import { getSuggestions, suggestMeal } from '../suggestions.js';
import { listProfile } from '../profile-store.js';
import { parseGroupId } from '../../logic/accounts.js';
import { badRequest, notAllowed } from '../guards.js';

export function suggestRoutes({ db, now, rng, groupAllowed }) {
  const r = Router();
  r.get('/', (req, res) => {
    const { cuisine, price_range, type } = req.query;
    const group = parseGroupId(req.query.group_id);
    if (!group.ok) return badRequest(res, group.error);
    if (!groupAllowed(group.value, req.user.id)) return notAllowed(res);
    const opts = {
      userId: req.user.id,
      groupId: group.value,
      cuisine: cuisine || null,
      priceRange: price_range || null,
      now: now(),
    };
    res.json(type === 'meal' ? suggestMeal(db, { ...opts, rng }) : getSuggestions(db, opts));
  });
  return r;
}

export function profileRoutes({ db }) {
  const r = Router();
  r.get('/', (req, res) => res.json(listProfile(db, req.user.id)));
  return r;
}
