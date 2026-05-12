export default function SpotifyWebPlayback({ playlistId, theme }) {
  if (!playlistId) return null;

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
      <iframe
        src={`https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator&theme=0`}
        width="100%"
        height="200"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        className="rounded-lg"
      ></iframe>
    </div>
  );
}