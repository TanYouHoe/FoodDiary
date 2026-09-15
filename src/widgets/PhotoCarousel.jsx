// UI connector: joins the carousel state to its view.

import { usePhotoCarousel } from '../hooks/usePhotoCarousel.js';
import PhotoCarouselView from '../ui/PhotoCarouselView.jsx';

export default function PhotoCarousel({ urls }) {
  const c = usePhotoCarousel(urls ? urls.length : 0);
  return (
    <PhotoCarouselView
      urls={urls}
      current={c.current}
      onPrev={c.prev}
      onNext={c.next}
      onGoTo={c.goTo}
      onTouchStart={c.onTouchStart}
      onTouchMove={c.onTouchMove}
      onTouchEnd={c.onTouchEnd}
    />
  );
}
