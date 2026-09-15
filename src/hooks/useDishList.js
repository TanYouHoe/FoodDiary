// UI connector: the dish editor's input, chosen category and drag state.
// The dish list itself belongs to the caller (dishes + onChange).

import { useState } from 'react';
import { addDish, moveDish, DEFAULT_DISH_CATEGORY } from '../../logic/dishes.js';

export function useDishList({ dishes, onChange }) {
  const [input, setInput] = useState('');
  const [category, setCategory] = useState(DEFAULT_DISH_CATEGORY);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverCategory, setDragOverCategory] = useState(null);

  const add = () => {
    const next = addDish(dishes, input, category);
    if (next === dishes) return;
    onChange(next);
    setInput('');
  };

  return {
    input,
    category,
    dragIndex,
    dragOverCategory,
    setInput,
    setCategory,
    add,
    remove: (index) => onChange(dishes.filter((_, i) => i !== index)),
    startDrag: setDragIndex,
    endDrag: () => { setDragIndex(null); setDragOverCategory(null); },
    dragOver: setDragOverCategory,
    dragLeave: () => setDragOverCategory(null),
    dropOn: (targetCategory) => {
      if (dragIndex == null) return;
      const next = moveDish(dishes, dragIndex, targetCategory);
      if (next !== dishes) onChange(next);
      setDragIndex(null);
      setDragOverCategory(null);
    },
  };
}
