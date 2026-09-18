import { useState, useEffect } from 'react';

// Types a line out one character at a time. `done` flips true when the line has
// finished so the flow can reveal the next line (or an input) only once the
// current one has actually landed.
export default function useTypewriter(text, speed = 28) {
  const [shown, setShown] = useState('');

  useEffect(() => {
    setShown('');
    if (!text) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return { shown, done: shown.length === (text || '').length };
}