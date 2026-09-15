// UI connector: draws text as a QR code in the browser with the qrcode
// package. Returns an image data URL, or null while it is drawn (or with no text).

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';

export function useQrCode(text) {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    setDataUrl(null);
    if (!text) return;
    let live = true;
    QRCode.toDataURL(text, { margin: 1, width: 200 })
      .then(url => { if (live) setDataUrl(url); })
      .catch(() => { if (live) setDataUrl(null); });
    return () => { live = false; };
  }, [text]);

  return dataUrl;
}
