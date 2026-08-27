export default function Home() {
  return (
    <main className="game-page">
      {/* Isolate the static game so viewport, touch input, and offline caching
          remain independent of the host. Keep this query version aligned with
          the asset URLs inside public/game/index.html. */}
      <iframe
        className="game-frame"
        src="/game/index.html?v=duck-gene-lab-r10"
        title="鴨鴨基因實驗室遊戲"
        allow="fullscreen; autoplay"
        allowFullScreen
      />
    </main>
  );
}
