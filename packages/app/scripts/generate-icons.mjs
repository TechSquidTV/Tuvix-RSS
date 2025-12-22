#!/usr/bin/env node
import sharp from "sharp";
import { mkdir, access, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const publicDir = join(__dirname, "..", "public");
const iconsDir = join(publicDir, "icons");
const logoPath = join(publicDir, "tuvixrss.svg");

// Background color from sign-in page: oklch(0.269 0 0) - medium gray (bg-muted)
// Converted to RGB: approximately #3D3D3D (61, 61, 61)
const BACKGROUND_COLOR = { r: 61, g: 61, b: 61, alpha: 1 };

// Logo colors from sign-in page (TuvixLogo component)
// Primary (left side): oklch(75% 0 0) - light gray → RGB: #BFBFBF (191, 191, 191)
// Secondary (right side): oklch(30% 0 0) - dark gray → RGB: #4D4D4D (77, 77, 77)
const LOGO_PRIMARY_COLOR = { r: 191, g: 191, b: 191, alpha: 1 };
const LOGO_SECONDARY_COLOR = { r: 77, g: 77, b: 77, alpha: 1 };

// Icon sizes for PWA
const iconSizes = [
  { size: 72, name: "icon-72x72.png" },
  { size: 96, name: "icon-96x96.png" },
  { size: 128, name: "icon-128x128.png" },
  { size: 144, name: "icon-144x144.png" },
  { size: 152, name: "icon-152x152.png" },
  { size: 192, name: "icon-192x192.png" },
  { size: 384, name: "icon-384x384.png" },
  { size: 512, name: "icon-512x512.png" },
  { size: 180, name: "apple-touch-icon.png" },
];

// Maskable icons (with padding for safe zone)
const maskableIcons = [
  { size: 192, name: "icon-maskable-192x192.png" },
  { size: 512, name: "icon-maskable-512x512.png" },
];

// Shortcut icons
const shortcutIcons = [
  { size: 96, name: "shortcut-feeds.png" },
  { size: 96, name: "shortcut-unread.png" },
  { size: 96, name: "shortcut-settings.png" },
];

/**
 * Create a recolored SVG buffer with theme colors
 * Replaces hardcoded colors with logo-primary and logo-secondary colors
 */
async function createRecoloredSvg(svgPath, primaryColor, secondaryColor) {
  const svgContent = await readFile(svgPath, "utf-8");

  // Convert RGB colors to hex
  const primaryHex = `#${primaryColor.r.toString(16).padStart(2, "0")}${primaryColor.g.toString(16).padStart(2, "0")}${primaryColor.b.toString(16).padStart(2, "0")}`;
  const secondaryHex = `#${secondaryColor.r.toString(16).padStart(2, "0")}${secondaryColor.g.toString(16).padStart(2, "0")}${secondaryColor.b.toString(16).padStart(2, "0")}`;

  // Replace colors in SVG:
  // #231f20 (dark/black) → logo-primary (light gray)
  // #fff (white) → logo-secondary (dark gray)
  const recolored = svgContent
    .replace(/#231f20/gi, primaryHex)
    .replace(/#fff/gi, secondaryHex);

  return Buffer.from(recolored);
}

/**
 * Generate an icon with proper background and scaling
 * Creates a solid background canvas first, then composites the logo on top
 * This ensures no borders or transparency issues
 */
async function generateIcon(input, outputPath, size, backgroundColor) {
  // Scale logo to 90% of icon size to fill more space while maintaining aspect ratio
  const logoSize = Math.floor(size * 0.9);
  const padding = Math.floor((size - logoSize) / 2);

  // Create solid background canvas
  const backgroundCanvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: backgroundColor,
    },
  });

  // Resize logo with transparent background (will be composited)
  const logo = await sharp(input)
    .resize(logoSize, logoSize, {
      fit: "contain", // Preserve aspect ratio
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent for compositing
    })
    .toBuffer();

  // Composite logo on top of background canvas
  return backgroundCanvas
    .composite([
      {
        input: logo,
        left: padding,
        top: padding,
      },
    ])
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(outputPath);
}

/**
 * Generate maskable icon with safe zone padding
 * Safe zone is 20% of the icon size (80% inner content area)
 * Logo is scaled to ~70% of inner size to ensure it stays within safe zone
 */
