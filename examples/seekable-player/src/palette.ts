// Canonical Solarized Dark palette (https://ethanschoonover.com/solarized/).
// Channel colors below use a hue rotation across the wheel for visual
// distinguishability, not the solarized accents.
export const SOLARIZED = {
    base03: "#002b36",
    base02: "#073642",
    base01: "#586e75",
    base1: "#93a1a1",
    base2: "#eee8d5",
    red: "#dc322f",
} as const;

// "1" = black key, "0" = white key, indexed by `noteNumber % 12` starting at C.
export const BLACK_KEY = "010100101010";

export const channelColor = (ch: number, active: boolean): string => {
    if (ch === 9) return active ? SOLARIZED.base1 : SOLARIZED.base01;
    const hue = (ch * 360) / 16;
    const lightness = active ? 62 : 44;
    const saturation = active ? 75 : 55;
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
};
