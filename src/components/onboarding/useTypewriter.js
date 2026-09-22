import { useState, useEffect, useRef } from 'react';

// Types a line out one character at a time. `done` flips true when the line has
// finished so the flow can reveal the next line (or an input) only once the
// current one has actually landed.
//
// `key` says which line this is (the beat index). A line's TEXT can change
// while it is being typed — the "Thanks, Anna! Your handle is @…" beat fills
// in the handle a moment after it starts — and that used to wipe the line and
// type it all over again. Now only a new key starts from the beginning; a
// changed text carries on from where the typing already got to.
export default function useTypewriter(text, speed = 28, key = text) {
  const [shown, setShown] = useState('');
  const posRef = useRef(0);
  const keyRef = useRef(key);

  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      posRef.current = 0;
    }
    if (!text) {
      posRef.current = 0;
      setShown('');
      return;
    }
    let i = Math.min(posRef.current, text.length);
    setShown(text.slice(0, i));
    if (i >= text.length) return;
    const id = setInterval(() => {
      i += 1;
      posRef.current = i;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, key]);

  return { shown, done: shown.length === (text || '').length };
}
