// UI connector: the dashboard. Loads meals, meal types and groups; asks for
// suggestions with the chosen filters.

import { useState, useEffect } from 'react';
import { api } from '../api';
import DashboardView from '../ui/DashboardView.jsx';
import AddMealModal from '../widgets/AddMealModal';
import MealDetailModal from '../widgets/MealDetailModal';
import PhotoCarousel from '../widgets/PhotoCarousel';

export default function Dashboard() {
  const [filters, setFilters] = useState({ cuisine: '', priceRange: '', mealTypeId: '', mode: 'personal', groupId: '' });
  const [mealTypes, setMealTypes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const [meals, setMeals] = useState([]);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);

  const fetchMeals = async () => {
    setMealsLoading(true);
    try {
      setMeals(await api.getMeals());
    } catch {
      // the timeline stays as it was
    } finally {
      setMealsLoading(false);
    }
  };

  useEffect(() => {
    fetchMeals();
    api.getMealTypes().then(setMealTypes).catch(() => {});
    api.getGroups().then(setGroups).catch(() => {});
  }, []);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError('');
    setHasSearched(true);
    try {
      const params = {};
      if (filters.cuisine) params.cuisine = filters.cuisine;
      if (filters.priceRange) params.price_range = filters.priceRange;
      if (filters.mode === 'group' && filters.groupId) params.group_id = filters.groupId;
      params.type = 'meal';
      if (filters.mealTypeId) params.meal_type_id = filters.mealTypeId;
      setSuggestions(await api.getSuggestions(params));
    } catch (err) {
      setError(err.message || 'Failed to fetch suggestions');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardView
      filters={filters}
      mealTypes={mealTypes}
      groups={groups}
      suggestions={suggestions}
      loading={loading}
      error={error}
      hasSearched={hasSearched}
      meals={meals}
      mealsLoading={mealsLoading}
      now={new Date()}
      addMealDialog={showAddMeal && (
        <AddMealModal onClose={() => setShowAddMeal(false)} onAdded={fetchMeals} />
      )}
      mealDialog={selectedMeal && (
        <MealDetailModal
          meal={selectedMeal}
          onClose={() => setSelectedMeal(null)}
          onUpdated={fetchMeals}
          onDeleted={fetchMeals}
        />
      )}
      renderPhotos={(urls) => <PhotoCarousel urls={urls} />}
      onFilter={(key, value) => setFilters(f => ({ ...f, [key]: value }))}
      onSuggest={fetchSuggestions}
      onDismiss={(index) => setSuggestions(prev => prev.filter((_, i) => i !== index))}
      onLogMeal={() => setShowAddMeal(true)}
      onSelectMeal={setSelectedMeal}
    />
  );
}
