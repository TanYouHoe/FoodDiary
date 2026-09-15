// UI connector: loads the dish type names from the server once per mount.
// Returns [] until they arrive, or when the request fails.

import { useState, useEffect } from 'react';
import { api } from '../api.js';

export function useDishTypeNames() {
  const [names, setNames] = useState([]);

  useEffect(() => {
    let active = true;
    api.getDishTypes()
      .then(types => { if (active && Array.isArray(types)) setNames(types.map(t => t.name)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return names;
}
