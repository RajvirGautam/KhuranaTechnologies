import { useTheme } from "../context/ThemeContext";

/**
 * A circular icon button that shows a sun (light mode) or moon (dark mode).
 * One click toggles the global theme.
 */
export const DarkModeToggle = ({ className = "" }: { className?: string }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      id="dark-mode-toggle"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
      className={`relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 ${
        isDark
          ? "border-slate-600 bg-slate-800 text-amber-300 hover:bg-slate-700"
          : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
      } ${className}`}
    >
      {/* Sun icon — shown in light mode */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`absolute h-5 w-5 fill-current transition-all duration-300 ${
          isDark ? "scale-0 opacity-0 rotate-90" : "scale-100 opacity-100 rotate-0"
        }`}
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>

      {/* Moon icon — shown in dark mode */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`absolute h-5 w-5 fill-current transition-all duration-300 ${
          isDark ? "scale-100 opacity-100 rotate-0" : "scale-0 opacity-0 -rotate-90"
        }`}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
};
