import type { MetaFunction } from "@remix-run/node";
import { useNavigate } from "@remix-run/react";
import { useState, useEffect, useRef } from "react";

interface Player {
  id: number;
  name: string;
  timeLeft: number; // in seconds
  outOfTime?: boolean; // track if they're out of time
}

export const meta: MetaFunction = () => {
  return [
    { title: "Game Mode - Multiplayer Watch" },
    { name: "description", content: "In-game screen for multi-player clock." },
  ];
};

interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  isRunning: boolean;
  history: GameState[]; // a stack of previous states for enhanced undo
}

export default function Game() {
  const navigate = useNavigate();

  // ----------------------------
  // Main game states
  // ----------------------------
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // For enhanced undo
  const [history, setHistory] = useState<GameState[]>([]);

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
  // On mount: load config + in-progress game
  // ----------------------------
  useEffect(() => {
    const savedConfig = localStorage.getItem("clockConfig");
    if (!savedConfig) {
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

    const savedState = localStorage.getItem("clockState");
    if (savedState) {
      const parsed = JSON.parse(savedState) as {
        players: Player[];
        currentPlayerIndex: number;
        isRunning: boolean;
        history: GameState[];
      };
      setPlayers(parsed.players);
      setCurrentPlayerIndex(parsed.currentPlayerIndex);
      setIsRunning(parsed.isRunning);
      setHistory(parsed.history || []);
    } else {
      const initial: Player[] = Array.from({ length: numPlayers }, (_, idx) => ({
        id: idx,
        name: `Player ${idx + 1}`,
        timeLeft: totalTime,
        outOfTime: false,
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
    if (players.length > 0) {
      const gameState = {
        players,
        currentPlayerIndex,
        isRunning,
        history,
      };
      localStorage.setItem("clockState", JSON.stringify(gameState));
    }
  }, [players, currentPlayerIndex, isRunning, history]);

  // ----------------------------
  // Timer effect
  // ----------------------------
  useEffect(() => {
    if (isRunning) {
      // Avoid double intervals under React 18 Strict Mode
      if (intervalRef.current) return;

      intervalRef.current = setInterval(() => {
        setPlayers((prevPlayers) => {
          const copy = [...prevPlayers];
          const active = copy[currentPlayerIndex];

          if (!active.outOfTime) {
            const newTime = active.timeLeft - 1;
            active.timeLeft = Math.max(newTime, 0);

            // If they've just hit 0, mark them out of time
            if (active.timeLeft === 0) {
              active.outOfTime = true;

              // Move to the next player (if any), then pause
              const nextIndex = findNextActivePlayerIndex(currentPlayerIndex, copy);
              if (nextIndex !== null) {
                setCurrentPlayerIndex(nextIndex);
              }
              setIsRunning(false);
            }
          }
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
  // Wake Lock (keep screen on if supported)
  // ----------------------------
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!("wakeLock" in navigator)) return;

    const acquireWakeLock = async () => {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      } catch (err) {
        console.error("Failed to acquire wake lock:", err);
      }
    };

    if (isRunning) {
      acquireWakeLock();
    } else {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().then(() => {
          wakeLockRef.current = null;
        });
      }
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().then(() => {
          wakeLockRef.current = null;
        });
      }
    };
  }, [isRunning]);

  // ----------------------------
  // Actions
  // ----------------------------
  function handleStartStop() {
    // Only start if there's at least one active player
    const somePlayerWithTime = players.some((p) => !p.outOfTime && p.timeLeft > 0);
    if (!somePlayerWithTime) return;

    pushHistory();
    setIsRunning((prev) => !prev);
  }

  function handleUndo() {
    if (history.length === 0) return;
    const prevState = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));

    setPlayers(prevState.players);
    setCurrentPlayerIndex(prevState.currentPlayerIndex);
    setIsRunning(prevState.isRunning);
  }

  function handleAddTime(playerId: number, seconds: number) {
    pushHistory();
    setPlayers((prev) => {
      const copy = [...prev];
      const idx = copy.findIndex((p) => p.id === playerId);
      if (idx !== -1) {
        // Remove the outOfTime restriction so you can add time
        copy[idx].timeLeft += seconds;
        // If they're no longer at 0, restore them to "not out of time"
        if (copy[idx].timeLeft > 0) {
          copy[idx].outOfTime = false;
        }
      }
      return copy;
    });
  }

  // Saves current snapshot to the history stack
  function pushHistory() {
    const snapshot: GameState = {
      players: structuredClone(players),
      currentPlayerIndex,
      isRunning,
      history: [],
    };
    setHistory((prev) => [...prev, snapshot]);
  }

  // Find the next player who isn't out of time
  function findNextActivePlayerIndex(currentIdx: number, list: Player[]): number | null {
    const total = list.length;
    for (let i = 1; i <= total; i++) {
      const next = (currentIdx + i) % total;
      if (!list[next].outOfTime && list[next].timeLeft > 0) {
        return next;
      }
    }
    return null;
  }

  // ----------------------------
  // Format Time
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
  // Modal: Edit All Player Names
  // ----------------------------
  function openEditNamesModal() {
    setEditPlayers(structuredClone(players));
    setShowEditNamesModal(true);
  }

  function closeEditNamesModal() {
    setShowEditNamesModal(false);
  }

  function saveAllNames() {
    pushHistory();
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

  if (players.length === 0) {
    return null;
  }

  const totalTimeLeft = players.reduce((acc, p) => acc + p.timeLeft, 0);

  return (
    <div className="relative flex min-h-screen flex-col items-center bg-gray-100 p-4 dark:bg-gray-900">
      {/* TOTAL TIME HEADER */}
      <div className="my-2 text-center">
        <div className="text-sm uppercase tracking-wider text-gray-600 dark:text-gray-300">
          Total time left
        </div>
        <div
          className="font-mono text-3xl font-bold text-gray-700 dark:text-gray-100"
          style={{
            textShadow: "0 0 2px rgba(0, 0, 0, 0.2)",
          }}
        >
          {formatTime(totalTimeLeft)}
        </div>
      </div>

      {/* TOP BAR */}
      <div className="mb-4 flex w-full max-w-md flex-wrap items-center justify-between gap-1">
        {/* Back */}
        <button
          onClick={() => {
            const sure = window.confirm(
              "Are you sure you want to exit? This will discard the current game."
            );
            if (!sure) return;

            localStorage.removeItem("clockState");
            navigate("/");
          }}
          className="inline-flex items-center gap-1 rounded-md bg-gray-400 px-3 py-2 text-sm text-white hover:bg-gray-500"
        >
          <span className="text-base">←</span>
          <span>Back</span>
        </button>

        {/* Undo */}
        <button
          onClick={handleUndo}
          className="inline-flex items-center gap-1 rounded-md bg-yellow-500 px-3 py-2 text-sm text-white hover:bg-yellow-600"
        >
          <span className="text-base">↩</span>
          <span>Undo</span>
        </button>

        {/* Edit */}
        <button
          onClick={openEditNamesModal}
          className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700"
        >
          <span className="text-base">✏️</span>
          <span>Edit</span>
        </button>

        {/* Start / Pause (fixed width to prevent layout shift) */}
        <button
          onClick={handleStartStop}
          className="inline-flex w-[80px] items-center justify-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 transition-colors duration-200"
        >
          <span className="text-base">{isRunning ? "⏸" : "▶️"}</span>
          <span>{isRunning ? "Pause" : "Start"}</span>
        </button>
      </div>

      {/* PLAYER CLOCKS */}
      <div className="w-full max-w-md space-y-4">
        {players.map((player, idx) => {
          const isActive = idx === currentPlayerIndex && !player.outOfTime;

          // Always use a 4px border so the size won't change; switch to border-blue-500 if active
          const baseClasses = [
            "relative", // needed so we can absolutely-position the 'Paused' label
            "flex",
            "items-center",
            "justify-between",
            "rounded-lg",
            "border-4",
            "p-4",
            "shadow-sm",
            "transition-all",
            "duration-300",
            "ease-in-out",
          ];

          if (player.outOfTime) {
            // If out of time, override background color (fades to red)
            baseClasses.push("border-transparent bg-red-100 dark:bg-red-800 opacity-80");
          } else if (isActive) {
            // Active player gets a border + tinted background
            baseClasses.push("cursor-pointer border-blue-500 bg-blue-50 dark:bg-blue-800");
          } else {
            // Normal, not active
            baseClasses.push("border-transparent bg-white dark:bg-gray-800");
          }

          // Time styling
          const isLowTime = player.timeLeft <= 10 && !player.outOfTime;
          const timeColorClass = isLowTime
            ? "text-red-500"
            : "text-gray-800 dark:text-gray-100";

          return (
            <div
              key={player.id}
              onClick={() => {
                if (!isActive) return;
        
                if (isRunning) {
                  // If the timer is running and you click the active player:
                  // 1. Push history for undo
                  // 2. Apply increment to the old player
                  // 3. Move to the next active player (if any)
                  pushHistory();
                  const oldPlayer = players[currentPlayerIndex];
                  
                  if (increment > 0 && !oldPlayer.outOfTime) {
                    setPlayers((prev) => {
                      const copy = [...prev];
                      copy[currentPlayerIndex].timeLeft += increment;
                      return copy;
                    });
                  }
                  // Move to next
                  const nextIndex = findNextActivePlayerIndex(currentPlayerIndex, players);
                  if (nextIndex !== null) {
                    setCurrentPlayerIndex(nextIndex);
                  }
                } else {
                  // If the timer is paused and you click the active player, restart the clock
                  handleStartStop();
                }
              }}
              className={baseClasses.join(" ")}
            >
              {/* CONTENT (name + time) */}
              <div className="flex flex-col">
                <div className="mb-4 flex items-center">
                  <span className="w-32 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {player.name}
                  </span>
                </div>

                {!player.outOfTime ? (
                  <span className={`font-mono text-xl font-bold leading-none ${timeColorClass}`}>
                    {formatTime(player.timeLeft)}
                  </span>
                ) : (
                  <span className="font-mono text-xl font-bold leading-none text-red-600 dark:text-red-300">
                    Time’s Up!
                  </span>
                )}
              </div>

              {/* +10s Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddTime(player.id, 10);
                }}
                className="cursor-pointer inline-flex items-center gap-1 rounded-md bg-green-600 px-4 py-2 text-base font-bold text-white hover:bg-green-700"
                style={{ minWidth: "70px", justifyContent: "center" }}
              >
                +10s
              </button>

              {/* ABSOLUTE "Paused" LABEL IN THE CENTER */}
              <span
                className={`absolute top-1/2 left-1/2 flex h-8 w-20 items-center justify-center 
                            rounded bg-yellow-300 text-sm font-bold text-gray-800 shadow transition-all 
                            duration-300 transform -translate-x-1/2 -translate-y-1/2 
                            ${isActive && !isRunning ? "" : "invisible opacity-0"}`}
              >
                Paused
              </span>
            </div>
          );
        })}
      </div>

      {/* MODAL: Edit All Player Names */}
      {showEditNamesModal && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-md dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Edit Player Names
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
                className="inline-flex items-center gap-1 rounded-md bg-red-400 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 dark:bg-red-600 dark:hover:bg-red-500"
              >
                <span>Cancel</span>
              </button>
              <button
                type="button"
                onClick={saveAllNames}
                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}