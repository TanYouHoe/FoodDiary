// UI connector: copies text (src/clipboard.js) and remembers whether it worked.

import { useState } from 'react';
import { copyText } from '../clipboard.js';

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const copy = async (text) => {
    setError('');
    try {
      await copyText(text);
      setCopied(true);
    } catch {
      setError('Could not copy. Select the codes and copy them by hand.');
    }
  };

  const reset = () => {
    setCopied(false);
    setError('');
  };

  return { copied, error, copy, reset };
}
