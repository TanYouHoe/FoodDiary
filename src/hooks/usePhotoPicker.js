// UI connector: picked photo files, their preview URLs, and the drag state.
// multiple: many photos up to the meal limit; otherwise one photo.

import { useState, useRef, useMemo } from 'react';
import { addPhotos, isImageFile } from '../../logic/meals.js';

export function usePhotoPicker({ multiple }) {
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);

  const drop = (list) => {
    setDragging(false);
    if (multiple) {
      const images = list.filter(isImageFile);
      if (images.length > 0) setFiles(prev => addPhotos(prev, images));
    } else if (list[0] && isImageFile(list[0])) {
      setFiles([list[0]]);
    }
  };
  const choose = (list) => {
    if (multiple) {
      if (list.length > 0) setFiles(prev => addPhotos(prev, list));
    } else {
      setFiles(list.slice(0, 1));
    }
  };
  const removeAt = (index) => setFiles(prev => prev.filter((_, i) => i !== index));

  return {
    files,
    clear: () => setFiles([]),
    // The `picker` prop of the views in src/ui/PhotoPickers.jsx
    props: {
      previews,
      dragging,
      inputRef,
      onBrowse: () => inputRef.current?.click(),
      onDragState: setDragging,
      onDrop: drop,
      onChoose: choose,
      onRemove: removeAt,
    },
  };
}
