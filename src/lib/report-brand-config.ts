/* ------------------------------------------------------------------ */
/*  Report Brand Config — Branding system for PPTX/PDF exports        */
/*                                                                     */
/*  Each organisation can define its own brand palette, logo, and      */
/*  identity for exported reports. SignalStack always appears as       */
/*  "Powered by" — the client brand is front and centre.              */
/*                                                                     */
/*  To add a new org brand:                                           */
/*  1. Add an entry to ORG_BRAND_MAP keyed by org slug                */
/*  2. Set logoSvg to an SVG string (or null for text-only)           */
/*  3. Future: store brand config in organizations.settings JSONB     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ReportBrandConfig {
  /** Organisation name shown on cover slide */
  orgName: string;
  /** Short tagline/descriptor below name */
  tagline?: string;
  /** Primary brand color (hex without #) — used for accents, bars */
  primaryColor: string;
  /** Secondary color — used for headings, dark text */
  accentColor: string;
  /** Dark text color */
  darkColor: string;
  /** Gray text color — subtitles, footers */
  grayColor: string;
  /** Light background — cards, table stripes */
  lightBgColor: string;
  /** Table header background */
  tableHeaderColor: string;
  /** Table stripe background */
  tableStripeColor: string;
  /**
   * Logo as inline SVG string. Set null for text-only rendering.
   *
   * PLACEHOLDER: Replace with actual logo SVG or set logoBase64 for PNG.
   * To add your brand logo:
   *   1. Export logo as SVG (preferred) or PNG
   *   2. For SVG: paste the <svg>...</svg> string here
   *   3. For PNG: convert to base64 and set logoBase64 instead
   */
  logoSvg: string | null;
  /**
   * Logo as base64 data URI (e.g., "data:image/png;base64,iVBOR...")
   * Takes priority over logoSvg when both are set.
   *
   * PLACEHOLDER: Upload your brand logo PNG and convert to base64.
   */
  logoBase64: string | null;
  /** Logo display width in inches (default: 2.5) */
  logoWidth: number;
  /** Logo display height in inches (default: 0.7) */
  logoHeight: number;
  /** Website URL shown in footer */
  url?: string;
  /** Contact email */
  email?: string;
  /** Show "CONFIDENTIAL" watermark on cover */
  confidential?: boolean;
}

/* ------------------------------------------------------------------ */
/*  SVG Logo Generators                                                */
/*                                                                     */
/*  These generate text-based logos when no image file is available.   */
/*  Replace with actual brand logo files when provided.               */
/* ------------------------------------------------------------------ */

/**
 * Generate a clean text-based logo SVG for Pot Strategy.
 *
 * PLACEHOLDER — Replace with actual Pot Strategy logo file.
 * To replace: set logoBase64 to a data:image/png;base64 string
 * of the real logo, or replace this SVG with the real SVG.
 */
function makePotStrategyLogoSvg(): string {
  return [
    '<svg width="320" height="90" xmlns="http://www.w3.org/2000/svg">',
    '<rect width="320" height="90" fill="transparent"/>',
    '<text x="0" y="34" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="bold" fill="#1A1A1A" letter-spacing="6">POT</text>',
    '<text x="0" y="66" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="400" fill="#1A1A1A" letter-spacing="10">STRATEGY</text>',
    '<rect x="0" y="76" width="140" height="3" rx="1.5" fill="#C5A572"/>',
    '</svg>',
  ].join("");
}

/**
 * Generate a "Powered by SignalStack" badge SVG for slide footers.
 */
function makeSignalStackBadgeSvg(): string {
  return [
    '<svg width="240" height="40" xmlns="http://www.w3.org/2000/svg">',
    '<rect width="240" height="40" fill="transparent"/>',
    '<text x="0" y="14" font-family="Arial, Helvetica, sans-serif" font-size="9" fill="#9CA3AF" letter-spacing="1">POWERED BY</text>',
    '<text x="0" y="32" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="bold" fill="#C5A572" letter-spacing="3">SIGNALSTACK</text>',
    '</svg>',
  ].join("");
}

/* ------------------------------------------------------------------ */
/*  Brand Configs                                                      */
/* ------------------------------------------------------------------ */

/**
 * Pot Strategy — first organisation on SignalStack.
 * Intelligence arm of Pot Strategy (Pty) Ltd.
 *
 * LOGO PLACEHOLDER: Replace logoSvg/logoBase64 with the real
 * Pot Strategy logo when available. The text-based SVG below
 * is a temporary stand-in.
 */
export const POT_STRATEGY_BRAND: ReportBrandConfig = {
  orgName: "Pot Strategy",
  tagline: "Intelligence Arm of Pot Strategy (Pty) Ltd",
  primaryColor: "C5A572",       // Warm gold
  accentColor: "1A1A1A",        // Near-black
  darkColor: "1A1A1A",
  grayColor: "6B7280",
  lightBgColor: "F7F6F3",       // Warm light
  tableHeaderColor: "1A1A1A",
  tableStripeColor: "FAF9F7",
  logoSvg: makePotStrategyLogoSvg(),
  logoBase64: null,              // ← PLACEHOLDER: add real logo base64 here
  logoWidth: 2.8,
  logoHeight: 0.8,
  url: "signalstack.africa",
  email: "hello@signalstack.africa",
  confidential: true,
};

/**
 * Default SignalStack brand — used when user is not in any org
 * or the org has no custom brand config.
 */
export const SIGNALSTACK_DEFAULT: ReportBrandConfig = {
  orgName: "SignalStack",
  tagline: "Commerce Intelligence Harmoniser",
  primaryColor: "C5A572",
  accentColor: "1A1A1A",
  darkColor: "1A1A1A",
  grayColor: "6B7280",
  lightBgColor: "F3F4F6",
  tableHeaderColor: "1F2937",
  tableStripeColor: "F9FAFB",
  logoSvg: null,
  logoBase64: null,
  logoWidth: 2,
  logoHeight: 0.5,
  url: "signalstack.africa",
  email: "hello@signalstack.africa",
};

/* ------------------------------------------------------------------ */
/*  Org → Brand resolution                                             */
/*                                                                     */
/*  Currently a static map. In future, brand config will live in the  */
/*  organizations.settings JSONB column and be fetched dynamically.    */
/* ------------------------------------------------------------------ */

const ORG_BRAND_MAP: Record<string, ReportBrandConfig> = {
  "pot-strategy": POT_STRATEGY_BRAND,
  "pot-labs": POT_STRATEGY_BRAND,
};

/**
 * Resolve the brand config for a given org slug.
 * Falls back to SIGNALSTACK_DEFAULT if no custom brand exists.
 *
 * Future: merge with org.settings.brand from database.
 */
export function getBrandForOrg(orgSlug: string | null): ReportBrandConfig {
  if (orgSlug && ORG_BRAND_MAP[orgSlug]) {
    return ORG_BRAND_MAP[orgSlug];
  }
  return SIGNALSTACK_DEFAULT;
}

/**
 * The "Powered by SignalStack" badge SVG — shared across all brands.
 */
export const SIGNALSTACK_BADGE_SVG = makeSignalStackBadgeSvg();

/* ------------------------------------------------------------------ */
/*  Utility: SVG → PNG base64 (browser-side)                           */
/*                                                                     */
/*  Converts an inline SVG string to a PNG data URI for PptxGenJS.    */
/*  PptxGenJS handles PNG more reliably than SVG in most renderers.   */
/* ------------------------------------------------------------------ */

export async function svgToPngDataUri(
  svgString: string,
  width: number,
  height: number,
  scale: number = 2,
): Promise<string> {
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG image load failed"));
    });

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
