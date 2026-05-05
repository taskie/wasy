type PanelConfig = {
    id: string;
    label: string;
    defaultX: number;
    defaultY: number;
    defaultVisible: boolean;
};

const PANEL_CONFIGS: PanelConfig[] = [
    { id: "panel-smf", label: "Load SMF", defaultX: 5, defaultY: 55, defaultVisible: true },
    {
        id: "panel-transport",
        label: "Transport / Seek",
        defaultX: 5,
        defaultY: 330,
        defaultVisible: true,
    },
    {
        id: "panel-analyser",
        label: "Waveform / Spectrum",
        defaultX: 5,
        defaultY: 500,
        defaultVisible: true,
    },
    {
        id: "panel-piano-roll",
        label: "Piano Roll",
        defaultX: 710,
        defaultY: 55,
        defaultVisible: true,
    },
    {
        id: "panel-keyboard",
        label: "Channel Notes",
        defaultX: 710,
        defaultY: 480,
        defaultVisible: true,
    },
    { id: "panel-mixer", label: "Mixer", defaultX: 30, defaultY: 80, defaultVisible: false },
    {
        id: "panel-event-log",
        label: "Event Log",
        defaultX: 55,
        defaultY: 105,
        defaultVisible: false,
    },
    {
        id: "panel-footnote",
        label: "About",
        defaultX: 710,
        defaultY: 770,
        defaultVisible: true,
    },
];

let zTop = 100;

function bringToFront(el: HTMLElement): void {
    el.style.zIndex = String(++zTop);
}

function applyDefaultPosition(el: HTMLElement, cfg: PanelConfig): void {
    el.style.left = `${cfg.defaultX}px`;
    el.style.top = `${cfg.defaultY}px`;
}

function makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
    let ox = 0,
        oy = 0,
        sx = 0,
        sy = 0;

    function startDrag(px: number, py: number): void {
        ox = parseInt(panel.style.left || "0", 10);
        oy = parseInt(panel.style.top || "0", 10);
        sx = px;
        sy = py;
    }

    function doDrag(px: number, py: number): void {
        panel.style.left = `${ox + px - sx}px`;
        panel.style.top = `${oy + py - sy}px`;
    }

    panel.addEventListener("mousedown", () => bringToFront(panel));

    handle.addEventListener("mousedown", (e) => {
        if ((e.target as HTMLElement).closest(".panel-close-btn")) return;
        e.preventDefault();
        startDrag(e.clientX, e.clientY);

        const onMove = (ev: MouseEvent) => doDrag(ev.clientX, ev.clientY);
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });

    handle.addEventListener(
        "touchstart",
        (e) => {
            if ((e.target as HTMLElement).closest(".panel-close-btn")) return;
            e.preventDefault();
            bringToFront(panel);
            const t = e.touches[0];
            startDrag(t.clientX, t.clientY);

            const onMove = (ev: TouchEvent) => {
                ev.preventDefault();
                doDrag(ev.touches[0].clientX, ev.touches[0].clientY);
            };
            const onEnd = () => {
                document.removeEventListener("touchmove", onMove);
                document.removeEventListener("touchend", onEnd);
            };
            document.addEventListener("touchmove", onMove, { passive: false });
            document.addEventListener("touchend", onEnd);
        },
        { passive: false },
    );
}

function syncCheckbox(panelId: string, checked: boolean): void {
    const el = document.querySelector<HTMLInputElement>(
        `.view-toggle[data-panel-id="${panelId}"] input[type="checkbox"]`,
    );
    if (el) el.checked = checked;
}

export function initPanels(): void {
    const toggles = document.getElementById("view-toggles");

    for (const cfg of PANEL_CONFIGS) {
        const panel = document.getElementById(cfg.id) as HTMLElement | null;
        if (!panel) continue;

        applyDefaultPosition(panel, cfg);
        bringToFront(panel);
        panel.hidden = !cfg.defaultVisible;

        const h2 = panel.querySelector("h2");
        if (h2) {
            const bar = document.createElement("div");
            bar.className = "panel-titlebar";
            h2.before(bar);
            bar.appendChild(h2);

            const closeBtn = document.createElement("button");
            closeBtn.className = "panel-close-btn";
            closeBtn.type = "button";
            closeBtn.textContent = "×";
            closeBtn.title = "hide";
            closeBtn.addEventListener("click", () => {
                panel.hidden = true;
                syncCheckbox(cfg.id, false);
            });
            bar.appendChild(closeBtn);

            makeDraggable(panel, bar);
        }

        if (toggles) {
            const lbl = document.createElement("label");
            lbl.className = "view-toggle";
            lbl.dataset.panelId = cfg.id;

            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = cfg.defaultVisible;
            cb.addEventListener("change", () => {
                if (cb.checked) {
                    applyDefaultPosition(panel, cfg);
                    panel.hidden = false;
                    bringToFront(panel);
                } else {
                    panel.hidden = true;
                }
            });

            lbl.appendChild(cb);
            lbl.append(" " + cfg.label);
            toggles.appendChild(lbl);
        }
    }
}
