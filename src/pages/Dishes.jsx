// UI connector: the dishes page. Loads the dish summary; holds the filters.

import { useState, useEffect } from 'react';
import { api } from '../api';
import { DishesView } from '../ui/PageViews.jsx';

export default function Dishes() {
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    api.getDishes()
      .then(data => setDishes(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <DishesView
      loading={loading}
      dishes={dishes}
      search={search}
      category={category}
      onSearch={setSearch}
      onCategory={setCategory}
    />
  );
}
