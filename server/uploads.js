// Connector: photo uploads to disk. Which files are accepted is logic/meals.js.

import multer from 'multer';
import { unlinkSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { isAcceptedPhotoType, MAX_PHOTO_BYTES } from '../logic/meals.js';

export function makeUpload(uploadsDir) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
    }),
    limits: { fileSize: MAX_PHOTO_BYTES },
    fileFilter: (req, file, cb) => cb(null, isAcceptedPhotoType(file.mimetype)),
  });
}

export const uploadedUrl = (file) => `/uploads/${file.filename}`;

// Deletes files multer stored for a request that was then refused.
export function removeUploaded(files) {
  for (const file of files) {
    try { unlinkSync(file.path); } catch { /* already gone */ }
  }
}

// Deletes the file behind a stored /uploads/ URL. Does nothing for any other
// URL, or for a path that resolves outside uploadsDir.
export function removeStoredUrl(uploadsDir, url) {
  const prefix = '/uploads/';
  if (typeof url !== 'string' || !url.startsWith(prefix)) return;
  const root = resolve(uploadsDir);
  const target = resolve(root, url.slice(prefix.length));
  const inside = relative(root, target);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) return;
  try { unlinkSync(target); } catch { /* already gone */ }
}

// A limit or form error raised by multer (too large, too many files, ...).
export const isUploadError = (err) => err instanceof multer.MulterError;
