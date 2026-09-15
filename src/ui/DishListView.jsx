// UI: dish chips grouped by category, with drag between categories, and the
// add-dish row. `categoryOptions`: [{ value, label }] from dishCategoryOptions.

import { groupDishes } from './dishes.js';
import { PlusIcon } from './icons.jsx';

export default function DishListView({
  dishes, categoryOptions, disabled, input, category, dragIndex, dragOverCategory,
  onInput, onCategory, onAdd, onRemove, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}) {
  const groups = groupDishes(dishes);

  return (
    <div className="dish-list">
      {groups.length > 0 && (
        <div className="dish-groups">
          {groups.map(group => (
            <div
              key={group.category}
              className={`dish-group${dragOverCategory === group.category ? ' dish-group-dragover' : ''}`}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(group.category); }}
              onDragLeave={onDragLeave}
              onDrop={(e) => { e.preventDefault(); onDrop(group.category); }}
            >
              <span className="dish-group-label">{group.label}</span>
              <div className="dish-chips">
                {group.dishes.map((dish) => (
                  <span
                    key={dish.index}
                    className={`dish-chip${dragIndex === dish.index ? ' dish-chip-dragging' : ''}`}
                    draggable={!disabled}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(dish.index); }}
                    onDragEnd={onDragEnd}
                  >
                    {dish.name}
                    {!disabled && (
                      <button type="button" className="dish-chip-remove" onClick={() => onRemove(dish.index)}>&times;</button>
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
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
            placeholder="Type a dish name"
          />
          <select
            className="dish-category-select"
            value={category}
            onChange={(e) => onCategory(e.target.value)}
          >
            {categoryOptions.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <button type="button" className="btn-icon-add" onClick={onAdd} title="Add dish">
            <PlusIcon />
          </button>
        </div>
      )}
    </div>
  );
}
