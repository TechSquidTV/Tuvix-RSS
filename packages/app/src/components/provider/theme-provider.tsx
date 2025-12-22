import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useMemo,
} from "react";
import type { ThemeId } from "@/lib/themes/types";
import {
  getTheme,
  getAvailableThemeIds,
  isValidThemeId,
} from "@/lib/themes/themes";

type Theme = ThemeId | string; // Support any theme ID, including future ones

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

/**
 * Apply theme CSS variables to the document root
 */
function applyThemeVariables(themeId: ThemeId) {
  const theme = getTheme(themeId);
  const root = document.documentElement;

  // Apply all theme variables
  root.style.setProperty("--radius", theme.radius.value);
  // Apply button radius if specified, otherwise use regular radius
  root.style.setProperty(
    "--button-radius",
    theme.radius.button || theme.radius.value
  );
  root.style.setProperty("--font-sans", theme.fonts.sans);
  root.style.setProperty("--font-mono", theme.fonts.mono);
  root.style.setProperty("--grain-opacity", String(theme.grain.opacity));

  root.style.setProperty("--background", theme.colors.background);
  root.style.setProperty("--foreground", theme.colors.foreground);
  root.style.setProperty("--card", theme.colors.card);
  root.style.setProperty("--card-foreground", theme.colors.cardForeground);
  root.style.setProperty("--popover", theme.colors.popover);
  root.style.setProperty(
    "--popover-foreground",
    theme.colors.popoverForeground
  );
  root.style.setProperty("--primary", theme.colors.primary);
  root.style.setProperty(
    "--primary-foreground",
    theme.colors.primaryForeground
  );
  root.style.setProperty("--secondary", theme.colors.secondary);
  root.style.setProperty(
    "--secondary-foreground",
    theme.colors.secondaryForeground
  );
  root.style.setProperty("--muted", theme.colors.muted);
  root.style.setProperty("--muted-foreground", theme.colors.mutedForeground);
  root.style.setProperty("--accent", theme.colors.accent);
  root.style.setProperty("--accent-foreground", theme.colors.accentForeground);
  root.style.setProperty("--destructive", theme.colors.destructive);
  root.style.setProperty("--border", theme.colors.border);
  root.style.setProperty("--input", theme.colors.input);
  root.style.setProperty("--ring", theme.colors.ring);
  root.style.setProperty("--chart-1", theme.colors.chart1);
  root.style.setProperty("--chart-2", theme.colors.chart2);
  root.style.setProperty("--chart-3", theme.colors.chart3);
  root.style.setProperty("--chart-4", theme.colors.chart4);
  root.style.setProperty("--chart-5", theme.colors.chart5);
  root.style.setProperty("--sidebar", theme.colors.sidebar);
  root.style.setProperty(
    "--sidebar-foreground",
    theme.colors.sidebarForeground
  );
  root.style.setProperty("--sidebar-primary", theme.colors.sidebarPrimary);
  root.style.setProperty(
    "--sidebar-primary-foreground",
    theme.colors.sidebarPrimaryForeground
  );
  root.style.setProperty("--sidebar-accent", theme.colors.sidebarAccent);
  root.style.setProperty(
    "--sidebar-accent-foreground",
    theme.colors.sidebarAccentForeground
  );
  root.style.setProperty("--sidebar-border", theme.colors.sidebarBorder);
  root.style.setProperty("--sidebar-ring", theme.colors.sidebarRing);
  root.style.setProperty("--logo-primary", theme.colors.logoPrimary);
  root.style.setProperty("--logo-secondary", theme.colors.logoSecondary);
}

/**
 * Load font for a theme (only if it's a web font URL)
 * For system fonts, this is a no-op
 */
function loadThemeFont(themeId: ThemeId) {
  const theme = getTheme(themeId);

  // Check if fonts are web fonts (start with http/https) or system fonts
  const isWebFont = (font: string) =>
    font.startsWith("http://") || font.startsWith("https://");

  // For now, we're using system fonts, so no font loading needed
  // This function is here for future extensibility when web fonts are added
  if (isWebFont(theme.fonts.sans) || isWebFont(theme.fonts.mono)) {
    // Future: Implement font loading logic here
    // For now, system fonts don't need loading
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored && isValidThemeId(stored)) {
      return stored;
    }
    return defaultTheme;
  });

  const previousThemeRef = useRef<ThemeId | null>(null);
  const availableThemeIds = useMemo(() => getAvailableThemeIds(), []);

  useEffect(() => {
    const root = window.document.documentElement;

    // Determine the actual theme to apply (resolve "system" if needed)
    let themeToApply: ThemeId;
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      themeToApply = systemTheme;
    } else if (isValidThemeId(theme)) {
      themeToApply = theme;
    } else {
      // Fallback to light for invalid themes (backward compatibility)
      themeToApply = "light";
    }

    // Remove all possible theme classes dynamically
    // Remove known theme classes
    root.classList.remove(
      "light",
      "dark",
      "nord",
      "material",
      "minimal",
      "hackernews",
      "win95"
    );
    // Also remove any other potential theme classes that might exist
    availableThemeIds.forEach((themeId) => {
      root.classList.remove(themeId);
    });

    // Load font only if theme changed (not on initial mount if same theme)
    // On initial mount, previousThemeRef.current is null, so this will run
    if (previousThemeRef.current !== themeToApply) {
      loadThemeFont(themeToApply);
      previousThemeRef.current = themeToApply;
    }

    // Apply theme class
    root.classList.add(themeToApply);

    // Apply CSS variables from theme config
    applyThemeVariables(themeToApply);
  }, [theme, availableThemeIds]);

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      // Validate theme ID, fallback to light for invalid themes
      const validTheme = isValidThemeId(newTheme) ? newTheme : "light";
      localStorage.setItem(storageKey, validTheme);
      setThemeState(validTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
