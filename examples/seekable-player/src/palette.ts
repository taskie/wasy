import { getResolvedTheme } from "./theme.js";

// Solarized palette — https://ethanschoonover.com/solarized/
export const SOLARIZED = {
    base03: "#002b36",
    base02: "#073642",
    base01: "#586e75",
    base1: "#93a1a1",
    base2: "#eee8d5",
    base3: "#fdf6e3",
    red: "#dc322f",
} as const;

// "1" = black key, "0" = white key, indexed by `noteNumber % 12` starting at C.
export const BLACK_KEY = "010100101010";

export type CanvasPalette = {
    bg: string;
    bgAlt: string;
    gridLine: string;
    label: string;
    keyWhite: string;
    keyBlack: string;
    noteOverlay: string;
    accent: string;
};

const DARK_PALETTE: CanvasPalette = {
    bg: SOLARIZED.base03,
    bgAlt: SOLARIZED.base02,
    gridLine: SOLARIZED.base01,
    label: SOLARIZED.base01,
    keyWhite: SOLARIZED.base2,
    keyBlack: SOLARIZED.base03,
    noteOverlay: SOLARIZED.base2,
    accent: SOLARIZED.red,
};

const LIGHT_PALETTE: CanvasPalette = {
    bg: SOLARIZED.base3,
    bgAlt: SOLARIZED.base2,
    gridLine: SOLARIZED.base1,
    label: SOLARIZED.base01,
    keyWhite: SOLARIZED.base3,
    keyBlack: SOLARIZED.base02,
    noteOverlay: SOLARIZED.base03,
    accent: SOLARIZED.red,
};

export function getCanvasPalette(): CanvasPalette {
    return getResolvedTheme() === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
}

export const channelColor = (ch: number, active: boolean): string => {
    const dark = getResolvedTheme() === "dark";
    if (ch === 9) {
        if (active) return dark ? SOLARIZED.base1 : SOLARIZED.base01;
        return dark ? SOLARIZED.base01 : SOLARIZED.base1;
    }
    const hue = (ch * 360) / 16;
    if (active) return `hsl(${hue} 80% ${dark ? 62 : 38}%)`;
    return `hsl(${hue} 55% ${dark ? 44 : 48}%)`;
};
