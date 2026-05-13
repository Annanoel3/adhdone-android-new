import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function RoyaltyFreeMusicPlayer({ selectedPlaylist, theme }) {
  if (!selectedPlaylist || selectedPlaylist === 'none') return null;

  // Royalty-free music sources
  const playlists = {
    lofi: {
      name: "Lo-Fi Beats",
      sources: [
        { title: "Lo-Fi Study Mix", url: "https://www.youtube.com/embed/H-Meqjg9cxA" },
      ]
    },
    jazz: {
      name: "Jazz & Smooth",
      sources: [
        { title: "Smooth Jazz", url: "https://www.youtube.com/embed/DZpPhCGoPLg" },
      ]
    },
    ambient: {
      name: "Ambient Sounds",
      sources: [
        { title: "Ambient Chill Music", url: "https://www.youtube.com/embed/DZpPhCGoPLg" },
      ]
    },
    lofi_bossa: {
      name: "Lofi Bossa Nova Jazz Mix",
      sources: [
        { title: "Lofi Bossa Nova Jazz Mix", url: "https://www.youtube.com/embed/mwsCCweq3sw" },
      ]
    },
    ghibli: {
      name: "Ghibli Inspired Piano Music",
      sources: [
        { title: "Ghibli Piano Collection", url: "https://www.youtube.com/embed/HGl75kurxok" },
      ]
    },
  };

  const playlist = playlists[selectedPlaylist];
  if (!playlist) return null;

  const primarySource = playlist.sources[0];

  return (
    <div
      className={`rounded-xl p-3 shadow-lg ${
        theme === "minimalist"
          ? "bg-white"
          : theme === "dark"
            ? "bg-gray-800"
            : "bg-white/80"
      }`}
    >
      <h2 className={`text-sm font-bold mb-2 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
        🎵 Music
      </h2>
      <AnimatePresence>
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }}>
          <iframe
            width="100%"
            height="200"
            src={`${primarySource.url}&modestbranding=1`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            className="rounded-lg"
            title={primarySource.title}
          ></iframe>
          <p className={`text-xs mt-2 text-center ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
            🎵 {playlist.name}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}