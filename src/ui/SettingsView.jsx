// UI: the settings popup. A tab sidebar and the tabs: appearance, meal types,
// dish types, eating patterns and, for the owner, account invites.
// tabs: settingsTabs (./settings.js). Slots: `mealTypeDialog`, `dishTypeDialog`, `invitesTab`.

import React from 'react';
import { EditIcon, TrashIcon, LockIcon } from './icons.jsx';
import { toPatternRows, PATTERN_PERIOD_LABELS } from './lists.js';
import { INVITES_TAB } from './settings.js';

function EntryDetails({ entry }) {
  return (
    <>
      {entry.cuisine_type && <span className="badge badge-cuisine">{entry.cuisine_type}</span>}
      <div className="settings-item-slots">
        {(entry.slots || []).map((s, i) => (
          <span key={i} className="mt-slot-pill">{s.name}</span>
        ))}
      </div>
    </>
  );
}

// Custom entries above the built-in entries (locked). changeableIds: ids of the
// custom entries that show edit and delete controls.
function CatalogTab({ entries, changeableIds, emptyText, withSlots, confirmId, onAdd, onEdit, onAskDelete, onCancelDelete, onDelete }) {
  const custom = entries.filter(e => !e.is_seed);
  const system = entries.filter(e => e.is_seed);
  return (
    <>
      <div className="settings-group">
        <div className="settings-group-header">
          <span className="settings-group-label">Custom</span>
          <button className="btn-primary btn-sm" onClick={onAdd}>+ Add</button>
        </div>
        {custom.length === 0 ? (
          <div className="settings-group-empty">{emptyText}</div>
        ) : (
          <div className="settings-list">
            {custom.map((entry) => (
              <div key={entry.id} className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-name">{entry.name}</span>
                  {withSlots && <EntryDetails entry={entry} />}
                </div>
                {changeableIds.includes(entry.id) && (
                  <div className="settings-item-actions">
                    <button className="icon-btn icon-btn-edit" onClick={() => onEdit(entry)} title="Edit">
                      <EditIcon size={14} />
                    </button>
                    <button className="icon-btn icon-btn-delete" onClick={() => onAskDelete(entry.id)} title="Delete">
                      <TrashIcon size={14} />
                    </button>
                  </div>
                )}
                {confirmId === entry.id && changeableIds.includes(entry.id) && (
                  <div className="settings-item-confirm">
                    <span>Delete?</span>
                    <button className="btn-secondary btn-sm" onClick={onCancelDelete}>No</button>
                    <button className="btn-danger btn-sm" onClick={() => onDelete(entry.id)}>Yes</button>
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
          {system.map((entry) => (
            <div key={entry.id} className="settings-item settings-item-seed">
              <div className="settings-item-info">
                <span className="settings-item-name">{entry.name}</span>
                {withSlots && <EntryDetails entry={entry} />}
              </div>
              <span className="mt-lock" title="Built-in">
                <LockIcon />
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PatternsTab({ profile }) {
  return (
    <div className="patterns-section">
      <p className="patterns-intro">
        Your eating patterns are learned from your meal history.
        These influence what gets suggested to you.
      </p>
      <div className="patterns-grid">
        <div className="patterns-cell patterns-header"></div>
        {PATTERN_PERIOD_LABELS.map(p => (
          <div key={p} className="patterns-cell patterns-header">{p}</div>
        ))}
        {toPatternRows(profile).map(row => (
          <React.Fragment key={`row-${row.dow}`}>
            <div className="patterns-cell patterns-day">{row.day}</div>
            {row.cells.map(cell => (
              <div key={`${row.dow}-${cell.period}`} className={`patterns-cell ${cell.empty ? 'patterns-cell-empty' : ''}`}>
                {cell.empty ? (
                  <span className="patterns-empty">—</span>
                ) : (
                  <>
                    <div className="patterns-meals">{cell.meals} meals</div>
                    <div className="patterns-price">{cell.price}</div>
                    <div className="patterns-adventure">
                      <div className="patterns-bar">
                        <div className="patterns-bar-fill" style={{ width: `${cell.adventure}%` }} />
                      </div>
                      <span className="patterns-adventure-label">{cell.adventure}% adventurous</span>
                    </div>
                    <div className="patterns-rating">{cell.stars}</div>
                  </>
                )}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function DishTypeDialog({ isEdit, name, error, submitting, onName, onSubmit, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Dish Type' : 'Add Dish Type'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label htmlFor="dt-name">Name *</label>
            <input id="dt-name" type="text" value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Curry, Snack" required autoFocus />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : (isEdit ? 'Save' : 'Add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettingsView({
  tabs, activeTab, loading, error, dark, mealTypes, dishTypes, changeableMealTypeIds, changeableDishTypeIds, profile,
  confirmMealTypeId, confirmDishTypeId, mealTypeDialog, dishTypeDialog, invitesTab,
  onTab, onClose, onToggleDark,
  onAddMealType, onEditMealType, onAskDeleteMealType, onCancelDeleteMealType, onDeleteMealType,
  onAddDishType, onEditDishType, onAskDeleteDishType, onCancelDeleteDishType, onDeleteDishType,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-popup" onClick={(e) => e.stopPropagation()}>

        <div className="settings-sidebar">
          <h3 className="settings-sidebar-title">Settings</h3>
          <nav className="settings-nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`settings-nav-item${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => onTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="settings-content">
          <div className="settings-content-header">
            <h3>{tabs.find(t => t.id === activeTab)?.label}</h3>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>

          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <div className="settings-content-body">
              {error && <div className="error-message">{error}</div>}

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

              {activeTab === 'meal-types' && (
                <>
                  {mealTypeDialog}
                  <CatalogTab
                    entries={mealTypes}
                    changeableIds={changeableMealTypeIds}
                    emptyText="No custom meal types yet"
                    withSlots
                    confirmId={confirmMealTypeId}
                    onAdd={onAddMealType}
                    onEdit={onEditMealType}
                    onAskDelete={onAskDeleteMealType}
                    onCancelDelete={onCancelDeleteMealType}
                    onDelete={onDeleteMealType}
                  />
                </>
              )}

              {activeTab === 'dish-types' && (
                <>
                  {dishTypeDialog}
                  <CatalogTab
                    entries={dishTypes}
                    changeableIds={changeableDishTypeIds}
                    emptyText="No custom dish types yet"
                    confirmId={confirmDishTypeId}
                    onAdd={onAddDishType}
                    onEdit={onEditDishType}
                    onAskDelete={onAskDeleteDishType}
                    onCancelDelete={onCancelDeleteDishType}
                    onDelete={onDeleteDishType}
                  />
                </>
              )}

              {activeTab === 'patterns' && <PatternsTab profile={profile} />}

              {activeTab === INVITES_TAB.id && invitesTab}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
