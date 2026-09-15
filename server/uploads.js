// Connector: photo uploads to disk. Which files are accepted is logic/meals.js.

import multer from 'multer';
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
