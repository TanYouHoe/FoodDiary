// UI connector: picked photo files, their preview URLs, and the drag state.
// multiple: many photos up to the meal limit; otherwise one photo.

import { useState, useRef, useEffect } from 'react';
import { addPhotos, isImageFile } from '../../logic/meals.js';

export function usePhotoPicker({ multiple }) {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const urlCache = useRef(new Map()); // File -> object URL, one per picked file

  // Revoke the URLs of removed files, make URLs only for new files.
  useEffect(() => {
    const cache = urlCache.current;
    for (const [file, url] of cache) {
      if (!files.includes(file)) {
        URL.revokeObjectURL(url);
        cache.delete(file);
      }
    }
    for (const file of files) {
      if (!cache.has(file)) cache.set(file, URL.createObjectURL(file));
    }
    setPreviews(files.map(f => cache.get(f)));
  }, [files]);

  // On unmount, revoke every URL. Under StrictMode's simulated remount the
  // effect above runs again first and makes fresh URLs for the empty cache.
  useEffect(() => () => {
    const cache = urlCache.current;
    cache.forEach(url => URL.revokeObjectURL(url));
    cache.clear();
  }, []);

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
