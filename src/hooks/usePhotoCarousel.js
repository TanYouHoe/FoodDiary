// UI connector: the current slide of a photo carousel and its swipe gesture.

import { useState, useRef } from 'react';

const SWIPE_PX = 50;

export function usePhotoCarousel(count) {
  const [current, setCurrent] = useState(0);
  const touchStart = useRef(null);
  const touchEnd = useRef(null);

  const prev = () => setCurrent((c) => (c === 0 ? count - 1 : c - 1));
  const next = () => setCurrent((c) => (c === count - 1 ? 0 : c + 1));

  return {
    current,
    prev,
    next,
    goTo: setCurrent,
    onTouchStart: (e) => {
      touchEnd.current = null;
      touchStart.current = e.targetTouches[0].clientX;
    },
    onTouchMove: (e) => {
      touchEnd.current = e.targetTouches[0].clientX;
    },
    onTouchEnd: () => {
      if (!touchStart.current || !touchEnd.current) return;
      const diff = touchStart.current - touchEnd.current;
      if (Math.abs(diff) > SWIPE_PX) {
        if (diff > 0) next();
        else prev();
      }
      touchStart.current = null;
      touchEnd.current = null;
    },
  };
}
