/**
 * Email Template Renderer
 *
 * Renders React Email components to HTML strings.
 * Currently unused as Resend handles React components directly,
 * but kept for potential future use (testing, previews, etc.)
 */

import * as React from "react";

// Note: react-email render function is available but not needed
// when using Resend's react prop directly
// Keeping this file for potential future use

/**
 * Render a React Email component to HTML
 * (Currently unused - Resend handles React components directly)
 *
 * @param component React Email component
 * @param props Props to pass to the component
 * @returns Object with html and text versions
 */
export async function renderEmailTemplate<P extends Record<string, unknown>>(
  _component: React.ComponentType<P>,
  _props: P
): Promise<{ html: string; text: string }> {
  // This would require react-email/render but we're not using it
  // Resend handles React components directly via the 'react' prop
  throw new Error(
    "renderEmailTemplate is not currently used - Resend handles React components directly"
  );
}
