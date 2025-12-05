# Theme System Documentation

## Overview

TuvixRSS features a sophisticated, extensible theming system built with TypeScript, React Context, CSS Variables, and Tailwind CSS v4. The system supports multiple pre-built themes with full customization of colors, fonts, border radius, and visual effects.

## Table of Contents

- [Architecture](#architecture)
- [Core Concepts](#core-concepts)
- [Available Themes](#available-themes)
- [Using Themes](#using-themes)
- [Adding New Themes](#adding-new-themes)
- [Advanced Customization](#advanced-customization)
- [API Reference](#api-reference)

## Architecture

### Key Components

1. **Theme Provider** (`packages/app/src/components/provider/theme-provider.tsx`)
   - Manages theme state and persistence
   - Applies CSS variables dynamically
   - Handles system theme detection

2. **Theme Registry** (`packages/app/src/lib/themes/themes.ts`)
   - Central registry of all available themes
   - Utility functions for theme access

3. **Theme Types** (`packages/app/src/lib/themes/types.ts`)
   - TypeScript interfaces and types
   - Ensures type safety across the system

4. **Global Styles** (`packages/app/src/index.css`)
   - CSS variable definitions
   - Tailwind CSS v4 configuration
   - Theme-specific overrides

### File Structure

```
packages/app/src/lib/themes/
├── types.ts              # Type definitions
├── themes.ts             # Theme registry and utilities
├── light.ts              # Light theme
├── dark.ts               # Dark theme
├── nord.ts               # Nord theme
├── material.ts           # Material Design theme
├── material.css          # Material theme CSS overrides
├── minimal.ts            # Minimal theme
├── minimal.css           # Minimal theme CSS overrides
├── hackernews.ts         # Hacker News theme
├── hackernews.css        # Hacker News theme CSS overrides
├── win95.ts              # Windows 95 theme
├── win95.css             # Windows 95 theme CSS overrides
└── README.md             # Theme development guide
```

## Core Concepts

### Theme Structure

Every theme implements the `ThemeConfig` interface:

```typescript
interface ThemeConfig {
  id: string; // Unique identifier
  name: string; // Display name
  description?: string; // Optional description
  colors: ColorPalette; // Color definitions
  fonts: FontConfig; // Font stacks
  radius: BorderRadiusConfig; // Border radius values
  grain: GrainConfig; // Grain overlay effect
}
```

### Color Palette

The color system uses OKLCH (OK Lightness Chroma Hue) color space for perceptually uniform colors:

```typescript
interface ColorPalette {
  // Base colors
  background: string;
  foreground: string;

  // Card colors
  card: string;
  cardForeground: string;

  // Semantic colors
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;

  // UI elements
  border: string;
  input: string;
  ring: string;

  // Chart colors
  chart1-5: string;

  // Sidebar colors
  sidebar: string;
  sidebarForeground: string;
  // ... more sidebar colors

  // Logo colors
  logoPrimary: string;
  logoSecondary: string;
}
```

### OKLCH Color Space

Format: `oklch(lightness chroma hue)`

- **Lightness**: 0-1 (0=black, 1=white)
- **Chroma**: 0-0.4+ (0=grayscale, higher=saturated)
- **Hue**: 0-360 (color wheel degrees)

**Example**: `oklch(0.5 0.2 250)` = medium blue

**Benefits**:

- Perceptually uniform color transitions
- Better color manipulation
- Wide gamut support
- Human-friendly parameters

### CSS Variables

All theme values are applied as CSS variables on the `:root` element:

```css
:root {
  --background: oklch(0.98 0 0);
  --foreground: oklch(0.15 0 0);
  --primary: oklch(0.4 0.2 250);
  --radius: 0.625rem;
  --grain-opacity: 0.06;
  /* ... more variables */
}
```

## Available Themes

### Light Theme

- **Style**: Clean, bright, professional
- **Colors**: High contrast grayscale with blue accents
- **Radius**: 0.625rem (10px)
- **Grain**: 0.06 opacity
- **Use Case**: Default system theme, daytime viewing

### Dark Theme (Default)

- **Style**: Low-light optimized
- **Colors**: Dark backgrounds with light text
- **Radius**: 0.625rem
- **Grain**: 0.06 opacity
- **Use Case**: Night viewing, reduced eye strain

### Nord Theme

- **Style**: Arctic, north-bluish developer theme
- **Colors**: Based on [Nord color palette](https://www.nordtheme.com)
- **Palette**: Polar Night, Snow Storm, Frost, Aurora
- **Radius**: 0.625rem
- **Grain**: 0.06 opacity
- **Use Case**: Developer preference, cold aesthetic

### Material Theme

- **Style**: Material Design 3 inspired
- **Colors**: Tonal color system
- **Features**: Pill-shaped buttons, no borders
- **Radius**: 1rem (cards), 9999px (buttons)
- **Grain**: 0.06 opacity
- **Use Case**: Modern, elevated UI feel

### Minimal Theme

- **Style**: Ultra-minimal, print-friendly
- **Colors**: Pure grayscale, high contrast
- **Features**: No borders, no radius, no grain
- **Radius**: 0
- **Grain**: 0 (disabled)
- **Use Case**: Distraction-free reading, printing

### Hacker News Theme

- **Style**: Nostalgic, utilitarian
- **Colors**: Classic HN orange (#ff6600) and beige
- **Features**: Custom header styling
- **Radius**: 0.25rem
- **Grain**: 0.02 opacity (subtle)
- **Use Case**: Retro aesthetic, HN enthusiasts

### Windows 95 Theme

- **Style**: Classic Windows 95 with 3D beveled UI
- **Colors**: Classic Win95 gray (#c0c0c0) background with blue (#000080) accents
- **Features**: 3D outset/inset borders, square corners, MS Sans Serif font
- **Radius**: 0 (square corners)
- **Grain**: 0 (disabled)
- **Use Case**: Nostalgic Windows 95 aesthetic, retro computing enthusiasts
- **3D Effects**: Buttons use outset borders (raised), inputs use inset borders (sunken), cards use outset borders (window chrome)

### System Theme

- **Behavior**: Automatically follows OS dark/light mode preference
- **Implementation**: Uses `prefers-color-scheme` media query
- **Resolves To**: Light or Dark theme based on system

## Using Themes

### In Components

#### Method 1: Tailwind Utility Classes (Recommended)

```tsx
export function MyComponent() {
  return (
    <div className="bg-background text-foreground border border-border rounded-lg">
      <h1 className="text-primary font-bold">Title</h1>
      <p className="text-muted-foreground">Description</p>
    </div>
  );
}
```

Common class patterns:

- `bg-background`, `text-foreground`
- `bg-card`, `text-card-foreground`
- `bg-primary`, `text-primary-foreground`
- `bg-muted`, `text-muted-foreground`
- `border-border`, `ring-ring`

#### Method 2: Direct CSS Variables

```tsx
export function CustomComponent() {
  return (
    <div
      style={{
        backgroundColor: "var(--background)",
        color: "var(--foreground)",
        borderRadius: "var(--radius)",
      }}
    >
      Custom styled content
    </div>
  );
}
```

#### Method 3: Access Theme Config

```tsx
import { useTheme } from "@/components/provider/theme-provider";
import { getTheme } from "@/lib/themes/themes";

export function ThemeAwareComponent() {
  const { theme } = useTheme();
  const themeConfig = getTheme(theme);

  return (
    <div
      style={{
        backgroundColor: themeConfig.colors.background,
        borderRadius: themeConfig.radius.value,
      }}
    >
      Theme: {themeConfig.name}
    </div>
  );
}
```

### Switching Themes

```tsx
import { useTheme } from "@/components/provider/theme-provider";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <select value={theme} onChange={(e) => setTheme(e.target.value)}>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="nord">Nord</option>
      <option value="material">Material</option>
      <option value="minimal">Minimal</option>
      <option value="hackernews">Hacker News</option>
      <option value="win95">Windows 95</option>
      <option value="system">System</option>
    </select>
  );
}
```

### Theme Persistence

Themes are automatically persisted to:

1. **localStorage** (key: `vite-ui-theme`) - Immediate persistence
2. **User settings API** - Synced to backend for cross-device support

## Adding New Themes

### Step-by-Step Guide

#### 1. Create Theme File

Create a new file: `packages/app/src/lib/themes/my-theme.ts`

```typescript
import type { ThemeConfig } from "./types";

export const myTheme: ThemeConfig = {
  id: "mytheme",
  name: "My Theme",
  description: "A brief description of your theme",

  colors: {
    // Base colors
    background: "oklch(0.95 0.01 220)",
    foreground: "oklch(0.2 0.02 220)",

    // Card colors
    card: "oklch(0.98 0.01 220)",
    cardForeground: "oklch(0.2 0.02 220)",

    // Popover colors
    popover: "oklch(0.98 0.01 220)",
    popoverForeground: "oklch(0.2 0.02 220)",

    // Primary colors
    primary: "oklch(0.5 0.2 250)",
    primaryForeground: "oklch(0.98 0.01 220)",

    // Secondary colors
    secondary: "oklch(0.92 0.02 220)",
    secondaryForeground: "oklch(0.2 0.02 220)",

    // Muted colors
    muted: "oklch(0.92 0.02 220)",
    mutedForeground: "oklch(0.45 0.02 220)",

    // Accent colors
    accent: "oklch(0.92 0.02 220)",
    accentForeground: "oklch(0.2 0.02 220)",

    // Destructive
    destructive: "oklch(0.5 0.2 25)",

    // UI elements
    border: "oklch(0.88 0.02 220)",
    input: "oklch(0.88 0.02 220)",
    ring: "oklch(0.5 0.2 250)",

    // Chart colors
    chart1: "oklch(0.6 0.2 10)",
    chart2: "oklch(0.6 0.2 150)",
    chart3: "oklch(0.6 0.2 250)",
    chart4: "oklch(0.6 0.2 50)",
    chart5: "oklch(0.6 0.2 310)",

    // Sidebar colors
    sidebar: "oklch(0.98 0.01 220)",
    sidebarForeground: "oklch(0.2 0.02 220)",
    sidebarPrimary: "oklch(0.5 0.2 250)",
    sidebarPrimaryForeground: "oklch(0.98 0.01 220)",
    sidebarAccent: "oklch(0.92 0.02 220)",
    sidebarAccentForeground: "oklch(0.2 0.02 220)",
    sidebarBorder: "oklch(0.88 0.02 220)",
    sidebarRing: "oklch(0.5 0.2 250)",

    // Logo colors
    logoPrimary: "oklch(0.5 0.2 250)",
    logoSecondary: "oklch(0.4 0.15 280)",
  },

  fonts: {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: '"SF Mono", Monaco, "Cascadia Code", monospace',
  },

  radius: {
    value: "0.5rem",
    button: "0.5rem", // Optional: custom button radius
  },

  grain: {
    opacity: 0.06, // 0-1, or 0 to disable
  },
};
```

#### 2. Update ThemeId Type

Edit `packages/app/src/lib/themes/types.ts`:

```typescript
export type ThemeId =
  | "light"
  | "dark"
  | "nord"
  | "material"
  | "minimal"
  | "hackernews"
  | "mytheme" // Add your theme ID
  | "system";
```

#### 3. Register Theme

Edit `packages/app/src/lib/themes/themes.ts`:

```typescript
import { myTheme } from "./my-theme";

export const themes: Record<ThemeId, ThemeConfig> = {
  light: lightTheme,
  dark: darkTheme,
  nord: nordTheme,
  material: materialTheme,
  minimal: minimalTheme,
  hackernews: hackernewsTheme,
  mytheme: myTheme, // Add your theme
  system: lightTheme,
};
```

#### 4. Add Theme Metadata

In the same file (`themes.ts`), add metadata:

```typescript
export const themeMetadata: Record<ThemeId, ThemeMetadata> = {
  // ... existing themes

  mytheme: {
    id: "mytheme",
    name: "My Theme",
    description: "A brief description of your theme",
    previewColors: {
      primary: myTheme.colors.primary,
      background: myTheme.colors.background,
      accent: myTheme.colors.accent,
    },
  },

  // ... system theme
};
```

#### 5. Update Theme Provider Class List

Edit `packages/app/src/components/provider/theme-provider.tsx`:

Find the theme class removal section (around line 163) and add your theme:

```typescript
document.documentElement.classList.remove(
  "light",
  "dark",
  "nord",
  "material",
  "minimal",
  "hackernews",
  "win95",
  "mytheme" // Add your theme
);
```

#### 6. Add CSS Overrides (Optional)

If your theme needs custom CSS that can't be achieved with CSS variables alone, create a CSS file:

**Create**: `packages/app/src/lib/themes/my-theme.css`

```css
/* My Theme - custom styling */
.mytheme [data-slot="button"] {
  /* Your custom CSS rules */
}
```

**Import in**: `packages/app/src/index.css`

```css
/* Import theme-specific CSS overrides */
@import "./lib/themes/my-theme.css";
```

#### 7. Test Your Theme

1. Run the development server: `pnpm dev`
2. Navigate to Settings → Theme
3. Select your new theme from the list
4. Verify all colors, borders, and effects work correctly

### Color Selection Tips

1. **Start with Base Colors**: Define background and foreground first
2. **Maintain Contrast**: Ensure text is readable (WCAG AA minimum: 4.5:1)
3. **Use Color Tools**:
   - [OKLCH Color Picker](https://oklch.com)
   - [Coolors](https://coolors.co) for palette inspiration
4. **Test Accessibility**: Use browser DevTools contrast checker
5. **Keep Semantic Consistency**: Primary should feel primary across themes

### Testing Checklist

- [ ] All text is readable
- [ ] Buttons have clear hover states
- [ ] Borders are visible where expected
- [ ] Charts use distinct colors
- [ ] Dark/light variants work appropriately
- [ ] Sidebar colors are consistent
- [ ] Form inputs are clearly defined
- [ ] Focus states (ring) are visible

## Advanced Customization

### Theme-Specific CSS Overrides

For themes that need custom CSS overrides (beyond what CSS variables can provide), create a separate CSS file co-located with your theme TypeScript file:

**Create**: `packages/app/src/lib/themes/my-theme.css`

```css
/* My Theme - custom styling */
.mytheme [data-slot="card"] {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.mytheme [data-slot="button"] {
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.mytheme header[data-slot="breadcrumb"] {
  background: linear-gradient(to right, var(--primary), var(--accent));
}
```

**Import in**: `packages/app/src/index.css`

```css
/* Import theme-specific CSS overrides */
@import "./lib/themes/my-theme.css";
```

The CSS file will be automatically imported and bundled. All CSS rules are scoped by the theme class (e.g., `.mytheme`), so they only apply when that theme is active.

### Using data-slot Attributes

Add `data-slot` attributes to components you want to target:

```tsx
export function Card({ children }: CardProps) {
  return (
    <div data-slot="card" className="bg-card rounded-xl border">
      {children}
    </div>
  );
}
```

### Custom Font Loading

To use custom web fonts:

1. Add font files to `packages/app/public/fonts/`
2. Define `@font-face` in `index.css`
3. Update font stack in your theme config:

```typescript
fonts: {
  sans: '"My Custom Font", system-ui, sans-serif',
  mono: '"Custom Mono", "SF Mono", monospace',
}
```

### Grain Effect Customization

The grain overlay adds texture to the UI:

- **Disable**: Set `grain.opacity: 0`
- **Subtle**: Use `0.02-0.04`
- **Medium**: Use `0.05-0.08`
- **Strong**: Use `0.09-0.12`

Replace grain texture by updating `packages/app/public/grain.gif`

### Dynamic Radius

Customize border radius per component type:

```typescript
radius: {
  value: "0.75rem",     // Default radius
  button: "9999px",     // Pill-shaped buttons
}
```

Access in CSS:

- `--radius`: Base radius
- `--button-radius`: Button-specific radius
- `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`: Calculated variants

## API Reference

### useTheme Hook

```typescript
const { theme, setTheme } = useTheme();
```

**Returns:**

- `theme`: Current theme ID (string)
- `setTheme`: Function to change theme

### Theme Utilities

#### getTheme(themeId: ThemeId): ThemeConfig

Get theme configuration by ID. Resolves "system" to light/dark.

```typescript
import { getTheme } from "@/lib/themes/themes";

const config = getTheme("nord");
console.log(config.colors.primary); // "oklch(0.68 0.1 220)"
```

#### getAvailableThemeIds(): ThemeId[]

Get array of selectable theme IDs (excludes "system").

```typescript
import { getAvailableThemeIds } from "@/lib/themes/themes";

const ids = getAvailableThemeIds();
// ["light", "dark", "nord", "material", "minimal", "hackernews"]
```

#### isValidThemeId(id: string): id is ThemeId

Type guard for theme ID validation.

```typescript
import { isValidThemeId } from "@/lib/themes/themes";

if (isValidThemeId(userInput)) {
  setTheme(userInput);
}
```

#### getThemeMetadata(themeId: ThemeId): ThemeMetadata

Get display metadata for a theme.

```typescript
import { getThemeMetadata } from "@/lib/themes/themes";

const metadata = getThemeMetadata("nord");
console.log(metadata.name); // "Nord"
console.log(metadata.description); // "Arctic, north-bluish color palette"
```

#### getAllThemeMetadata(): ThemeMetadata[]

Get metadata for all themes (for UI display).

```typescript
import { getAllThemeMetadata } from "@/lib/themes/themes";

const allThemes = getAllThemeMetadata();
// Array of theme metadata objects
```

### CSS Variables Reference

#### Colors

```css
var(--background)
var(--foreground)
var(--card)
var(--card-foreground)
var(--primary)
var(--primary-foreground)
var(--secondary)
var(--secondary-foreground)
var(--muted)
var(--muted-foreground)
var(--accent)
var(--accent-foreground)
var(--destructive)
var(--border)
var(--input)
var(--ring)
var(--chart-1) through var(--chart-5)
var(--sidebar-*)
var(--logo-primary)
var(--logo-secondary)
```

#### Layout

```css
var(--radius)
var(--radius-sm)
var(--radius-md)
var(--radius-lg)
var(--radius-xl)
var(--button-radius)
```

#### Typography

```css
var(--font-sans)
var(--font-mono)
```

#### Effects

```css
var(--grain-opacity)
var(--grain-blend-mode)
```

## Best Practices

### Do's ✓

- **Use OKLCH**: Perceptually uniform, predictable color manipulation
- **Use CSS Variables**: Never hardcode colors
- **Use Semantic Colors**: `primary`, `muted`, etc. instead of specific colors
- **Test All Themes**: Verify your component works with all themes
- **Maintain Contrast**: WCAG AA minimum (4.5:1 for text)
- **Use `cn()` Utility**: For class merging
- **Use `data-slot`**: For theme-specific targeting

### Don'ts ✗

- **Don't Hardcode Colors**: Use CSS variables or Tailwind classes
- **Don't Use Hex/RGB**: OKLCH provides better color space
- **Don't Skip Accessibility**: Test contrast ratios
- **Don't Forget Foreground**: Every background needs a foreground color
- **Don't Ignore System Theme**: Test with OS dark/light mode
- **Don't Duplicate Variables**: Reuse existing semantic colors

## Troubleshooting

### Theme Not Applying

1. Check theme ID is registered in `themes.ts`
2. Verify theme class is added to classList in theme-provider.tsx
3. Clear localStorage and retry
4. Check browser console for errors

### Colors Look Wrong

1. Verify OKLCH syntax: `oklch(L C H)` with spaces
2. Check lightness is 0-1 (not 0-100)
3. Verify chroma is appropriate (usually 0-0.3)
4. Test in different browsers (OKLCH support varies)

### Theme Not Persisting

1. Check localStorage permissions
2. Verify theme-provider is mounted at app root
3. Check for JavaScript errors preventing save

### Poor Contrast

1. Use browser DevTools contrast checker
2. Adjust lightness values
3. Test with actual content, not Lorem Ipsum
4. Consider colorblind users (use tools like [Coblis](https://www.color-blindness.com/coblis-color-blindness-simulator/))

## Resources

- [OKLCH Color Picker](https://oklch.com)
- [Nord Theme Documentation](https://www.nordtheme.com/docs)
- [Material Design 3 Colors](https://m3.material.io/styles/color/overview)
- [WCAG Contrast Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)

## Examples

### Complete Theme Example

See `packages/app/src/lib/themes/nord.ts` for a well-documented, complete theme implementation.

### Minimal Theme Example

See `packages/app/src/lib/themes/minimal.ts` for a theme with special features (no borders, no grain).

### Theme with Custom CSS

See Material theme (`material.ts`) with its CSS overrides in `material.css` for flat design customization.

### Theme with 3D Effects

See Windows 95 theme (`win95.ts`) with its CSS overrides in `win95.css` for 3D beveled UI effects using `border-style: inset/outset`.

---

For additional help, refer to the README in `packages/app/src/lib/themes/README.md` or open an issue on GitHub.
