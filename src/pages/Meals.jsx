// UI connector: the meals page. Loads meals and restaurants; opens the dialogs.

import { useState, useEffect } from 'react';
import { api } from '../api';
import { MealsView } from '../ui/PageViews.jsx';
import AddMealModal from '../widgets/AddMealModal';
import MealDetailModal from '../widgets/MealDetailModal';

export default function Meals() {
  const [meals, setMeals] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [m, r] = await Promise.all([api.getMeals(), api.getRestaurants()]);
      setMeals(m);
      setRestaurants(r);
    } catch {
      // the list stays as it was
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <MealsView
      loading={loading}
      meals={meals}
      restaurants={restaurants}
      addDialog={showModal && (
        <AddMealModal onClose={() => setShowModal(false)} onAdded={fetchData} />
      )}
      detailDialog={selectedMeal && (
        <MealDetailModal
          meal={selectedMeal}
          onClose={() => setSelectedMeal(null)}
          onUpdated={fetchData}
          onDeleted={() => { setSelectedMeal(null); fetchData(); }}
        />
      )}
      onLogMeal={() => setShowModal(true)}
      onSelect={setSelectedMeal}
    />
  );
}
