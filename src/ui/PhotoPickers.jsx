// UI: the photo drop areas. Tap to browse, or drag files in.
// `picker` carries { previews, dragging, inputRef } and the event callbacks
// { onBrowse, onDragState, onDrop, onChoose, onRemove }.

import { MAX_MEAL_PHOTOS } from '../../logic/meals.js';

function dropZoneHandlers(picker) {
  return {
    onClick: picker.onBrowse,
    onDragOver: (e) => { e.preventDefault(); picker.onDragState(true); },
    onDragEnter: (e) => { e.preventDefault(); picker.onDragState(true); },
    onDragLeave: () => picker.onDragState(false),
    onDrop: (e) => { e.preventDefault(); picker.onDrop([...e.dataTransfer.files]); },
  };
}

// Many photos: saved ones first, then the newly picked ones (removable).
export function MultiPhotoPicker({ inputId, picker, existingUrls = [], newAlt }) {
  const total = existingUrls.length + picker.previews.length;
  return (
    <div
      className={`photo-upload-hero${total > 0 ? ' has-photo' : ''}${picker.dragging ? ' dragging' : ''}`}
      {...dropZoneHandlers(picker)}
    >
      {total > 0 ? (
        <div className="photo-grid-preview">
          {existingUrls.map((url, i) => (
            <div key={`existing-${i}`} className="photo-grid-item">
              <img src={url} alt={`Photo ${i + 1}`} />
            </div>
          ))}
          {picker.previews.map((url, i) => (
            <div key={url} className="photo-grid-item">
              <img src={url} alt={`${newAlt} ${i + 1}`} />
              <button
                type="button"
                className="photo-remove-mini"
                onClick={(e) => { e.stopPropagation(); picker.onRemove(i); }}
              >
                &times;
              </button>
            </div>
          ))}
          {total < MAX_MEAL_PHOTOS && (
            <div className="photo-grid-add">
              <span>+</span>
            </div>
          )}
        </div>
      ) : (
        <div className="photo-placeholder">
          <span className="photo-icon">{picker.dragging ? '📥' : '📸'}</span>
          <span className="photo-label">{picker.dragging ? 'Drop photos here' : `Tap or drag photos here (up to ${MAX_MEAL_PHOTOS})`}</span>
        </div>
      )}
      <input
        id={inputId}
        ref={picker.inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => { picker.onChoose([...(e.target.files || [])]); e.target.value = ''; }}
        hidden
      />
    </div>
  );
}

// One photo: the new pick (removable), else the saved photo.
export function SinglePhotoPicker({ inputId, picker, currentUrl, emptyLabel }) {
  const preview = picker.previews[0];
  const shown = preview || currentUrl;
  return (
    <div
      className={`photo-upload-hero photo-upload-sm${shown ? ' has-photo' : ''}${picker.dragging ? ' dragging' : ''}`}
      {...dropZoneHandlers(picker)}
    >
      {shown ? (
        <>
          <img src={shown} alt="Preview" className="photo-preview" />
          {preview && (
            <button
              type="button"
              className="photo-remove"
              onClick={(e) => { e.stopPropagation(); picker.onRemove(0); }}
            >
              &times;
            </button>
          )}
        </>
      ) : (
        <div className="photo-placeholder">
          <span className="photo-icon">{picker.dragging ? '📥' : '🍽️'}</span>
          <span className="photo-label">{picker.dragging ? 'Drop photo here' : emptyLabel}</span>
        </div>
      )}
      <input
        id={inputId}
        ref={picker.inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => { picker.onChoose([...(e.target.files || [])]); e.target.value = ''; }}
        hidden
      />
    </div>
  );
}
