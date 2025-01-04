import type { MetaFunction } from "@remix-run/node";
import { useNavigate } from "@remix-run/react";
import { useState, useEffect, useRef } from "react";

// Defines the shape of each player object
interface Player {
  id: number;
  name: string;
  timeLeft: number; // in seconds
}

// Optional: Keep meta info if you like
export const meta: MetaFunction = () => {
  return [
    { title: "Game Mode - Multiplayer Clock" },
    { name: "description", content: "In-game screen for multi-player clock." },
  ];
};

export default function Game() {
  const navigate = useNavigate();

  // ----------------------------
  // Main game states
  // ----------------------------
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [prevPlayerIndex, setPrevPlayerIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Extra references to config (loaded from localStorage)
  const [numPlayers, setNumPlayers] = useState(2);
  const [totalTime, setTotalTime] = useState(300);
  const [increment, setIncrement] = useState(0);

  // A ref to manage the countdown interval
  const intervalRef = useRef<NodeJS.Timer | null>(null);

  // ----------------------------
  // Modal for editing all names
  // ----------------------------
  const [showEditNamesModal, setShowEditNamesModal] = useState(false);
  const [editPlayers, setEditPlayers] = useState<Player[]>([]);

  // ----------------------------
  // On mount: load config + any in-progress game
  // ----------------------------
  useEffect(() => {
    // 1) Load config from localStorage
    const savedConfig = localStorage.getItem("clockConfig");
    if (!savedConfig) {
      // No config => go back to index
      navigate("/");
      return;
    }
    const { numPlayers, totalTime, increment } = JSON.parse(savedConfig) as {
      numPlayers: number;
      totalTime: number;
      increment: number;
    };
    setNumPlayers(numPlayers);
    setTotalTime(totalTime);
    setIncrement(increment);

    // 2) Check if there's a saved in-progress game state
    const savedState = localStorage.getItem("clockState");
    if (savedState) {
      const parsed = JSON.parse(savedState) as {
        players: Player[];
        currentPlayerIndex: number;
        prevPlayerIndex: number | null;
        isRunning: boolean;
      };
      setPlayers(parsed.players);
      setCurrentPlayerIndex(parsed.currentPlayerIndex);
      setPrevPlayerIndex(parsed.prevPlayerIndex);
      setIsRunning(parsed.isRunning);
    } else {
      // Initialize fresh from config
      const initial: Player[] = Array.from({ length: numPlayers }, (_, idx) => ({
        id: idx,
        name: `Player ${idx + 1}`,
        timeLeft: totalTime,
      }));
      setPlayers(initial);
      setCurrentPlayerIndex(0);
      setIsRunning(false);
    }
  }, [navigate]);

  // ----------------------------
  // Persist state to localStorage
  // ----------------------------
  useEffect(() => {
    // Only save if we have players (i.e., config was loaded)
    if (players.length > 0) {
      const gameState = {
        players,
        currentPlayerIndex,
        prevPlayerIndex,
        isRunning,
      };
      localStorage.setItem("clockState", JSON.stringify(gameState));
    }
  }, [players, currentPlayerIndex, prevPlayerIndex, isRunning]);

  // ----------------------------
  // Timer effect
  // ----------------------------
  useEffect(() => {
    if (isRunning) {
      // Avoid double intervals under React 18 Strict Mode
      if (intervalRef.current) return;

      intervalRef.current = setInterval(() => {
        setPlayers((prev) => {
          const copy = [...prev];
          copy[currentPlayerIndex].timeLeft = Math.max(
            copy[currentPlayerIndex].timeLeft - 1,
            0
          );
          return copy;
        });
      }, 1000);
    }

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, currentPlayerIndex]);

  // ----------------------------
  // Actions
  // ----------------------------
  function handleStartStop() {
    setIsRunning((prev) => !prev);
  }

  function switchToNextPlayer() {
    if (!isRunning) return;
    setPlayers((prev) => {
      const copy = [...prev];
      if (increment > 0) {
        copy[currentPlayerIndex].timeLeft += increment;
      }
      return copy;
    });
    setPrevPlayerIndex(currentPlayerIndex);
    setCurrentPlayerIndex((prev) => (prev + 1) % players.length);
  }

  function handleUndo() {
    if (prevPlayerIndex === null) return;
    setCurrentPlayerIndex(prevPlayerIndex);

    if (increment > 0) {
      setPlayers((prev) => {
        const copy = [...prev];
        copy[prevPlayerIndex].timeLeft = Math.max(
          copy[prevPlayerIndex].timeLeft - increment,
          0
        );
        return copy;
      });
    }
    setPrevPlayerIndex(null);
  }

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // ----------------------------
  // Acquire/Release Wake Lock
  // ----------------------------
  useEffect(() => {
    // If wake lock is not supported, just skip.
    if (!("wakeLock" in navigator)) {
      return;
    }

    const acquireWakeLock = async () => {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        console.log("Wake Lock acquired");
      } catch (err) {
        console.error("Failed to acquire wake lock:", err);
      }
    };

    if (isRunning) {
      // Acquire wake lock
      acquireWakeLock();
    } else {
      // Release wake lock if we have one
      if (wakeLockRef.current) {
        wakeLockRef.current.release().then(() => {
          console.log("Wake Lock released");
          wakeLockRef.current = null;
        });
      }
    }

    // Cleanup: release wake lock if component unmounts
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().then(() => {
          wakeLockRef.current = null;
        });
      }
    };
  }, [isRunning]);

  // ----------------------------
  // Format Time
  // If >= 3600 seconds, show HH:MM:SS; else show MM:SS
  // ----------------------------
  function formatTime(seconds: number): string {
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const leftover = seconds % 3600;
      const m = Math.floor(leftover / 60);
      const s = leftover % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
        s
      ).padStart(2, "0")}`;
    } else {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
  }

  // ----------------------------
  // Manual Time
  // ----------------------------
  function handleAddTime(playerId: number, seconds: number) {
    setPlayers((prev) => {
      const copy = [...prev];
      const idx = copy.findIndex((p) => p.id === playerId);
      if (idx !== -1) {
        copy[idx].timeLeft += seconds;
      }
      return copy;
    });
  }

  // ----------------------------
  // Modal: Edit All Names
  // ----------------------------
  function openEditNamesModal() {
    // Make a copy of the current players so the user can safely edit
    setEditPlayers(JSON.parse(JSON.stringify(players)));
    setShowEditNamesModal(true);
  }

  function closeEditNamesModal() {
    setShowEditNamesModal(false);
  }

  function saveAllNames() {
    // Overwrite our main players with the user-edited ones
    setPlayers(editPlayers);
    closeEditNamesModal();
  }

  function handleModalNameChange(playerId: number, newName: string) {
    setEditPlayers((prev) => {
      const copy = [...prev];
      const idx = copy.findIndex((p) => p.id === playerId);
      if (idx !== -1) {
        copy[idx].name = newName;
      }
      return copy;
    });
  }

  // If we haven't loaded players yet, you can optionally render null or a spinner
  if (players.length === 0) {
    return null;
  }

  // Calculate total time left (for all players)
  const totalTimeLeft = players.reduce((acc, p) => acc + p.timeLeft, 0);

  return (
    <div className="relative flex min-h-screen flex-col items-center bg-gray-100 p-4 dark:bg-gray-900">
      {/* TOTAL TIME HEADER */}
      <div className="my-4 text-center text-2xl text-gray-600 dark:text-gray-300">
        Total time left: {formatTime(totalTimeLeft)}
      </div>

      {/* TOP BAR (WRAPS WHEN NEEDED) */}
      <div className="mb-4 flex w-full max-w-md flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => {
            // Clear in-progress game state to ensure a fresh start next time
            localStorage.removeItem("clockState");
            navigate("/");
          }}
          className="inline-flex items-center gap-1 rounded-md bg-gray-400 px-2 py-1 text-sm text-white hover:bg-gray-500"
        >
          <span className="text-base">←</span>
          <span>Back</span>
        </button>

        <button
          onClick={handleUndo}
          className="inline-flex items-center gap-1 rounded-md bg-yellow-500 px-2 py-1 text-sm text-white hover:bg-yellow-600"
        >
          <span className="text-base">↩</span>
          <span>Undo</span>
        </button>

        <button
          onClick={handleStartStop}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-sm text-white hover:bg-blue-700"
        >
          {isRunning ? (
            <>
              <span className="text-base">⏸</span>
              <span>Pause</span>
            </>
          ) : (
            <>
              <span className="text-base">▶</span>
              <span>Start</span>
            </>
          )}
        </button>

        <button
          onClick={openEditNamesModal}
          className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-2 py-1 text-sm text-white hover:bg-purple-700"
        >
          <span className="text-base">✏️</span>
          <span>Edit</span>
        </button>
      </div>

      {/* PLAYER CLOCKS */}
      <div className="w-full max-w-md space-y-4">
        {players.map((player, idx) => (
          <div
            key={player.id}
            onClick={() => {
              if (idx === currentPlayerIndex) {
                switchToNextPlayer();
              }
            }}
            className={`flex cursor-pointer items-center justify-between rounded-lg p-4 shadow-sm transition-all ${idx === currentPlayerIndex
                ? "bg-blue-100 dark:bg-blue-800"
                : "bg-white dark:bg-gray-800"
              }`}
          >
            <div className="flex flex-col">
              <span className="mb-1 w-32 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                {player.name}
              </span>
              <span
                className={`text-xl font-bold ${player.timeLeft <= 10
                    ? "text-red-500"
                    : "text-gray-800 dark:text-gray-100"
                  }`}
              >
                {formatTime(player.timeLeft)}
              </span>
            </div>

            {/* +10s Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation(); // Prevent switching player on click
                handleAddTime(player.id, 10);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1 text-sm font-bold text-white hover:bg-green-700"
            >
              <span>+10s</span>
            </button>
          </div>
        ))}
      </div>

      {/* MODAL: Edit All Player Names */}
      {showEditNamesModal && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-md dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Edit All Player Names
            </h2>
            <div className="space-y-4">
              {editPlayers.map((p) => (
                <div key={p.id} className="flex flex-col">
                  <label className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Player {p.id + 1}
                  </label>
                  <input
                    type="text"
                    className="rounded-md border border-gray-300 px-3 py-2 text-gray-800 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    value={p.name}
                    onChange={(e) => handleModalNameChange(p.id, e.target.value)}
                  />
                </div>
              ))}
            </div>

            {/* MODAL CONTROLS */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={closeEditNamesModal}
                className="inline-flex items-center gap-1 rounded-md bg-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-400 dark:text-gray-100"
              >
                <span className="text-base">✕</span>
                <span>Cancel</span>
              </button>
              <button
                type="button"
                onClick={saveAllNames}
                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <span className="text-base">💾</span>
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}