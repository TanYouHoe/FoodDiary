// UI connector: the settings popup. Loads the catalogues and the eating
// profile, and runs the meal-type and dish-type changes.

import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { checkDishTypeForm } from '../../logic/catalog.js';
import { catalogChangeRefusal, canListUsers } from '../../logic/access.js';
import { allowedIds } from '../ui/access.js';
import { settingsTabs } from '../ui/settings.js';
import SettingsView, { DishTypeDialog } from '../ui/SettingsView.jsx';
import AccountTabView from '../ui/AccountTabView.jsx';
import AddMealTypeModal from './AddMealTypeModal.jsx';

// kind: 'meal' | 'dish'. The server refuses edit and delete for the same entries.
const canChangeCatalog = (kind) => (user, entry) => catalogChangeRefusal(user, entry, kind, 'edit') === null;

// canInstall, onInstall: the browser's install offer (src/hooks/useInstallPrompt.js, held by App).
export default function SettingsModal({ dark, onToggleDark, canInstall, onInstall, onClose }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('appearance');
  const [mealTypes, setMealTypes] = useState([]);
  const [dishTypes, setDishTypes] = useState([]);
  const [profile, setProfile] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [mealTypeDialog, setMealTypeDialog] = useState(null); // { mealType } while open
  const [confirmMealTypeId, setConfirmMealTypeId] = useState(null);

  const [dishTypeDialog, setDishTypeDialog] = useState(null); // { dishType, name, error, submitting } while open
  const [confirmDishTypeId, setConfirmDishTypeId] = useState(null);

  // Accounts, roles and the authenticator are the shared module's console now.

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

  const removeWith = (call, clearConfirm) => async (id) => {
    try {
      await call(id);
      clearConfirm(null);
      fetchAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const patchDishTypeDialog = (patch) => setDishTypeDialog(d => (d ? { ...d, ...patch } : d));
  const submitDishType = async () => {
    const input = checkDishTypeForm(dishTypeDialog.name);
    if (!input.ok) {
      patchDishTypeDialog({ error: input.error });
      return;
    }
    patchDishTypeDialog({ submitting: true, error: '' });
    try {
      if (dishTypeDialog.dishType) await api.updateDishType(dishTypeDialog.dishType.id, input.value);
      else await api.createDishType(input.value);
      setDishTypeDialog(null);
      fetchAll();
    } catch (err) {
      patchDishTypeDialog({ error: err.message || 'Failed to save', submitting: false });
    }
  };

  return (
    <SettingsView
      tabs={settingsTabs()}
      activeTab={activeTab}
      loading={loading}
      error={error}
      dark={dark}
      canInstall={canInstall}
      mealTypes={mealTypes}
      dishTypes={dishTypes}
      changeableMealTypeIds={allowedIds(user, mealTypes, canChangeCatalog('meal'))}
      changeableDishTypeIds={allowedIds(user, dishTypes, canChangeCatalog('dish'))}
      profile={profile}
      confirmMealTypeId={confirmMealTypeId}
      confirmDishTypeId={confirmDishTypeId}
      mealTypeDialog={mealTypeDialog && (
        <AddMealTypeModal
          mealType={mealTypeDialog.mealType}
          onClose={() => setMealTypeDialog(null)}
          onAdded={() => { setMealTypeDialog(null); fetchAll(); }}
        />
      )}
      dishTypeDialog={dishTypeDialog && (
        <DishTypeDialog
          isEdit={!!dishTypeDialog.dishType}
          name={dishTypeDialog.name}
          error={dishTypeDialog.error}
          submitting={dishTypeDialog.submitting}
          onName={(name) => patchDishTypeDialog({ name })}
          onSubmit={submitDishType}
          onClose={() => setDishTypeDialog(null)}
        />
      )}
      accountTab={<AccountTabView user={user} canManageAccounts={canListUsers(user)} />}
      onTab={setActiveTab}
      onClose={onClose}
      onToggleDark={onToggleDark}
      onInstall={onInstall}
      onAddMealType={() => setMealTypeDialog({ mealType: null })}
      onEditMealType={(mealType) => setMealTypeDialog({ mealType })}
      onAskDeleteMealType={setConfirmMealTypeId}
      onCancelDeleteMealType={() => setConfirmMealTypeId(null)}
      onDeleteMealType={removeWith(api.deleteMealType, setConfirmMealTypeId)}
      onAddDishType={() => setDishTypeDialog({ dishType: null, name: '', error: '', submitting: false })}
      onEditDishType={(dishType) => setDishTypeDialog({ dishType, name: dishType.name, error: '', submitting: false })}
      onAskDeleteDishType={setConfirmDishTypeId}
      onCancelDeleteDishType={() => setConfirmDishTypeId(null)}
      onDeleteDishType={removeWith(api.deleteDishType, setConfirmDishTypeId)}
    />
  );
}
