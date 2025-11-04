import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function EasterEggVideo() {
  const [show, setShow] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');

  // Curated lists of working GIFs
  const ideasGifs = [
    "https://media.giphy.com/media/l0IylOPCNkiqOgMyA/giphy.gif", // Mind blown
    "https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif", // Head exploding
    "https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif", // Brain on fire
    "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif", // Too much info
    "https://media.giphy.com/media/3og0INyCmHlNylks9O/giphy.gif", // Mind racing
    "https://media.giphy.com/media/APqEbxBsVlkWSuFpth/giphy.gif", // Brain overload
    "https://media.giphy.com/media/SDogLD4FOZMM8/giphy.gif", // Thinking too much
  ];

  const awesomeGifs = [
    "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif", // Applause
    "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif", // You're amazing
    "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif", // Clapping
    "https://media.giphy.com/media/26tknCqiJrBQG6bxC/giphy.gif", // Excited
    "https://media.giphy.com/media/l0MYEqEzwMWFCg8rm/giphy.gif", // Celebration
    "https://media.giphy.com/media/3otPoS81loriI9sO8o/giphy.gif", // Fist pump
    "https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif", // Yes!
  ];

  // Expose function globally so buttons can trigger it
  React.useEffect(() => {
    window.triggerEasterEgg = (type = 'ideas') => {
      const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
      
      let selectedGif, selectedTitle, selectedSubtitle;
      
      if (type === 'ideas') {
        selectedGif = ideasGifs[dayOfYear % ideasGifs.length];
        selectedTitle = "🧠💥 Too many ideas! 💥🧠";
        selectedSubtitle = "That's what the Parking Lot is for! 🚗💡";
      } else {
        selectedGif = awesomeGifs[dayOfYear % awesomeGifs.length];
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
  }, []);

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