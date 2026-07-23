import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

/**
 * Theme control. Both themes are designed, so this is a real choice, not a
 * gimmick — it stamps `data-theme` on the root, which the tokens honour over the
 * OS media query in both directions.
 */
function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("issue0x-theme") as Theme) ?? "system",
  );

  useEffect(() => {
    apply(theme);
    localStorage.setItem("issue0x-theme", theme);
  }, [theme]);

  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const label: Record<Theme, string> = { system: "Auto", light: "Light", dark: "Dark" };

  return (
    <button
      type="button"
      className="themetoggle"
      onClick={() => setTheme(next[theme])}
      aria-label={`Theme: ${label[theme]}. Switch to ${label[next[theme]]}.`}
      title={`Theme: ${label[theme]}`}
    >
      {label[theme]}
    </button>
  );
}
