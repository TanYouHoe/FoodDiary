// Connector: photo uploads to disk. Which files are accepted, what a stored
// file is named and which first bytes make a real photo are logic/meals.js.

import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { openSync, readSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { isAcceptedPhotoType, MAX_PHOTO_BYTES, storedPhotoName, isGenuinePhoto, PHOTO_SIGNATURE_BYTES, NOT_SUPPORTED_IMAGE } from '../logic/meals.js';

// The first `length` bytes of a file (fewer when the file is shorter).
function readHead(path, length) {
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, 'r');
  try {
    return buffer.subarray(0, readSync(fd, buffer, 0, length, 0));
  } finally {
    closeSync(fd);
  }
}

const hasPhotoBytes = (file) => {
  try { return isGenuinePhoto(file.mimetype, readHead(file.path, PHOTO_SIGNATURE_BYTES)); } catch { return false; }
};

// Runs after multer: when any stored file is not the photo it claimed to be,
// every file of the request is deleted and the request refused.
function checkPhotoBytes(req, res, next) {
  const files = req.files ?? (req.file ? [req.file] : []);
  if (files.every(hasPhotoBytes)) return next();
  removeUploaded(files);
  res.status(400).json({ error: NOT_SUPPORTED_IMAGE });
}

// Returns { single(field), array(field, max) }, each a middleware list for a route.
export function makeUpload(uploadsDir) {
  const parser = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename: (req, file, cb) => cb(null, storedPhotoName(randomBytes(16).toString('hex'), file.mimetype)),
    }),
    limits: { fileSize: MAX_PHOTO_BYTES },
    fileFilter: (req, file, cb) => cb(null, isAcceptedPhotoType(file.mimetype)),
  });
  return {
    single: (field) => [parser.single(field), checkPhotoBytes],
    array: (field, max) => [parser.array(field, max), checkPhotoBytes],
  };
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
