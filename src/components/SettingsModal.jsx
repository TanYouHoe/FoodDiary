import React, { useState, useEffect } from 'react';
import { api } from '../api';
import AddMealTypeModal from './AddMealTypeModal';

const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'meal-types', label: 'Meal Types' },
  { id: 'dish-types', label: 'Dish Types' },
  { id: 'patterns', label: 'Eating Patterns' },
];

export default function SettingsModal({ dark, onToggleDark, onClose }) {
  const [activeTab, setActiveTab] = useState('appearance');

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

  // --- Eating Patterns ---
  const [profile, setProfile] = useState([]);

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

  useEffect(() => {
    fetchAll();
    api.getProfile().then(data => setProfile(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-popup" onClick={(e) => e.stopPropagation()}>

        {/* Sidebar */}
        <div className="settings-sidebar">
          <h3 className="settings-sidebar-title">Settings</h3>
          <nav className="settings-nav">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`settings-nav-item${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="settings-content">
          <div className="settings-content-header">
            <h3>{TABS.find(t => t.id === activeTab)?.label}</h3>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>

          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <div className="settings-content-body">
              {error && <div className="error-message">{error}</div>}

              {/* --- Appearance Tab --- */}
              {activeTab === 'appearance' && (
                <div className="settings-list">
                  <div className="settings-item">
                    <div className="settings-item-info">
                      <span className="settings-item-name">Dark Mode</span>
                      <span className="settings-item-desc">{dark ? 'Currently using dark theme' : 'Currently using light theme'}</span>
                    </div>
                    <div className="settings-item-actions">
                      <button className="theme-toggle-lg" onClick={onToggleDark}>
                        {dark ? '☀️ Light' : '🌙 Dark'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* --- Meal Types Tab --- */}
              {activeTab === 'meal-types' && (
                <>
                  {(showMTModal || editingMT) && (
                    <AddMealTypeModal
                      mealType={editingMT}
                      onClose={closeMTModal}
                      onAdded={() => { closeMTModal(); fetchAll(); }}
                    />
                  )}

                  <div className="settings-group">
                    <div className="settings-group-header">
                      <span className="settings-group-label">Custom</span>
                      <button className="btn-primary btn-sm" onClick={openCreateMT}>+ Add</button>
                    </div>
                    {mealTypes.filter(mt => !mt.is_seed).length === 0 ? (
                      <div className="settings-group-empty">No custom meal types yet</div>
                    ) : (
                      <div className="settings-list">
                        {mealTypes.filter(mt => !mt.is_seed).map((mt) => (
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
                              <button className="icon-btn icon-btn-edit" onClick={() => openEditMT(mt)} title="Edit">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                              </button>
                              <button className="icon-btn icon-btn-delete" onClick={() => setConfirmDeleteMTId(mt.id)} title="Delete">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </button>
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
                    )}
                  </div>

                  <div className="settings-separator" />

                  <div className="settings-group">
                    <div className="settings-group-header">
                      <span className="settings-group-label">System</span>
                    </div>
                    <div className="settings-list">
                      {mealTypes.filter(mt => mt.is_seed).map((mt) => (
                        <div key={mt.id} className="settings-item settings-item-seed">
                          <div className="settings-item-info">
                            <span className="settings-item-name">{mt.name}</span>
                            {mt.cuisine_type && <span className="badge badge-cuisine">{mt.cuisine_type}</span>}
                            <div className="settings-item-slots">
                              {(mt.slots || []).map((s, i) => (
                                <span key={i} className="mt-slot-pill">{s.name}</span>
                              ))}
                            </div>
                          </div>
                          <span className="mt-lock" title="Built-in">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* --- Dish Types Tab --- */}
              {activeTab === 'dish-types' && (
                <>
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

                  <div className="settings-group">
                    <div className="settings-group-header">
                      <span className="settings-group-label">Custom</span>
                      <button className="btn-primary btn-sm" onClick={openCreateDT}>+ Add</button>
                    </div>
                    {dishTypes.filter(dt => !dt.is_seed).length === 0 ? (
                      <div className="settings-group-empty">No custom dish types yet</div>
                    ) : (
                      <div className="settings-list">
                        {dishTypes.filter(dt => !dt.is_seed).map((dt) => (
                          <div key={dt.id} className="settings-item">
                            <div className="settings-item-info">
                              <span className="settings-item-name">{dt.name}</span>
                            </div>
                            <div className="settings-item-actions">
                              <button className="icon-btn icon-btn-edit" onClick={() => openEditDT(dt)} title="Edit">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                              </button>
                              <button className="icon-btn icon-btn-delete" onClick={() => setConfirmDeleteDTId(dt.id)} title="Delete">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </button>
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
                    )}
                  </div>

                  <div className="settings-separator" />

                  <div className="settings-group">
                    <div className="settings-group-header">
                      <span className="settings-group-label">System</span>
                    </div>
                    <div className="settings-list">
                      {dishTypes.filter(dt => dt.is_seed).map((dt) => (
                        <div key={dt.id} className="settings-item settings-item-seed">
                          <div className="settings-item-info">
                            <span className="settings-item-name">{dt.name}</span>
                          </div>
                          <span className="mt-lock" title="Built-in">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* --- Eating Patterns Tab --- */}
              {activeTab === 'patterns' && (
                <div className="patterns-section">
                  <p className="patterns-intro">
                    Your eating patterns are learned from your meal history.
                    These influence what gets suggested to you.
                  </p>
                  <div className="patterns-grid">
                    {/* Header row */}
                    <div className="patterns-cell patterns-header"></div>
                    {['Breakfast', 'Lunch', 'Tea', 'Dinner', 'Supper'].map(p => (
                      <div key={p} className="patterns-cell patterns-header">{p}</div>
                    ))}
                    {/* Data rows */}
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, dow) => (
                      <React.Fragment key={`row-${dow}`}>
                        <div className="patterns-cell patterns-day">{day}</div>
                        {['breakfast', 'lunch', 'tea', 'dinner', 'supper'].map(period => {
                          const row = profile.find(p => p.day_of_week === dow && p.meal_period === period);
                          return (
                            <div key={`${dow}-${period}`} className={`patterns-cell ${row ? '' : 'patterns-cell-empty'}`}>
                              {row ? (
                                <>
                                  <div className="patterns-meals">{row.total_meals} meals</div>
                                  <div className="patterns-price">{'$'.repeat(Math.round(row.avg_price_range || 0))}</div>
                                  <div className="patterns-adventure">
                                    <div className="patterns-bar">
                                      <div className="patterns-bar-fill" style={{ width: `${Math.round(row.adventure_ratio * 100)}%` }} />
                                    </div>
                                    <span className="patterns-adventure-label">{Math.round(row.adventure_ratio * 100)}% adventurous</span>
                                  </div>
                                  <div className="patterns-rating">{'★'.repeat(Math.round(row.avg_rating_threshold))}{'☆'.repeat(5 - Math.round(row.avg_rating_threshold))}</div>
                                </>
                              ) : (
                                <span className="patterns-empty">—</span>
                              )}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
