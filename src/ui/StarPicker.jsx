// UI: a 1-5 star rating. Read-only when disabled.

export default function StarPicker({ value, onChange, disabled = false }) {
  return (
    <div className="star-picker">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`star ${star <= value ? 'star-filled' : 'star-empty'}${disabled ? ' star-disabled' : ''}`}
          onClick={() => !disabled && onChange(star)}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => { if (!disabled && e.key === 'Enter') onChange(star); }}
        >
          {star <= value ? '★' : '☆'}
        </span>
      ))}
    </div>
  );
}
