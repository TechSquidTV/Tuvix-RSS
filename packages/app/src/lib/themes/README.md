# Theme System Documentation

## Overview

The theme system provides a flexible, extensible way to manage visual themes across the application. It supports multiple themes (Light, Dark, Nord, Material) with customizable colors, fonts, border radius, and other design tokens. Themes are defined in TypeScript configuration files and applied dynamically via CSS variables.

## Architecture

The theme system consists of three main parts:

1. **Theme Configurations** (`*.ts` files) - Define theme properties (colors, fonts, radius, etc.)
2. **Theme Provider** (`theme-provider.tsx`) - React context that applies themes and manages theme state
3. **CSS Variables** (`index.css`) - Global CSS that uses theme-controlled variables

### File Structure

```
packages/app/src/lib/themes/
├── types.ts          # TypeScript interfaces and types
├── themes.ts         # Theme registry and utilities
├── light.ts          # Light theme configuration
├── dark.ts           # Dark theme configuration
├── nord.ts           # Nord theme configuration
├── material.ts       # Material Design 3 theme configuration
└── README.md         # This documentation
```

## How It Works

### 1. Theme Configuration

Each theme is defined as a TypeScript object implementing the `ThemeConfig` interface:

```typescript
export const lightTheme: ThemeConfig = {
  id: "light",
  name: "Light",
  description: "Clean and bright theme",
  colors: {
    background: "oklch(1 0 0)",
    foreground: "oklch(0.145 0 0)",
    // ... more colors
  },
  fonts: {
    sans: "system-ui, -apple-system, ...",
    mono: "ui-monospace, SFMono-Regular, ...",
  },
  radius: {
    value: "0.625rem",
    button: "0.625rem", // Optional: custom button radius
  },
  grain: {
    opacity: 0.06,
  },
};
```

### 2. Theme Registration

Themes are registered in `themes.ts`:

```typescript
export const themes: Record<ThemeId, ThemeConfig> = {
  light: lightTheme,
  dark: darkTheme,
  nord: nordTheme,
  material: materialTheme,
  system: lightTheme, // Special: resolves to light/dark based on OS
};
```

### 3. Theme Application

The `ThemeProvider` component:

- Reads the theme configuration
- Applies CSS variables to `document.documentElement`
- Adds a theme class (e.g., `.material`) to the HTML element
- Persists theme preference in localStorage

### 4. CSS Variables

Components use CSS variables that are dynamically set by the theme provider:

```css
.my-component {
  background-color: var(--background);
  color: var(--foreground);
  border-radius: var(--radius);
}
```

## Adding a New Theme

### Step 1: Create Theme Configuration File

Create a new file `packages/app/src/lib/themes/my-theme.ts`:

```typescript
import type { ThemeConfig } from "./types";

export const myTheme: ThemeConfig = {
  id: "my-theme",
  name: "My Theme",
  description: "A custom theme",
  colors: {
    background: "oklch(0.2 0.05 250)",
    foreground: "oklch(0.9 0.02 250)",
    // ... define all required colors
    // See ColorPalette interface in types.ts for full list
  },
  fonts: {
    sans: "system-ui, sans-serif",
    mono: "ui-monospace, monospace",
  },
  radius: {
    value: "0.5rem",
    button: "9999px", // Optional: pill-shaped buttons
  },
  grain: {
    opacity: 0.05,
  },
};
```

### Step 2: Register Theme

Add to `themes.ts`:

```typescript
import { myTheme } from "./my-theme";

export const themes: Record<ThemeId, ThemeConfig> = {
  // ... existing themes
  "my-theme": myTheme,
};
```

### Step 3: Update TypeScript Types

Add to `ThemeId` type in `types.ts`:

```typescript
export type ThemeId =
  "light" | "dark" | "nord" | "material" | "my-theme" | "system";
```

### Step 4: Add Theme Metadata

Add to `themeMetadata` in `themes.ts`:

```typescript
export const themeMetadata: Record<ThemeId, ThemeMetadata> = {
  // ... existing themes
  "my-theme": {
    id: "my-theme",
    name: "My Theme",
    description: "A custom theme",
    previewColors: {
      primary: myTheme.colors.primary,
      background: myTheme.colors.background,
      accent: myTheme.colors.accent,
    },
  },
};
```

### Step 5: Update Theme Provider

Add the new theme ID to the class removal list in `theme-provider.tsx`:

```typescript
root.classList.remove("light", "dark", "nord", "material", "my-theme");
```

## Theme Configuration Structure

### Colors

All colors use the `oklch()` color space for perceptual uniformity. The `ColorPalette` interface defines all required colors:

- **Base Colors**: `background`, `foreground`
- **Component Colors**: `card`, `popover`, `input`, `border`
- **Semantic Colors**: `primary`, `secondary`, `accent`, `muted`, `destructive`
- **Chart Colors**: `chart1` through `chart5`
- **Sidebar Colors**: `sidebar`, `sidebarForeground`, `sidebarPrimary`, etc.
- **Logo Colors**: `logoPrimary`, `logoSecondary`

Each color should have a corresponding foreground color (e.g., `primary` + `primaryForeground`).

### Fonts

```typescript
fonts: {
  sans: string; // Primary sans-serif font stack
  mono: string; // Monospace font stack
}
```

Currently supports system fonts. Web fonts (URLs starting with `http://` or `https://`) are planned for future support.

### Border Radius

