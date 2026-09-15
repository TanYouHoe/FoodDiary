// Connector: SQL fragments built from Logic constants, so a rule written in
// logic/ is not written a second time inside a query string.

import { PRIORITIES } from '../logic/planned.js';

// ORDER BY expression: high first, then medium, then low.
export function priorityOrderSql(column) {
  return `CASE ${column} ${PRIORITIES.map((p, i) => `WHEN '${p}' THEN ${i}`).join(' ')} END`;
}
