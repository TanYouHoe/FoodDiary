import { useState, useRef } from 'react';

export default function PhotoCarousel({ urls }) {
  const [current, setCurrent] = useState(0);
  const touchStart = useRef(null);
  const touchEnd = useRef(null);

  if (!urls || urls.length === 0) return null;

  const goTo = (i) => setCurrent(i);
  const prev = () => setCurrent((c) => (c === 0 ? urls.length - 1 : c - 1));
  const next = () => setCurrent((c) => (c === urls.length - 1 ? 0 : c + 1));

  const onTouchStart = (e) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };
  const onTouchMove = (e) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };
  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    const diff = touchStart.current - touchEnd.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
    touchStart.current = null;
    touchEnd.current = null;
  };

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
          <button className="carousel-arrow carousel-arrow-left" onClick={prev}>&#8249;</button>
          <button className="carousel-arrow carousel-arrow-right" onClick={next}>&#8250;</button>
          <div className="carousel-dots">
            {urls.map((_, i) => (
              <span
                key={i}
                className={`carousel-dot${i === current ? ' active' : ''}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
