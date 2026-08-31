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

  // Default fallback GIFs
  const defaultIdeasGifs = [
    "https://media.giphy.com/media/l0IylOPCNkiqOgMyA/giphy.gif", // Mind blown
    "https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif", // Head exploding
    "https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif", // Brain on fire
    "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif", // Too much info
    "https://media.giphy.com/media/3og0INyCmHlNylks9O/giphy.gif", // Mind racing
    "https://media.giphy.com/media/APqEbxBsVlkWSuFpth/giphy.gif", // Brain overload
    "https://media.giphy.com/media/SDogLD4FOZMM8/giphy.gif", // Thinking too much
    "https://media.giphy.com/media/Um3ljJl8jrnHy/giphy.gif", // Hamster wheel brain
    "https://media.giphy.com/media/3og0IMJcSI8p6hYQXS/giphy.gif", // Mind blown cat
    "https://media.giphy.com/media/26xBI73gWquCBBCDe/giphy.gif", // Brain freeze
    "https://media.giphy.com/media/l2Sq2vCtLmpXhKQ3K/giphy.gif", // Spinning thoughts
    "https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/giphy.gif", // Confused math lady
    "https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif", // Static brain
    "https://media.giphy.com/media/QMkPpxPDYY0fu/giphy.gif", // Overloaded
    "https://media.giphy.com/media/xT9DPpf0zTqbcgy8xy/giphy.gif", // Sparks flying
    "https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif", // Wait what
    "https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif", // Head spinning
    "https://media.giphy.com/media/26tPplGWjN0xLybiU/giphy.gif", // So many tabs open
    "https://media.giphy.com/media/l46Cy1rHbQ92uuLXa/giphy.gif", // Chaotic energy
    "https://media.giphy.com/media/3oEjHV0z8S7WM2QqIE/giphy.gif", // Brain buffering
  ];

  const defaultAwesomeGifs = [
    "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif", // Applause
    "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif", // You're amazing
    "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif", // Clapping
    "https://media.giphy.com/media/26tknCqiJrBQG6bxC/giphy.gif", // Excited
    "https://media.giphy.com/media/l0MYEqEzwMWFCg8rm/giphy.gif", // Celebration
    "https://media.giphy.com/media/3otPoS81loriI9sO8o/giphy.gif", // Fist pump
    "https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif", // Yes!
    "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif", // Ron Swanson giggle
    "https://media.giphy.com/media/yoJC2K6rCzwNY2EngA/giphy.gif", // Dance celebration
    "https://media.giphy.com/media/26u4cr2dejnss7UB2/giphy.gif", // Success kid
    "https://media.giphy.com/media/Is1O1TWV0LEJi/giphy.gif", // Kid dancing
    "https://media.giphy.com/media/26BGIqWh2R1fi6JDa/giphy.gif", // Mind blown good job
    "https://media.giphy.com/media/ZdlN56usaKaQg/giphy.gif", // Cat thumbs up
    "https://media.giphy.com/media/MSgJnzNSMGBc6BpGIc/giphy.gif", // Chef's kiss
    "https://media.giphy.com/media/l2R032V7qRAF8J6sU/giphy.gif", // Happy dance
    "https://media.giphy.com/media/IwAZ6dvvvaTtdI8SD5/giphy.gif", // You're a star
    "https://media.giphy.com/media/3o6ZtaO9BZHcOjmErm/giphy.gif", // High five
    "https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/giphy.gif", // Proud clapping
    "https://media.giphy.com/media/l4FGuhL4U2WyjdkaY/giphy.gif", // Confetti burst
    "https://media.giphy.com/media/xUOwGmPWXjcvS9j0BW/giphy.gif", // Nailed it
    "https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif", // Standing ovation
    "https://media.giphy.com/media/3oz8xLd9DJq2l2VFtu/giphy.gif", // Happy jump
    "https://media.giphy.com/media/l3q2XhfQ8oCkm1Ts4/giphy.gif", // Dog excited
    "https://media.giphy.com/media/3o72F8t9TDi2xVnxOE/giphy.gif", // Victory spin
    "https://media.giphy.com/media/13GIgrGdslD9oQ/giphy.gif", // Thumbs up
    "https://media.giphy.com/media/xThuWvOZuMcHNiozOw/giphy.gif", // Sparkle finish
    "https://media.giphy.com/media/1ffkLXpKDKfr2/giphy.gif", // Little win dance
    "https://media.giphy.com/media/26FmQd5DjKQnQrWzu/giphy.gif", // Celebration cheer
    "https://media.giphy.com/media/QAsBwSjx9zVKh2NlOB/giphy.gif", // Well done
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
  const brokenKey = 'easter_egg_broken';
  const readBroken = () => {
    try {
      const raw = localStorage.getItem(brokenKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const currentTypeRef = React.useRef('ideas');

  const handleGifError = () => {
    const dead = videoUrl;
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
      {show && videoUrl && (
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
                <img
                  src={videoUrl}
                  alt="Easter egg GIF"
                  className="w-full h-auto"
                  style={{ maxHeight: '400px', objectFit: 'contain' }}
                  onError={handleGifError}
                />
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