// UI: a swipeable strip of photos with arrows and dots.

export default function PhotoCarouselView({ urls, current, onPrev, onNext, onGoTo, onTouchStart, onTouchMove, onTouchEnd }) {
  if (!urls || urls.length === 0) return null;

  return (
    <div
      className="photo-carousel"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="photo-carousel-track"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {urls.map((url, i) => (
          <img key={i} src={url} alt="" className="photo-carousel-slide" />
        ))}
      </div>

      {urls.length > 1 && (
        <>
          <button className="carousel-arrow carousel-arrow-left" onClick={onPrev}>&#8249;</button>
          <button className="carousel-arrow carousel-arrow-right" onClick={onNext}>&#8250;</button>
          <div className="carousel-dots">
            {urls.map((_, i) => (
              <span
                key={i}
                className={`carousel-dot${i === current ? ' active' : ''}`}
                onClick={() => onGoTo(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
