import type { MetaFunction } from "@remix-run/node";
import { useNavigate } from "@remix-run/react";
import { useState, useEffect, useRef, Fragment } from "react";

// HEADLESS UI
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/solid';

// DND KIT
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult
} from "@hello-pangea/dnd";

interface Player {
  id: number;
  name: string;
  timeLeft: number; // in seconds
  outOfTime?: boolean;
  dead?: boolean; // Indicates if the player is out of the game
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
        dead: false,
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

          if (!active.outOfTime && !active.dead) {
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
    // Only start if there's at least one active (alive + has time) player
    const somePlayerWithTime = players.some(
      (p) => !p.outOfTime && !p.dead && p.timeLeft > 0
    );
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
        // Remove outOfTime if we add time again
        copy[idx].timeLeft += seconds;
        if (copy[idx].timeLeft > 0) {
          copy[idx].outOfTime = false;
        }
      }
      return copy;
    });
  }

  function pushHistory() {
    const snapshot: GameState = {
      players: structuredClone(players),
      currentPlayerIndex,
      isRunning,
      history: [],
    };
    setHistory((prev) => [...prev, snapshot]);
  }

  // Find the next player who isn't outOfTime or dead
  function findNextActivePlayerIndex(currentIdx: number, list: Player[]): number | null {
    const total = list.length;
    for (let i = 1; i <= total; i++) {
      const next = (currentIdx + i) % total;
      if (!list[next].outOfTime && !list[next].dead && list[next].timeLeft > 0) {
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

  // Calculate total time left (for alive players)
  const totalTimeLeft = players
    .filter((p) => !p.dead)
    .reduce((acc, p) => acc + p.timeLeft, 0);

  // ----------------------------
  // DnD: Reorder function + onDragEnd
  // ----------------------------
  function reorder(list: Player[], startIndex: number, endIndex: number) {
    const result = Array.from(list);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return result;
  }

  function handleDragEnd(result: DropResult) {
    // dropped outside the list
    if (!result.destination) return;

    const { source, destination } = result;
    if (source.index === destination.index) return;

    pushHistory(); // allow 'undo' for reorder
    setPlayers((prev) => reorder(prev, source.index, destination.index));
    setCurrentPlayerIndex((prev) => {
      if (prev === source.index) return destination.index;
      if (prev > source.index && prev <= destination.index) return prev - 1;
      if (prev < source.index && prev >= destination.index) return prev + 1;
      return prev;
    });
  }

  // If players haven't loaded yet, bail out
  if (players.length === 0) {
    return null;
  }

  return (
    <div
      className="
        relative flex min-h-screen flex-col items-center
        p-4
        bg-gradient-to-r from-black via-purple-900 to-red-900
        dark:from-gray-900 dark:via-gray-800 dark:to-gray-900
      "
    >
      {/* TOTAL TIME HEADER */}
      <div className="my-3 text-center">
        <div className="text-xs uppercase tracking-widest text-gray-300 dark:text-gray-400">
          Total Time Left
        </div>
        <div
          className="
            bg-gradient-to-r from-red-400 via-yellow-300 to-orange-400
            bg-clip-text font-mono text-4xl font-extrabold text-transparent
            drop-shadow
          "
        >
          {formatTime(totalTimeLeft)}
        </div>
      </div>

      {/* TOP BAR */}
      <div
        className="
          mb-4 flex w-full max-w-lg flex-wrap items-center
          justify-between gap-2
        "
      >
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
          className="
            inline-flex items-center gap-1 rounded-md
            bg-gradient-to-r from-gray-500 to-gray-700
            px-2 py-2 text-sm font-bold text-white
            shadow-md hover:shadow-lg
          "
        >
          <span className="text-base">←</span>
          <span>Back</span>
        </button>

        {/* Undo */}
        <button
          onClick={handleUndo}
          className="
            inline-flex items-center gap-1 rounded-md
            bg-gradient-to-r from-yellow-400 to-yellow-500
            w-16 justify-center
            px-2 py-2 text-sm font-bold text-white shadow-md
            hover:shadow-lg
          "
        >
          <span className="text-base">↩</span>
        </button>

        {/* Start / Pause */}
        <button
          onClick={handleStartStop}
          className="
            inline-flex items-center gap-2 rounded-md
            bg-gradient-to-r from-blue-500 to-blue-700
            px-2 py-2 text-sm font-bold text-white shadow-md
            hover:shadow-lg
            w-16 justify-center
          "
        >
          <span className="text-base">{isRunning ? "⏸" : "▶️"}</span>
        </button>

        {/* Dropdown Menu for Additional Actions */}
        <Menu as="div" className="relative inline-block text-left">
          <MenuButton
            className="
              inline-flex items-center justify-center gap-1 rounded-md
              bg-gradient-to-r from-purple-500 to-purple-700
              px-2 py-2 text-sm font-bold text-white shadow-md hover:shadow-lg
            "
          >
            Options
            <ChevronDownIcon className="w-4 h-4" />
          </MenuButton>

          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <MenuItems
              className="
                absolute right-0 mt-2 w-40 origin-top-right
                rounded-md bg-white dark:bg-gray-700 shadow-lg ring-1 ring-black ring-opacity-5
                focus:outline-none z-50
              "
            >
              <div className="py-1">
                <MenuItem>
                  {({ active }) => (
                    <button
                      onClick={openEditNamesModal}
                      className={`${
                        active ? 'bg-gray-100 dark:bg-gray-600' : ''
                      } group flex w-full items-center rounded-md px-4 py-2 text-sm text-gray-700 dark:text-gray-200`}
                    >
                      ✏️ Edit
                    </button>
                  )}
                </MenuItem>
                <MenuItem>
                  {({ active }) => (
                    <button
                      onClick={() => {
                        const sure = window.confirm(
                          "Start a new game with the same players?"
                        );
                        if (!sure) return;

                        // Reset players' time and states
                        setPlayers((prevPlayers) =>
                          prevPlayers.map((p) => ({
                            ...p,
                            timeLeft: totalTime,
                            outOfTime: false,
                            dead: false,
                          }))
                        );
                        setCurrentPlayerIndex(0);
                        setIsRunning(false);
                        setHistory([]);
                      }}
                      className={`${
                        active ? 'bg-gray-100 dark:bg-gray-600' : ''
                      } group flex w-full items-center rounded-md px-4 py-2 text-sm text-gray-700 dark:text-gray-200`}
                    >
                      ♻️ New Game
                    </button>
                  )}
                </MenuItem>
              </div>
            </MenuItems>
          </Transition>
        </Menu>
      </div>

      {/* DRAG-DROP CONTEXT */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="playersDroppable">
          {(provided) => (
            <div
              className="w-full max-w-md"
              ref={provided.innerRef}
              {...provided.droppableProps}
            >
              {players.map((player, idx) => {
                // Is this player currently active (and not dead/outOfTime)?
                const isActive =
                  idx === currentPlayerIndex && !player.outOfTime && !player.dead;

                const isCurrent = idx === currentPlayerIndex;

                const baseClasses = [
                  "relative",
                  "flex",
                  "items-center",
                  "justify-between",
                  "rounded-lg",
                  "border-4",
                  "p-4",
                  "my-2",
                  "shadow-sm",
                ];

                // Player states
                if (player.dead) {
                  baseClasses.push("border-transparent bg-gray-500 opacity-60");
                } else if (player.outOfTime) {
                  baseClasses.push("border-transparent bg-red-100 dark:bg-red-800 opacity-80");
                } else if (isActive) {
                  baseClasses.push(
                    "cursor-pointer border-blue-400 bg-blue-50 dark:bg-blue-800",
                    "shadow-lg",
                    "animate-pulse-slow"
                  );
                } else {
                  baseClasses.push("border-transparent bg-gray-100 dark:bg-gray-800");
                }

                const isLowTime =
                  player.timeLeft <= (totalTime / 5) && !player.outOfTime && !player.dead;
                const timeColorClass = isLowTime
                  ? "text-red-600 dark:text-red-400"
                  : "text-gray-900 dark:text-gray-100";

                return (
                  <Draggable
                    key={player.id}
                    draggableId={`${player.id}`}
                    index={idx}
                  >
                    {(providedDrag, snapshot) => (
                      <div
                        ref={providedDrag.innerRef}
                        {...providedDrag.draggableProps}
                        {...providedDrag.dragHandleProps}
                        // Merge your classes with Draggable styles
                        className={baseClasses.join(" ")}
                        style={{
                          // So dragging item doesn't shift horizontally
                          ...providedDrag.draggableProps.style,
                          userSelect: "none",
                        }}
                        onClick={() => {
                          // If dead or outOfTime, ignore.
                          if (player.dead || player.outOfTime) return;
                          // If not active, ignore click
                          if (!isActive) return;

                          if (isRunning) {
                            // If the timer is running and you click the active player:
                            // 1. Push history for undo
                            // 2. Apply increment
                            // 3. Move to the next
                            pushHistory();
                            const oldPlayer = players[currentPlayerIndex];
                            if (increment > 0 && !oldPlayer.outOfTime && !oldPlayer.dead) {
                              setPlayers((prev) => {
                                const copy = [...prev];
                                copy[currentPlayerIndex].timeLeft += increment;
                                return copy;
                              });
                            }
                            const nextIndex = findNextActivePlayerIndex(
                              currentPlayerIndex,
                              players
                            );
                            if (nextIndex !== null) {
                              setCurrentPlayerIndex(nextIndex);
                            }
                          } else {
                            // If paused, clicking the active player resumes
                            handleStartStop();
                          }
                        }}
                      >
                        {/* CONTENT (name + time) */}
                        <div className="flex flex-col">
                          <div className="mb-4 flex items-center">
                            <span className="max-w-[8rem] truncate text-base font-bold text-gray-800 dark:text-gray-100">
                              {player.name}
                            </span>
                            {
                              isCurrent && !isRunning && (
                                <span className="ml-2 text-sm font-semibold text-blue-500 dark:text-blue-300">
                                  ⏸️
                                </span>
                              )
                            }
                          </div>

                          {!player.outOfTime && !player.dead ? (
                            <span
                              className={`font-mono text-2xl font-extrabold leading-none ${timeColorClass}`}
                            >
                              {formatTime(player.timeLeft)}
                            </span>
                          ) : player.dead ? (
                            <span className="font-mono text-2xl font-extrabold leading-none text-gray-900 dark:text-gray-200">
                              Dead
                            </span>
                          ) : (
                            <span className="font-mono text-2xl font-extrabold leading-none text-red-600 dark:text-red-300">
                              Time’s Up!
                            </span>
                          )}
                        </div>

                        <div className="flex flex-row items-center justify-between space-x-2">
                          {/* +10s Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddTime(player.id, 10);
                            }}
                            className="
                              inline-flex items-center justify-center gap-1
                              rounded-md bg-gradient-to-r from-green-500 to-green-700
                              px-2 py-1 text-sm font-semibold text-white
                              shadow-md hover:shadow-lg
                            "
                          >
                            +10s
                          </button>

                          {/* -10s Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddTime(player.id, -10);
                            }}
                            className="
                              inline-flex items-center justify-center gap-1
                              rounded-md bg-gradient-to-r from-red-500 to-red-700
                              px-2 py-1 text-sm font-semibold text-white
                              shadow-md hover:shadow-lg
                            "
                          >
                            -10s
                          </button>

                          {/* Kill / Revive Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              pushHistory();

                              // Toggle the 'dead' status
                              const updatedPlayers = players.map((p) =>
                                p.id === player.id ? { ...p, dead: !p.dead } : p
                              );
                              setPlayers(updatedPlayers);

                              if (!player.dead) {
                                // If the player was just killed, pause the game
                                setIsRunning(false);
                                const nextIndex = findNextActivePlayerIndex(
                                  currentPlayerIndex,
                                  updatedPlayers
                                );
                                if (nextIndex !== null) {
                                  setCurrentPlayerIndex(nextIndex);
                                } else {
                                  alert("No active players left!");
                                }
                              } else if (player.dead) {
                                // If revived, set them as current, pause the game
                                setCurrentPlayerIndex(player.id);
                                setIsRunning(false);
                              }
                            }}
                            className="
                              inline-flex items-center justify-center gap-1
                              rounded-md bg-gradient-to-r from-gray-500 to-gray-700
                              px-2 py-1 text-sm font-semibold text-white
                              shadow-md hover:shadow-lg
                            "
                          >
                            {player.dead ? "Revive" : "Kill"}
                          </button>
                        </div>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* MODAL: Edit All Player Names */}
      {showEditNamesModal && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div
            className="
              w-full max-w-md rounded-lg bg-gray-50 p-6 shadow-2xl
              dark:bg-gray-800
            "
          >
            <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-gray-100">
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
                    className="
                      rounded-md border border-gray-300 px-3 py-2 text-gray-800
                      focus:outline-none dark:border-gray-600 dark:bg-gray-700
                      dark:text-gray-100
                    "
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
                className="
                  inline-flex items-center gap-1 rounded-md
                  bg-red-400 px-3 py-2 text-sm font-semibold text-white
                  transition-colors hover:bg-red-500 dark:bg-red-600 dark:hover:bg-red-500
                "
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAllNames}
                className="
                  inline-flex items-center gap-1 rounded-md
                  bg-blue-600 px-3 py-2 text-sm font-semibold text-white
                  transition-colors hover:bg-blue-700
                "
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
