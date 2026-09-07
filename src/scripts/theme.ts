type Theme = "light" | "dark";

let selectedTheme: Theme | null = null;
let transitionTimer: ReturnType<typeof setTimeout> | undefined;
try {
  const saved = localStorage.getItem("justinli-theme");
  if (saved === "dark" || saved === "light") selectedTheme = saved;
} catch {}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (root.dataset.theme !== theme) {
    clearTimeout(transitionTimer);
    root.dataset.themeTransition = "";
    transitionTimer = setTimeout(() => {
      delete root.dataset.themeTransition;
    }, 300);
  }
  root.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#111719" : "#f9f9f6");
  document.dispatchEvent(new Event("themechange"));
}

export function selectTheme(theme: Theme) {
  selectedTheme = theme;
  try {
    localStorage.setItem("justinli-theme", theme);
  } catch {}
  applyTheme(theme);
}

const systemTheme = matchMedia("(prefers-color-scheme: dark)");
function onSystemThemeChange(event: MediaQueryListEvent) {
  if (selectedTheme === null) applyTheme(event.matches ? "dark" : "light");
}
systemTheme.addEventListener("change", onSystemThemeChange);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearTimeout(transitionTimer);
    delete document.documentElement.dataset.themeTransition;
    systemTheme.removeEventListener("change", onSystemThemeChange);
  });
}
