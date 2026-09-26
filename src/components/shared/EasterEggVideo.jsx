import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function EasterEggVideo() {
  const [show, setShow] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [ideasGifs, setIdeasGifs] = useState([]);
  const [awesomeGifs, setAwesomeGifs] = useState([]);
  const [gifBlocked, setGifBlocked] = useState(false);

  // Default fallback GIFs. Giphy doesn't fail a GIF it has taken down: it
  // serves a "THIS CONTENT IS NOT AVAILABLE" picture in its place, so the
  // onError fallback below never fires for those. Ten such GIFs were removed
  // from these lists (checked Sept 2026).
  //
  // Every GIF here was looked at, not picked by its label, and has to say the
  // same thing as the card it sits on. The labels had been guesses: a facepalm,
  // "The More You Know", a waving bear and a champagne toast sat on "Too many
  // ideas!", and "You can do it", a side-eyeing puppet, "Welcome to the party,
  // pal" and a political clip sat on "You're crushing it!" (all taken out,
  // Sept 2026). Check a new one the same way before adding it.
  const defaultIdeasGifs = [
    "https://media.giphy.com/media/l0IylOPCNkiqOgMyA/giphy.gif", // Conspiracy board, ideas pinned everywhere
    "https://media.giphy.com/media/Std5LmuAIw111DB2wh/giphy.gif", // "Too many ideas at once"
    "https://media.giphy.com/media/re8C954MvHH3FkFmfl/giphy.gif", // Lightbulbs raining on someone: "Too many ideas"
    "https://media.giphy.com/media/MLwbnkL1MuPhnlvOnq/giphy.gif", // A brain juggling lightbulbs
    "https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif", // Head bursting into sparkles
    "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif", // Mind blown, fireworks
    "https://media.giphy.com/media/Um3ljJl8jrnHy/giphy.gif", // Mind blown, stars
    "https://media.giphy.com/media/OK27wINdQS5YQ/giphy.gif", // Kramer, mind blown
  ];

  const defaultAwesomeGifs = [
    "https://media.giphy.com/media/3otPoS81loriI9sO8o/giphy.gif", // Elf: "You did it!"
    "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif", // SpongeBob thumbs up
    "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif", // The Office dance party
    "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif", // Champagne toast
    "https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif", // Trophy and confetti
    "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif", // Thumbs-up kid at the computer
    "https://media.giphy.com/media/Is1O1TWV0LEJi/giphy.gif", // Michael and Dwight raise the roof
    "https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/giphy.gif", // Will Ferrell: "Awesome! Yes!"
    "https://media.giphy.com/media/l3q2XhfQ8oCkm1Ts4/giphy.gif", // Morgan Freeman applauding
  ];

  // Remember every GIF already shown (persisted across sessions) so the user
  // cycles through the whole list before any GIF repeats.
  const seenKey = (type) => `easter_egg_seen_${type}`;

  const readSeen = (type) => {
    try {
      const raw = localStorage.getItem(seenKey(type));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  // A GIF URL that fails to load is remembered and never offered again.
  const brokenKey = 'easter_egg_broken_v2';
  const readBroken = () => {
    try {
      const raw = localStorage.getItem(brokenKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const currentTypeRef = React.useRef('ideas');

  // If the network/device blocks the GIF host entirely, retrying forever just
  // shows a broken image box — after a few misses fall back to a confetti card.
  const failCountRef = React.useRef(0);

  const handleGifError = () => {
    const dead = videoUrl;
    failCountRef.current += 1;
    if (failCountRef.current >= 3) {
      setVideoUrl('');
      setGifBlocked(true);
      return;
    }
    try {
      localStorage.setItem(brokenKey, JSON.stringify([...new Set([...readBroken(), dead])]));
    } catch {}
    const type = currentTypeRef.current;
    const list = type === 'ideas' ? defaultIdeasGifs : defaultAwesomeGifs;
    const replacement = pickFreshGif(type, list);
    if (replacement && replacement !== dead) setVideoUrl(replacement);
  };

  const pickFreshGif = (type, gifList) => {
    const broken = readBroken();
    const unique = [...new Set(gifList)].filter((g) => !broken.includes(g));
    let seen = readSeen(type).filter((g) => unique.includes(g));
    let pool = unique.filter((g) => !seen.includes(g));

    // Everything's been seen — start a new cycle, but never repeat the very
    // last GIF back-to-back.
    if (pool.length === 0) {
      const last = seen[seen.length - 1];
      pool = unique.filter((g) => g !== last);
      if (pool.length === 0) pool = unique;
      seen = [];
    }

    const gif = pool[Math.floor(Math.random() * pool.length)];
    try {
      localStorage.setItem(seenKey(type), JSON.stringify([...seen, gif]));
    } catch {}
    return gif;
  };

  // Track current week to know when to refresh
  const weekRef = React.useRef(getWeekNumber());

  function getWeekNumber() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    return Math.floor(diff / oneWeek);
  }

  // Initialize GIFs on mount and refresh weekly
  useEffect(() => {
    const initializeGifs = () => {
      const currentWeek = getWeekNumber();
      
      // Check if week has changed
      if (currentWeek !== weekRef.current) {
        weekRef.current = currentWeek;
        localStorage.setItem('lastGifWeek', currentWeek.toString());
      }

      // Use default GIFs (could be extended to fetch from API)
      setIdeasGifs(defaultIdeasGifs);
      setAwesomeGifs(defaultAwesomeGifs);
    };

    initializeGifs();
  }, []);

  // Expose function globally so buttons can trigger it
  useEffect(() => {
    window.triggerEasterEgg = (type = 'ideas') => {
      let selectedGif, selectedTitle, selectedSubtitle;
      let gifList = type === 'ideas' ? ideasGifs : awesomeGifs;
      
      // Use fallbacks if state not yet loaded
      if (!gifList || gifList.length === 0) {
        gifList = type === 'ideas' ? defaultIdeasGifs : defaultAwesomeGifs;
      }
      
      currentTypeRef.current = type;
      failCountRef.current = 0;
      setGifBlocked(false);
      selectedGif = pickFreshGif(type, gifList);

      if (type === 'ideas') {
        selectedTitle = "🧠💥 Too many ideas! 💥🧠";
        selectedSubtitle = "That's what the Parking Lot is for! 🚗💡";
      } else {
        selectedTitle = "🎉 You're crushing it! 🎉";
        selectedSubtitle = "Keep being amazing! ✨";
      }
      
      setVideoUrl(selectedGif);
      setTitle(selectedTitle);
      setSubtitle(selectedSubtitle);
      setShow(true);
      
      setTimeout(() => {
        setShow(false);
      }, 10000);
    };
    
    return () => {
      delete window.triggerEasterEgg;
    };
  }, [ideasGifs, awesomeGifs]);

  return (
    <AnimatePresence>
      {show && (videoUrl || gifBlocked) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShow(false)}
        >
          <motion.div
            initial={{ y: -100, rotate: -10 }}
            animate={{ y: 0, rotate: 0 }}
            exit={{ y: 100, rotate: 10 }}
            className="relative max-w-2xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  {title}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShow(false)}
                  className="rounded-full"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              <div className="rounded-xl overflow-hidden bg-gray-100">
                {gifBlocked ? (
                  <div className="py-12 text-center text-6xl leading-relaxed">
                    {currentTypeRef.current === 'ideas' ? '🧠💥🤯' : '🎉🙌✨'}
                  </div>
                ) : (
                  <img
                    src={videoUrl}
                    alt=""
                    className="w-full h-auto"
                    style={{ maxHeight: '400px', objectFit: 'contain' }}
                    onError={handleGifError}
                  />
                )}
              </div>
              
              <p className="text-center text-gray-600 mt-4 text-sm">
                {subtitle}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}