async function generateMaskableIcon(input, outputPath, size, backgroundColor) {
  const safeZonePadding = Math.floor(size * 0.2); // 20% padding
  const innerSize = size - safeZonePadding * 2;
  const logoSize = Math.floor(innerSize * 0.7); // Logo at 70% of inner size
  const padding = Math.floor((innerSize - logoSize) / 2);

  // Create solid background canvas
  const backgroundCanvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: backgroundColor,
    },
  });

  // Resize logo with transparent background
  const logo = await sharp(input)
    .resize(logoSize, logoSize, {
      fit: "contain", // Preserve aspect ratio
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent for compositing
    })
    .toBuffer();

  // Composite logo on top of background (centered in safe zone)
  return backgroundCanvas
    .composite([
      {
        input: logo,
        left: safeZonePadding + padding,
        top: safeZonePadding + padding,
      },
    ])
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(outputPath);
}

/**
 * Generate favicon.ico
 * Creates a 32x32 PNG (browsers accept PNG with .ico extension)
 * Uses same generation logic as standard icons for consistency
 */
async function generateFavicon(input, outputPath, backgroundColor) {
  const size = 32;
  const logoSize = Math.floor(size * 0.9);
  const padding = Math.floor((size - logoSize) / 2);

  // Create solid background canvas
  const backgroundCanvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: backgroundColor,
    },
  });

  // Resize logo with transparent background
  const logo = await sharp(input)
    .resize(logoSize, logoSize, {
      fit: "contain", // Preserve aspect ratio
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent for compositing
    })
    .toBuffer();

  // Composite logo on top of background canvas
  return backgroundCanvas
    .composite([
      {
        input: logo,
        left: padding,
        top: padding,
      },
    ])
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(outputPath);
}

async function generateIcons() {
  console.log("🎨 Generating PWA icons with sign-in page theme colors...\n");

  // Check if logo exists
  try {
    await access(logoPath);
  } catch {
    console.error(`❌ Logo file not found at: ${logoPath}`);
    process.exit(1);
  }

  // Create icons directory if it doesn't exist
  try {
    await mkdir(iconsDir, { recursive: true });
    console.log(`✅ Icons directory ready: ${iconsDir}\n`);
  } catch (error) {
    if (error.code !== "EEXIST") {
      console.error("❌ Error creating icons directory:", error);
      process.exit(1);
    }
  }

  // Create recolored SVG with theme colors
  console.log("🎨 Recoloring logo with theme colors...");
  const recoloredSvg = await createRecoloredSvg(
    logoPath,
    LOGO_PRIMARY_COLOR,
    LOGO_SECONDARY_COLOR
  );
  console.log("  ✓ Logo recolored with sign-in page theme\n");

  const bgColor = BACKGROUND_COLOR;

  // Generate standard icons
  console.log("📦 Generating standard icons:");
  for (const { size, name } of iconSizes) {
    try {
      await generateIcon(recoloredSvg, join(iconsDir, name), size, bgColor);
      console.log(`  ✓ ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`  ✗ Failed to generate ${name}:`, error.message);
    }
  }

  // Generate maskable icons (with safe zone padding)
  console.log("\n🎭 Generating maskable icons (with safe zone):");
  for (const { size, name } of maskableIcons) {
    try {
      await generateMaskableIcon(
        recoloredSvg,
        join(iconsDir, name),
        size,
        bgColor
      );
      console.log(`  ✓ ${name} (${size}x${size}, 80% safe zone)`);
    } catch (error) {
      console.error(`  ✗ Failed to generate ${name}:`, error.message);
    }
  }

  // Generate shortcut icons
  console.log("\n🔗 Generating shortcut icons:");
  for (const { size, name } of shortcutIcons) {
    try {
      await generateIcon(recoloredSvg, join(iconsDir, name), size, bgColor);
      console.log(`  ✓ ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`  ✗ Failed to generate ${name}:`, error.message);
    }
  }

  // Generate favicon.ico
  console.log("\n🔖 Generating favicon:");
  try {
    await generateFavicon(
      recoloredSvg,
      join(publicDir, "favicon.ico"),
      bgColor
    );
    console.log("  ✓ favicon.ico (multi-size PNG format)");
  } catch (error) {
    console.error("  ✗ Failed to generate favicon.ico:", error.message);
  }

  console.log("\n✨ Icon generation complete!");
  console.log("🎨 Colors match your sign-in page theme:");
  console.log("  • Background: #3D3D3D (medium gray)");
  console.log("  • Logo primary: #BFBFBF (light gray)");
  console.log("  • Logo secondary: #4D4D4D (dark gray)\n");
}

generateIcons().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
