import { useState, useEffect } from 'react';
import { api } from '../api';
import AddMealTypeModal from '../components/AddMealTypeModal';

export default function MealTypes() {
  const [mealTypes, setMealTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const fetchMealTypes = async () => {
    setLoading(true);
    try {
      const data = await api.getMealTypes();
      setMealTypes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMealTypes(); }, []);

  const handleDelete = async (id) => {
    try {
      await api.deleteMealType(id);
      setConfirmDeleteId(null);
      await fetchMealTypes();
    } catch (err) {
      setError(err.message);
    }
  };

  const openCreate = () => { setEditingType(null); setShowModal(true); };
  const openEdit = (mt) => { setEditingType(mt); setShowModal(true); };

  if (loading) return <div className="loading">Loading meal types...</div>;

  return (
    <div className="meal-types-page">
      <div className="page-header">
        <h2>Meal Types</h2>
        <button className="btn-primary" onClick={openCreate}>+ Create Meal Type</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {(showModal || editingType) && (
        <AddMealTypeModal
          mealType={editingType}
          onClose={() => { setShowModal(false); setEditingType(null); }}
          onAdded={() => { setShowModal(false); setEditingType(null); fetchMealTypes(); }}
        />
      )}

      {mealTypes.length === 0 ? (
        <div className="empty-state">
          <p>No meal types yet. Create one to help the suggestion engine recommend complete meals!</p>
        </div>
      ) : (
        <div className="mt-card-grid">
          {mealTypes.map((mt) => (
            <div key={mt.id} className={`mt-card${mt.is_seed ? ' mt-card-seed' : ''}`}>
              <div className="mt-card-top">
                <h3 className="mt-card-name">{mt.name}</h3>
                <div className="mt-card-actions">
                  {mt.is_seed ? (
                    <span className="mt-lock" title="Built-in">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>
                  ) : (
                    <>
                      <button className="icon-btn icon-btn-edit" onClick={() => openEdit(mt)} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button className="icon-btn icon-btn-delete" onClick={() => setConfirmDeleteId(mt.id)} title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <span className="badge badge-cuisine">{mt.cuisine_type || 'Any'}</span>

              <div className="mt-card-slots">
                {(mt.slots || []).map((slot, i) => (
                  <span key={i} className="mt-slot-pill">
                    {slot.name}
                  </span>
                ))}
              </div>

              {confirmDeleteId === mt.id && (
                <div className="mt-card-confirm">
                  <span>Delete this meal type?</span>
                  <button className="btn-secondary btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                  <button className="btn-danger btn-sm" onClick={() => handleDelete(mt.id)}>Yes</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
