export type ThemeMode = "dark" | "light" | "system";

let _mode: ThemeMode = "system";
let _resolved: "dark" | "light" = "dark";

function resolve(mode: ThemeMode): "dark" | "light" {
    if (mode !== "system") return mode;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setThemeMode(mode: ThemeMode): void {
    _mode = mode;
    _resolved = resolve(mode);
    if (mode === "system") {
        delete document.documentElement.dataset.theme;
    } else {
        document.documentElement.dataset.theme = mode;
    }
    localStorage.setItem("wasy-theme", mode);
}

export function getCurrentMode(): ThemeMode {
    return _mode;
}

export function getResolvedTheme(): "dark" | "light" {
    return _resolved;
}

export function initTheme(): void {
    const saved = localStorage.getItem("wasy-theme") as ThemeMode | null;
    setThemeMode(saved ?? "system");
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (_mode === "system") {
            _resolved = resolve("system");
        }
    });
}
