import { useState } from 'react';

export default function MealSlots({ slots, dishes, onChange, disabled }) {
  // dishes = [{name, slot_name}], slots = [{name, required}]
  // We track one input per slot position
  const [inputs, setInputs] = useState(() =>
    slots.map((slot, i) => {
      const match = dishes.find((d, di) =>
        d.slot_name === slot.name && !dishes.slice(0, di).some((prev, pi) =>
          prev.slot_name === slot.name && slots.findIndex((s, si) => si < i && s.name === slot.name) >= pi
        )
      );
      return '';
    })
  );

  // Build filled values per slot index from dishes
  const filledSlots = slots.map((slot, i) => {
    // Count how many of this slot name appear before index i
    const sameSlotsBefore = slots.slice(0, i).filter(s => s.name === slot.name).length;
    // Find the Nth dish matching this slot_name
    let count = 0;
    for (const d of dishes) {
      if (d.slot_name === slot.name) {
        if (count === sameSlotsBefore) return d.name;
        count++;
      }
    }
    return '';
  });

  const updateSlot = (index, value) => {
    const slot = slots[index];
    const sameSlotsBefore = slots.slice(0, index).filter(s => s.name === slot.name).length;

    // Rebuild dishes array
    const newDishes = [];
    const slotCounts = {};
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const pos = (slotCounts[s.name] || 0);
      slotCounts[s.name] = pos + 1;
      const val = i === index ? value : filledSlots[i];
      if (val.trim()) {
        newDishes.push({ name: val.trim(), slot_name: s.name });
      }
    }
    onChange(newDishes);
  };

  const clearSlot = (index) => {
    updateSlot(index, '');
  };

  if (disabled) {
    // Group dishes by slot_name for view mode
    const grouped = {};
    for (const d of dishes) {
      const key = d.slot_name || 'Other';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(d);
    }
    return (
      <div className="meal-slots">
        {Object.entries(grouped).map(([slotName, items]) => (
          <div key={slotName} className="meal-slot-group">
            <span className="slot-label">{slotName}</span>
            <div className="dish-chips">
              {items.map((d, i) => (
                <span key={i} className="dish-chip dish-chip-view">{d.name}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="meal-slots">
      {slots.map((slot, i) => (
        <div key={i} className="meal-slot-row">
          <span className="slot-label">
            {slot.name}
          </span>
          {filledSlots[i] ? (
            <div className="slot-filled">
              <span className="dish-chip">
                {filledSlots[i]}
                <button type="button" className="dish-chip-remove" onClick={() => clearSlot(i)}>&times;</button>
              </span>
            </div>
          ) : (
            <div className="slot-input">
              <input
                type="text"
                value={inputs[i] || ''}
                onChange={(e) => {
                  const newInputs = [...inputs];
                  newInputs[i] = e.target.value;
                  setInputs(newInputs);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (inputs[i]?.trim()) {
                      updateSlot(i, inputs[i]);
                      const newInputs = [...inputs];
                      newInputs[i] = '';
                      setInputs(newInputs);
                    }
                  }
                }}
                placeholder={`Add ${slot.name.toLowerCase()}...`}
              />
              <button
                type="button"
                className="btn-icon-add"
                onClick={() => {
                  if (inputs[i]?.trim()) {
                    updateSlot(i, inputs[i]);
                    const newInputs = [...inputs];
                    newInputs[i] = '';
                    setInputs(newInputs);
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
