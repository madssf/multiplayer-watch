import type { MetaFunction } from "@remix-run/node";
import { Form, useNavigate } from "@remix-run/react";
import { useState, FormEvent } from "react";

export const meta: MetaFunction = () => {
  return [
    { title: "Set Up Your Multiplayer Watch" },
    {
      name: "description",
      content: "Configuration page for a multi-player clock."
    },
  ];
};

export default function Index() {
  const navigate = useNavigate();

  // Store input values as strings so user can clear them
  const [numPlayersStr, setNumPlayersStr] = useState("2");
  const [minutesInputStr, setMinutesInputStr] = useState("5");
  const [timeMode, setTimeMode] = useState<"perPlayer" | "total">("perPlayer");
  const [incrementStr, setIncrementStr] = useState("0");

  // Parse or default the string values
  const numPlayers = parseInt(numPlayersStr, 10) || 1; // fallback to 1 if empty/NaN
  const minutesInput = parseInt(minutesInputStr, 10) || 1; // fallback to 1 if empty/NaN
  const increment = parseInt(incrementStr, 10) || 0; // fallback to 0 if empty/NaN

  // Compute final time in seconds
  const finalTimePerPlayer =
    timeMode === "perPlayer"
      ? minutesInput * 60
      : Math.max(Math.floor((minutesInput * 60) / numPlayers), 1);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Prepare the config object
    const config = {
      numPlayers,
      totalTime: finalTimePerPlayer,
      increment,
    };

    // Store config in localStorage
    localStorage.setItem("clockConfig", JSON.stringify(config));

    // Clear any old game state (so user always starts fresh)
    localStorage.removeItem("clockState");

    // Navigate to /game
    navigate("/game");
  }

  const isSubmitting = false; // For a loading state if needed

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4 dark:bg-gray-900">
      <div className="w-full max-w-md rounded-md bg-white p-6 shadow-md dark:bg-gray-800">
        <h1 className="mb-4 text-center text-2xl font-bold text-gray-800 dark:text-gray-100">
          Multiplayer Watch
        </h1>

        <Form onSubmit={handleSubmit}>
          {/* Number of Players */}
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Number of Players
          </label>
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={numPlayersStr}
            onChange={(e) => setNumPlayersStr(e.target.value)}
            className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2
              dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />

          {/* Time Mode */}
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Time Setting
          </label>
          <div className="mb-4 flex items-center space-x-4">
            <label className="flex items-center space-x-1 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="timeMode"
                value="perPlayer"
                checked={timeMode === "perPlayer"}
                onChange={() => setTimeMode("perPlayer")}
                className="form-radio"
              />
              <span>Minutes per player</span>
            </label>
            <label className="flex items-center space-x-1 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="timeMode"
                value="total"
                checked={timeMode === "total"}
                onChange={() => setTimeMode("total")}
                className="form-radio"
              />
              <span>Total minutes for all players</span>
            </label>
          </div>

          {/* Minutes */}
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Minutes
          </label>
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={minutesInputStr}
            onChange={(e) => setMinutesInputStr(e.target.value)}
            className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2
              dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />

          {/* Increment (seconds) */}
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Increment (in seconds)
          </label>
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={incrementStr}
            onChange={(e) => setIncrementStr(e.target.value)}
            className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2
              dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Starting..." : "Start Game"}
          </button>
        </Form>
      </div>
    </div>
  );
}