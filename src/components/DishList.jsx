import { useState, useRef } from 'react';

const CATEGORIES = [
  { value: 'main', label: 'Main Dish' },
  { value: 'side', label: 'Side' },
  { value: 'soup', label: 'Soup' },
  { value: 'rice', label: 'Rice' },
  { value: 'noodle', label: 'Noodle' },
  { value: 'bread', label: 'Bread' },
  { value: 'appetizer', label: 'Appetizer' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'drink', label: 'Drink' },
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

export default function DishList({ dishes, onChange, disabled }) {
  // dishes: Array<{ name: string, category: string }>
  const [input, setInput] = useState('');
  const [category, setCategory] = useState('main');
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverCategory, setDragOverCategory] = useState(null);
  const dragNode = useRef(null);

  const addDish = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (dishes.some(d => d.name === trimmed)) return;
    onChange([...dishes, { name: trimmed, category }]);
    setInput('');
  };

  const removeDish = (index) => {
    onChange(dishes.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDish();
    }
  };

  // --- Drag and drop ---
  const handleDragStart = (e, index) => {
    setDragIndex(index);
    dragNode.current = e.target;
    e.target.classList.add('dish-chip-dragging');
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    if (dragNode.current) {
      dragNode.current.classList.remove('dish-chip-dragging');
    }
    setDragIndex(null);
    setDragOverCategory(null);
    dragNode.current = null;
  };

  const handleCategoryDragOver = (e, cat) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCategory(cat);
  };

  const handleCategoryDrop = (e, targetCategory) => {
    e.preventDefault();
    if (dragIndex == null) return;
    const dish = dishes[dragIndex];
    if (dish.category !== targetCategory) {
      const updated = dishes.map((d, i) =>
        i === dragIndex ? { ...d, category: targetCategory } : d
      );
      onChange(updated);
    }
    setDragIndex(null);
    setDragOverCategory(null);
  };

  // Group dishes by category (only categories that have dishes)
  const grouped = {};
  dishes.forEach((dish, idx) => {
    const cat = dish.category || 'main';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ ...dish, _index: idx });
  });

  // Order categories according to CATEGORIES order
  const orderedCategories = CATEGORIES.map(c => c.value).filter(c => grouped[c]);

  return (
    <div className="dish-list">
      {orderedCategories.length > 0 && (
        <div className="dish-groups">
          {orderedCategories.map(cat => (
            <div
              key={cat}
              className={`dish-group${dragOverCategory === cat ? ' dish-group-dragover' : ''}`}
              onDragOver={(e) => handleCategoryDragOver(e, cat)}
              onDragLeave={() => setDragOverCategory(null)}
              onDrop={(e) => handleCategoryDrop(e, cat)}
            >
              <span className="dish-group-label">{CATEGORY_LABELS[cat]}</span>
              <div className="dish-chips">
                {grouped[cat].map((dish) => (
                  <span
                    key={dish._index}
                    className="dish-chip"
                    draggable={!disabled}
                    onDragStart={(e) => handleDragStart(e, dish._index)}
                    onDragEnd={handleDragEnd}
                  >
                    {dish.name}
                    {!disabled && (
                      <button type="button" className="dish-chip-remove" onClick={() => removeDish(dish._index)}>&times;</button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="dish-input-row">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a dish name"
          />
          <select
            className="dish-category-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <button type="button" className="btn-icon-add" onClick={addDish} title="Add dish">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}
