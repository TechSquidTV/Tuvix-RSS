/**
 * Theme Registry and Utilities
 *
 * Central registry for all themes and utilities for theme management.
 * Theme metadata is client-side only and not stored in the database.
 */

import type { ThemeConfig, ThemeId, ThemeMetadata } from "./types";
import { lightTheme } from "./light";
import { darkTheme } from "./dark";
import { nordTheme } from "./nord";
import { materialTheme } from "./material";
import { minimalTheme } from "./minimal";
import { hackernewsTheme } from "./hackernews";
import { win95Theme } from "./win95";

/**
 * Registry of all available themes
 */
export const themes: Record<ThemeId, ThemeConfig> = {
  light: lightTheme,
  dark: darkTheme,
  nord: nordTheme,
  material: materialTheme,
  minimal: minimalTheme,
  hackernews: hackernewsTheme,
  win95: win95Theme,
  // System theme is handled specially - it maps to light or dark
  system: lightTheme, // Default fallback, actual resolution happens in theme provider
};

/**
 * Get theme configuration by ID
 */
export function getTheme(themeId: ThemeId): ThemeConfig {
  if (themeId === "system") {
    // System theme resolves to light or dark based on OS preference
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    return prefersDark ? themes.dark : themes.light;
  }
  return themes[themeId] || themes.light;
}

/**
 * Get all available theme IDs (excluding system)
 */
export function getAvailableThemeIds(): ThemeId[] {
  return [
    "light",
    "dark",
    "nord",
    "material",
    "minimal",
    "hackernews",
    "win95",
  ];
}

/**
 * Check if a theme ID is valid
 */
export function isValidThemeId(themeId: string): themeId is ThemeId {
  return themeId === "system" || themeId in themes;
}

/**
 * Theme metadata for UI display
 */
export const themeMetadata: Record<ThemeId, ThemeMetadata> = {
  light: {
    id: "light",
    name: "Light",
    description: "Clean and bright theme",
    previewColors: {
      primary: lightTheme.colors.primary,
      background: lightTheme.colors.background,
      accent: lightTheme.colors.accent,
    },
  },
  dark: {
    id: "dark",
    name: "Dark",
    description: "Easy on the eyes for low-light environments",
    previewColors: {
      primary: darkTheme.colors.primary,
      background: darkTheme.colors.background,
      accent: darkTheme.colors.accent,
    },
  },
  nord: {
    id: "nord",
    name: "Nord",
    description: "Arctic, north-bluish color palette",
    previewColors: {
      primary: nordTheme.colors.primary,
      background: nordTheme.colors.background,
      accent: nordTheme.colors.accent,
    },
  },
  material: {
    id: "material",
    name: "Material",
    description: "Material Design 3 color system",
    previewColors: {
      primary: materialTheme.colors.primary,
      background: materialTheme.colors.background,
      accent: materialTheme.colors.accent,
    },
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Minimal, flat, print-friendly theme",
    previewColors: {
      primary: minimalTheme.colors.primary,
      background: minimalTheme.colors.background,
      accent: minimalTheme.colors.accent,
    },
  },
  hackernews: {
    id: "hackernews",
    name: "Hacker News",
    description: "Classic Hacker News orange and beige",
    previewColors: {
      primary: hackernewsTheme.colors.primary,
      background: hackernewsTheme.colors.background,
      accent: hackernewsTheme.colors.accent,
    },
  },
  win95: {
    id: "win95",
    name: "Windows 95",
    description: "Classic Windows 95 with 3D beveled UI",
    previewColors: {
      primary: win95Theme.colors.primary,
      background: win95Theme.colors.background,
      accent: win95Theme.colors.accent,
    },
  },
  system: {
    id: "system",
    name: "System",
    description: "Follows your system preference",
  },
};

/**
 * Get theme metadata by ID
 */
export function getThemeMetadata(themeId: ThemeId): ThemeMetadata {
  return themeMetadata[themeId] || themeMetadata.light;
}

/**
 * Get all theme metadata for UI display
 */
export function getAllThemeMetadata(): ThemeMetadata[] {
  return Object.values(themeMetadata);
}
