import { useState, useEffect } from 'react';
import { api } from '../api';
import AddMealTypeModal from '../components/AddMealTypeModal';

export default function Settings() {
  // --- Meal Types ---
  const [mealTypes, setMealTypes] = useState([]);
  const [showMTModal, setShowMTModal] = useState(false);
  const [editingMT, setEditingMT] = useState(null);
  const [confirmDeleteMTId, setConfirmDeleteMTId] = useState(null);

  // --- Dish Types ---
  const [dishTypes, setDishTypes] = useState([]);
  const [showDTModal, setShowDTModal] = useState(false);
  const [editingDT, setEditingDT] = useState(null);
  const [confirmDeleteDTId, setConfirmDeleteDTId] = useState(null);
  const [dtName, setDtName] = useState('');
  const [dtError, setDtError] = useState('');
  const [dtSubmitting, setDtSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [mt, dt] = await Promise.all([api.getMealTypes(), api.getDishTypes()]);
      setMealTypes(Array.isArray(mt) ? mt : []);
      setDishTypes(Array.isArray(dt) ? dt : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // Meal Type handlers
  const openCreateMT = () => { setEditingMT(null); setShowMTModal(true); };
  const openEditMT = (mt) => { setEditingMT(mt); setShowMTModal(true); };
  const closeMTModal = () => { setShowMTModal(false); setEditingMT(null); };
  const handleDeleteMT = async (id) => {
    try { await api.deleteMealType(id); setConfirmDeleteMTId(null); fetchAll(); }
    catch (err) { setError(err.message); }
  };

  // Dish Type handlers
  const openCreateDT = () => { setEditingDT(null); setDtName(''); setDtError(''); setShowDTModal(true); };
  const openEditDT = (dt) => { setEditingDT(dt); setDtName(dt.name); setDtError(''); setShowDTModal(true); };
  const closeDTModal = () => { setShowDTModal(false); setEditingDT(null); setDtName(''); setDtError(''); };
  const handleDTSubmit = async (e) => {
    e.preventDefault();
    if (!dtName.trim()) { setDtError('Name is required'); return; }
    setDtSubmitting(true); setDtError('');
    try {
      if (editingDT) { await api.updateDishType(editingDT.id, { name: dtName.trim() }); }
      else { await api.createDishType({ name: dtName.trim() }); }
      closeDTModal(); fetchAll();
    } catch (err) { setDtError(err.message || 'Failed to save'); }
    finally { setDtSubmitting(false); }
  };
  const handleDeleteDT = async (id) => {
    try { await api.deleteDishType(id); setConfirmDeleteDTId(null); fetchAll(); }
    catch (err) { setError(err.message); }
  };

  if (loading) return <div className="loading">Loading settings...</div>;

  return (
    <div className="settings-page">
      <h2>Settings</h2>

      {error && <div className="error-message">{error}</div>}

      {/* --- Meal Types Section --- */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h3>Meal Types</h3>
          <button className="btn-primary btn-sm" onClick={openCreateMT}>+ Add</button>
        </div>

        {(showMTModal || editingMT) && (
          <AddMealTypeModal
            mealType={editingMT}
            onClose={closeMTModal}
            onAdded={() => { closeMTModal(); fetchAll(); }}
          />
        )}

        <div className="settings-list">
          {mealTypes.map((mt) => (
            <div key={mt.id} className="settings-item">
              <div className="settings-item-info">
                <span className="settings-item-name">{mt.name}</span>
                {mt.cuisine_type && <span className="badge badge-cuisine">{mt.cuisine_type}</span>}
                <div className="settings-item-slots">
                  {(mt.slots || []).map((s, i) => (
                    <span key={i} className="mt-slot-pill">{s.name}</span>
                  ))}
                </div>
              </div>
              <div className="settings-item-actions">
                {mt.is_seed ? (
                  <span className="mt-lock" title="Built-in">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                ) : (
                  <>
                    <button className="icon-btn icon-btn-edit" onClick={() => openEditMT(mt)} title="Edit">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button className="icon-btn icon-btn-delete" onClick={() => setConfirmDeleteMTId(mt.id)} title="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  </>
                )}
              </div>
              {confirmDeleteMTId === mt.id && (
                <div className="settings-item-confirm">
                  <span>Delete?</span>
                  <button className="btn-secondary btn-sm" onClick={() => setConfirmDeleteMTId(null)}>No</button>
                  <button className="btn-danger btn-sm" onClick={() => handleDeleteMT(mt.id)}>Yes</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* --- Dish Types Section --- */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h3>Dish Types</h3>
          <button className="btn-primary btn-sm" onClick={openCreateDT}>+ Add</button>
        </div>

        {showDTModal && (
          <div className="modal-overlay" onClick={closeDTModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{editingDT ? 'Edit Dish Type' : 'Add Dish Type'}</h3>
                <button className="modal-close" onClick={closeDTModal}>&times;</button>
              </div>
              <form onSubmit={handleDTSubmit}>
                {dtError && <div className="error-message">{dtError}</div>}
                <div className="form-group">
                  <label htmlFor="dt-name">Name *</label>
                  <input id="dt-name" type="text" value={dtName} onChange={(e) => setDtName(e.target.value)} placeholder="e.g. Curry, Snack" required autoFocus />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={closeDTModal}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={dtSubmitting}>
                    {dtSubmitting ? 'Saving...' : (editingDT ? 'Save' : 'Add')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="settings-list">
          {dishTypes.map((dt) => (
            <div key={dt.id} className="settings-item">
              <div className="settings-item-info">
                <span className="settings-item-name">{dt.name}</span>
              </div>
              <div className="settings-item-actions">
                {dt.is_seed ? (
                  <span className="mt-lock" title="Built-in">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                ) : (
                  <>
                    <button className="icon-btn icon-btn-edit" onClick={() => openEditDT(dt)} title="Edit">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button className="icon-btn icon-btn-delete" onClick={() => setConfirmDeleteDTId(dt.id)} title="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  </>
                )}
              </div>
              {confirmDeleteDTId === dt.id && (
                <div className="settings-item-confirm">
                  <span>Delete?</span>
                  <button className="btn-secondary btn-sm" onClick={() => setConfirmDeleteDTId(null)}>No</button>
                  <button className="btn-danger btn-sm" onClick={() => handleDeleteDT(dt.id)}>Yes</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
