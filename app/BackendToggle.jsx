// BackendToggle.jsx
// Drop-in component for page.js
// Add <BackendToggle backend={backend} setBackend={setBackend} /> near the generate button
// Add const [backend, setBackend] = useState("modal") to your state

export function BackendToggle({ backend, setBackend }) {
  return (
    <div className="flex items-center gap-3 mt-2 mb-4">
      <span className="text-sm text-gray-400">Pipeline:</span>
      <div className="flex rounded-lg overflow-hidden border border-gray-700">
        <button
          onClick={() => setBackend("modal")}
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
            backend === "modal"
              ? "bg-indigo-600 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          ⚡ Modal
        </button>
        <button
          onClick={() => setBackend("kaggle")}
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
            backend === "kaggle"
              ? "bg-indigo-600 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          🐢 Kaggle
        </button>
      </div>
      <span className="text-xs text-gray-500">
        {backend === "modal"
          ? "Faster · A10G GPU · FlashAttention"
          : "Free · T4 GPU · Portrait gen only"}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// INSTRUCTIONS: How to wire this into your existing page.js
// ─────────────────────────────────────────────────────────────────
//
// 1. Add to your state declarations:
//    const [backend, setBackend] = useState("modal");
//
// 2. Add the toggle above your generate button:
//    <BackendToggle backend={backend} setBackend={setBackend} />
//
// 3. Pass backend to your startJob call:
//    const res = await fetch("/api/start-job", {
//      method: "POST",
//      headers: { "Content-Type": "application/json" },
//      body: JSON.stringify({ prompt, avatar_id: selectedAvatar?.id, backend }),
//    });
//
// That's it. The API route handles the rest.
// ─────────────────────────────────────────────────────────────────
