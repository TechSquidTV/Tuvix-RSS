// Color palette for categories (12 accessible, distinct colors)
export const CATEGORY_COLOR_PALETTE = [
  "#3B82F6", // Blue
  "#10B981", // Green
  "#F59E0B", // Yellow
  "#EF4444", // Red
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#6366F1", // Indigo
  "#14B8A6", // Teal
  "#F97316", // Orange
  "#06B6D4", // Cyan
  "#84CC16", // Lime
  "#F43F5E", // Rose
] as const;

/**
 * Generate a deterministic color for a category name
 * Same category name will always get the same color
 */
export function getColorForCategory(categoryName: string): string {
  // Simple hash: sum of character codes modulo palette size
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash += categoryName.charCodeAt(i);
  }
  return CATEGORY_COLOR_PALETTE[hash % CATEGORY_COLOR_PALETTE.length]!;
}

/**
 * Get a contrasting text color (black or white) for a given background color
 */
export function getContrastingTextColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace("#", "");

  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black for light backgrounds, white for dark
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}
