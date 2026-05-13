import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function RoyaltyFreeMusicPlayer({ selectedPlaylist, theme }) {
  if (!selectedPlaylist || selectedPlaylist === 'none') return null;

  // Royalty-free music sources
  const playlists = {
    ghibli: {
      name: "Ghibli Music",
      sources: [
        { title: "Ghibli Music", url: "https://www.youtube-nocookie.com/embed/qte40ow045U?autoplay=1&origin=https://adhdone.space" },
      ]
    },
    lofi_bossa: {
      name: "Lofi Bossa Nova Jazz Mix",
      sources: [
        { title: "Lofi Bossa Nova Jazz Mix", url: "https://www.youtube-nocookie.com/embed/Cz-j53kiiKY?autoplay=1&origin=https://adhdone.space" },
      ]
    },
    dark_ocean_house: {
      name: "Dark Ocean House Hustle",
      sources: [
        { title: "Dark Ocean House Hustle", url: "https://www.youtube-nocookie.com/embed/pHuKEK1YBFs?autoplay=1&origin=https://adhdone.space" },
      ]
    },
    dark_jungle_house: {
      name: "Dark Jungle House Hustle",
      sources: [
        { title: "Dark Jungle House Hustle", url: "https://www.youtube-nocookie.com/embed/Gp0qjHo8zDw?autoplay=1&origin=https://adhdone.space" },
      ]
    },
    lofi: {
      name: "Lo-Fi Beats",
      sources: [
        { title: "Lo-Fi Study Mix", url: "https://www.youtube-nocookie.com/embed/H-Meqjg9cxA?autoplay=1&origin=https://adhdone.space" },
      ]
    },
    jazz: {
      name: "Jazz & Smooth",
      sources: [
        { title: "Smooth Jazz", url: "https://www.youtube-nocookie.com/embed/DZpPhCGoPLg?autoplay=1&origin=https://adhdone.space" },
      ]
    },
    ambient: {
      name: "Ambient Sounds",
      sources: [
        { title: "Ambient Chill Music", url: "https://www.youtube-nocookie.com/embed/DZpPhCGoPLg?autoplay=1&origin=https://adhdone.space" },
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
            src={primarySource.url}
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