```typescript
radius: {
  value: string;        // Base radius (e.g., "0.625rem")
  button?: string;      // Optional button-specific radius (e.g., "9999px")
}
```

The `button` property is optional. If not specified, buttons use the base `value`.

### Grain Overlay

```typescript
grain: {
  opacity: number; // 0-1, typically 0.06
}
```

Controls the opacity of the grain texture overlay effect.

## Usage Examples

### Using Theme Hook

```typescript
import { useTheme } from "@/components/provider/theme-provider";

function MyComponent() {
  const { theme, setTheme } = useTheme();

  return (
    <button onClick={() => setTheme("dark")}>
      Current theme: {theme}
    </button>
  );
}
```

### Using CSS Variables

```css
.my-card {
  background-color: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.my-button {
  border-radius: var(--button-radius); /* Uses theme's button radius */
}
```

### Theme-Specific CSS Rules

For theme-specific styling, use the theme class selector:

```css
.material [data-slot="card"] {
  border: none; /* Material theme: flat design, no borders */
}
```

## CSS Variables Reference

All CSS variables are prefixed with `--` and set on `:root`:

### Layout & Spacing

- `--radius`: Base border radius
- `--button-radius`: Button-specific border radius

### Typography

- `--font-sans`: Sans-serif font stack
- `--font-mono`: Monospace font stack

### Colors

- `--background`, `--foreground`
- `--card`, `--card-foreground`
- `--popover`, `--popover-foreground`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--muted`, `--muted-foreground`
- `--accent`, `--accent-foreground`
- `--destructive`
- `--border`
- `--input`
- `--ring`
- `--chart-1` through `--chart-5`
- `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, etc.
- `--logo-primary`, `--logo-secondary`

### Effects

- `--grain-opacity`: Grain overlay opacity

## Best Practices

### 1. Use OKLCH Color Space

Always use `oklch()` for colors. It provides perceptual uniformity and better color manipulation:

```typescript
// ✅ Good
background: "oklch(0.2 0.05 250)";

// ❌ Avoid
background: "#333333";
```

### 2. Maintain Contrast Ratios

Ensure foreground colors have sufficient contrast against their backgrounds. Use tools like [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) to verify.

### 3. Consistent Color Mapping

Map colors consistently across themes:

- `primary` should always be the main brand/accent color
- `destructive` should always indicate errors/danger
- `muted` should always be subtle/secondary

### 4. Test All Themes

When adding new components or styles, test them in all available themes to ensure consistency.

### 5. Avoid Hardcoded Colors

Never hardcode colors in components. Always use CSS variables:

```typescript
// ✅ Good
className = "bg-card text-card-foreground";

// ❌ Bad
className = "bg-white text-black";
```

### 6. Theme-Specific Rules

Only add theme-specific CSS rules when absolutely necessary. Prefer using CSS variables that can be customized per theme.

## System Theme

The `"system"` theme is special - it automatically resolves to `"light"` or `"dark"` based on the user's OS preference (`prefers-color-scheme` media query). It's the default theme for new users.

## Color Space: OKLCH

We use OKLCH (OK Lightness Chroma Hue) color space because:

1. **Perceptual Uniformity**: Equal changes in OKLCH values produce equal perceived changes
2. **Better Color Manipulation**: Easier to create color variations (lighter/darker, more/less saturated)
3. **Wide Gamut Support**: Supports colors outside sRGB
4. **Human-Friendly**: Hue, chroma, and lightness are intuitive concepts

### OKLCH Format

```
oklch(lightness chroma hue)
```

- **Lightness**: 0-1 (0 = black, 1 = white)
- **Chroma**: 0-0.4+ (0 = grayscale, higher = more saturated)
- **Hue**: 0-360 (degrees on color wheel)

Example: `oklch(0.5 0.2 250)` = medium lightness, moderate saturation, blue hue

## Component Theming

Components should use `data-slot` attributes for theme-specific styling:

```tsx
<button data-slot="button" className="...">
  Click me
</button>
```

This allows CSS selectors like `.material [data-slot="button"]` to target specific components in specific themes.

## Future Enhancements

Planned improvements:

1. **Web Font Support**: Load custom fonts when theme fonts are URLs
2. **Theme Presets**: Pre-built theme variations (e.g., "Nord Light", "Nord Dark")
3. **Custom Theme Builder**: UI for users to create custom themes
4. **Theme Transitions**: Smooth transitions when switching themes
5. **Theme Export/Import**: Share themes between users

## Troubleshooting

### Theme Not Applying

1. Check that theme is registered in `themes.ts`
2. Verify theme ID is added to `ThemeId` type
3. Ensure `ThemeProvider` is wrapping your app
4. Check browser console for errors

### Colors Not Updating

1. Verify CSS variables are being set (check DevTools → Elements → Computed)
2. Ensure components use CSS variables, not hardcoded colors
3. Check that theme class is applied to `<html>` element

### Button Radius Not Working

1. Verify `--button-radius` is set in theme config
2. Check that buttons have `data-slot="button"` attribute
3. Ensure CSS override rule is in `@layer utilities`

## Related Files

- `packages/app/src/components/provider/theme-provider.tsx` - Theme React context
- `packages/app/src/index.css` - Global CSS with theme variables
- `packages/app/src/components/settings/theme-selector.tsx` - Theme selection UI
- `packages/app/src/routes/app/settings.tsx` - Settings page with theme selector
