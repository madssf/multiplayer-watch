import type { MetaFunction } from "@remix-run/node";
import { Form, useNavigate } from "@remix-run/react";
import { useState, FormEvent } from "react";

export const meta: MetaFunction = () => {
  return [
    { title: "Set Up Your Multiplayer Watch" },
    {
      name: "description",
      content: "Configuration page for a multi-player clock.",
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

  // Helper to format time in mm:ss
  function formatTime(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }

  // Parse or default the string values
  const numPlayers = parseInt(numPlayersStr, 10) || 1;
  const minutesInput = parseInt(minutesInputStr, 10) || 1;
  const increment = parseInt(incrementStr, 10) || 0;

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

  // Quick preview: show final time as mm:ss
  const timePreview =
    timeMode === "perPlayer"
      ? `Each Player: ${formatTime(finalTimePerPlayer)}`
      : `Total: ${formatTime(minutesInput * 60)}
         | Per Player: ${formatTime(finalTimePerPlayer)}`;

  return (
    <div
      className="
        flex min-h-screen flex-col items-center justify-center
        bg-gradient-to-r from-black via-purple-900 to-red-900
        p-4
      "
    >
      <div
        className="
          w-full max-w-md rounded-xl p-6 shadow-2xl
          bg-gradient-to-b from-gray-100 to-gray-300
          dark:from-gray-800 dark:to-gray-700
          transition duration-500
        "
      >
        <h1
          className="
            mb-4 bg-gradient-to-r from-red-500 via-yellow-400 to-orange-400
            bg-clip-text text-center text-3xl font-extrabold text-transparent
            drop-shadow
          "
        >
          Multiplayer Watch
        </h1>

        <Form onSubmit={handleSubmit}>
          {/* Number of Players */}
          <div className="mb-5">
            <label
              htmlFor="numPlayers"
              className="block text-base font-semibold text-gray-800 dark:text-gray-200"
            >
              Number of Players
            </label>
            <input
              id="numPlayers"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={numPlayersStr}
              onChange={(e) => setNumPlayersStr(e.target.value)}
              className="
                mt-1 w-full rounded-lg border border-gray-400
                px-4 py-2 text-lg font-medium text-gray-900
                placeholder-gray-500 outline-none transition-transform
                ring-2 ring-gray-400 dark:ring-gray-700
                focus:-translate-y-0.5 focus:border-red-500 focus:ring-2 focus:ring-red-300
                dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:ring-red-500
              "
            />
          </div>

          {/* Time Mode */}
          <div className="mb-5">
            <label
              className="block text-base font-semibold text-gray-800 dark:text-gray-200"
            >
              Time Mode
            </label>
            <div className="mt-2 flex items-center space-x-6">
              <label
                className="
                  flex cursor-pointer items-center space-x-2
                  text-sm font-medium text-gray-800
                  dark:text-gray-300
                "
              >
                <input
                  type="radio"
                  name="timeMode"
                  value="perPlayer"
                  checked={timeMode === "perPlayer"}
                  onChange={() => setTimeMode("perPlayer")}
                  className="
                    form-radio h-5 w-5 text-red-500
                    focus:ring-2 focus:ring-offset-2 focus:ring-red-400
                  "
                />
                <span>Per Player</span>
              </label>
              <label
                className="
                  flex cursor-pointer items-center space-x-2
                  text-sm font-medium text-gray-800
                  dark:text-gray-300
                "
              >
                <input
                  type="radio"
                  name="timeMode"
                  value="total"
                  checked={timeMode === "total"}
                  onChange={() => setTimeMode("total")}
                  className="
                    form-radio h-5 w-5 text-red-500
                    focus:ring-2 focus:ring-offset-2 focus:ring-red-400
                  "
                />
                <span>Total</span>
              </label>
            </div>
          </div>

          {/* Minutes */}
          <div className="mb-5">
            <label
              htmlFor="minutesInput"
              className="block text-base font-semibold text-gray-800 dark:text-gray-200"
            >
              Minutes
            </label>
            <input
              id="minutesInput"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={minutesInputStr}
              onChange={(e) => setMinutesInputStr(e.target.value)}
              className="
                mt-1 w-full rounded-lg border border-gray-400
                px-4 py-2 text-lg font-medium text-gray-900
                placeholder-gray-500 outline-none transition-transform
                ring-2 ring-gray-400 dark:ring-gray-700
                focus:-translate-y-0.5 focus:border-red-500 focus:ring-2 focus:ring-red-300
                dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:ring-red-500
              "
            />
          </div>

          {/* Increment (seconds) */}
          <div className="mb-5">
            <label
              htmlFor="increment"
              className="block text-base font-semibold text-gray-800 dark:text-gray-200"
            >
              Increment (sec)
            </label>
            <input
              id="increment"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={incrementStr}
              onChange={(e) => setIncrementStr(e.target.value)}
              className="
                mt-1 w-full rounded-lg border border-gray-400
                px-4 py-2 text-lg font-medium text-gray-900
                placeholder-gray-500 outline-none transition-transform
                ring-2 ring-gray-400 dark:ring-gray-700
                focus:-translate-y-0.5 focus:border-red-500 focus:ring-2 focus:ring-red-300
                dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:ring-red-500
              "
            />
          </div>

          {/* Time Preview */}
          <div
            className="
              mb-5 rounded-md border border-gray-300 bg-gray-200
              p-3 text-center text-sm font-semibold text-gray-800
              dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100
            "
          >
            {timePreview}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="
              w-full transform rounded-full
              bg-gradient-to-r from-red-500 via-orange-400 to-yellow-400
              px-6 py-3 text-lg font-bold text-white
              drop-shadow-md transition-transform duration-200
              hover:-translate-y-1 hover:shadow-xl
              focus:outline-none focus:ring-4 focus:ring-red-300
              disabled:cursor-not-allowed disabled:opacity-50
            "
          >
            {isSubmitting ? "Starting..." : "Start Game"}
          </button>
        </Form>
      </div>
    </div>
  );
}