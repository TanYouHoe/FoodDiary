import { useState, useEffect } from 'react';
import { api } from '../api';

export default function DishTypes() {
  const [dishTypes, setDishTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDT, setEditingDT] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [dtName, setDtName] = useState('');
  const [dtError, setDtError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDishTypes = async () => {
    setLoading(true);
    try {
      const data = await api.getDishTypes();
      setDishTypes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDishTypes(); }, []);

  const openCreate = () => { setEditingDT(null); setDtName(''); setDtError(''); setShowModal(true); };
  const openEdit = (dt) => { setEditingDT(dt); setDtName(dt.name); setDtError(''); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditingDT(null); setDtName(''); setDtError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dtName.trim()) { setDtError('Name is required'); return; }
    setSubmitting(true);
    setDtError('');
    try {
      if (editingDT) {
        await api.updateDishType(editingDT.id, { name: dtName.trim() });
      } else {
        await api.createDishType({ name: dtName.trim() });
      }
      closeModal();
      fetchDishTypes();
    } catch (err) {
      setDtError(err.message || 'Failed to save dish type');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteDishType(id);
      setConfirmDeleteId(null);
      fetchDishTypes();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="loading">Loading dish types...</div>;

  return (
    <div className="meal-types-page">
      <div className="page-header">
        <h2>Dish Types</h2>
        <button className="btn-primary" onClick={openCreate}>+ Add Dish Type</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingDT ? 'Edit Dish Type' : 'Create Dish Type'}</h3>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              {dtError && <div className="error-message">{dtError}</div>}
              <div className="form-group">
                <label htmlFor="dt-name">Name *</label>
                <input id="dt-name" type="text" value={dtName} onChange={(e) => setDtName(e.target.value)} placeholder="e.g. Curry, Snack" required autoFocus />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? (editingDT ? 'Saving...' : 'Creating...') : (editingDT ? 'Save Changes' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dishTypes.length === 0 ? (
        <div className="empty-state">
          <p>No dish types yet.</p>
        </div>
      ) : (
        <div className="mt-card-grid">
          {dishTypes.map((dt) => (
            <div key={dt.id} className={`mt-card${dt.is_seed ? ' mt-card-seed' : ''}`}>
              <div className="mt-card-top">
                <h3 className="mt-card-name">{dt.name}</h3>
                <div className="mt-card-actions">
                  {dt.is_seed ? (
                    <span className="mt-lock" title="Built-in">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>
                  ) : (
                    <>
                      <button className="icon-btn icon-btn-edit" onClick={() => openEdit(dt)} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button className="icon-btn icon-btn-delete" onClick={() => setConfirmDeleteId(dt.id)} title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {confirmDeleteId === dt.id && (
                <div className="mt-card-confirm">
                  <span>Delete this dish type?</span>
                  <button className="btn-secondary btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                  <button className="btn-danger btn-sm" onClick={() => handleDelete(dt.id)}>Yes</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
