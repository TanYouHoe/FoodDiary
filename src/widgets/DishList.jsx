// UI connector: joins the dish editor state and the dish types to the view.

import { useDishList } from '../hooks/useDishList.js';
import { useDishTypeNames } from '../hooks/useDishTypes.js';
import { dishCategoryOptions } from '../ui/dishes.js';
import DishListView from '../ui/DishListView.jsx';

export default function DishList({ dishes, onChange, disabled }) {
  const d = useDishList({ dishes, onChange });
  const typeNames = useDishTypeNames();
  return (
    <DishListView
      dishes={dishes}
      categoryOptions={dishCategoryOptions(typeNames)}
      disabled={disabled}
      input={d.input}
      category={d.category}
      dragIndex={d.dragIndex}
      dragOverCategory={d.dragOverCategory}
      onInput={d.setInput}
      onCategory={d.setCategory}
      onAdd={d.add}
      onRemove={d.remove}
      onDragStart={d.startDrag}
      onDragEnd={d.endDrag}
      onDragOver={d.dragOver}
      onDragLeave={d.dragLeave}
      onDrop={d.dropOn}
    />
  );
}
