import { MAX_LOOKAHEAD_SECONDS, MIN_LOOKAHEAD_SECONDS, type SmfPlayer } from "wasy";

const STORAGE_KEY = "wasy-lookahead-ms";
const DEFAULT_LOOKAHEAD_MS = 200;

const loadStoredMs = (): number => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw == null) return DEFAULT_LOOKAHEAD_MS;
        const ms = Number(raw);
        if (!Number.isFinite(ms)) return DEFAULT_LOOKAHEAD_MS;
        return Math.min(MAX_LOOKAHEAD_SECONDS * 1000, Math.max(MIN_LOOKAHEAD_SECONDS * 1000, ms));
    } catch {
        return DEFAULT_LOOKAHEAD_MS;
    }
};

// Player preferences panel. Currently a single setting: the scheduling
// lookahead (`SmfPlayer.lookaheadSeconds`). Changing it mid-playback
// would shift the audible timeline (already-dispatched events keep the
// old offset), so the control is locked while the song is playing —
// `Main.refreshButtons` drives `setLocked` alongside the transport
// buttons. The value persists to localStorage and is re-applied when
// the SmfPlayer is (re)created.
export class PreferenceView {
    private player: SmfPlayer | null = null;
    private slider!: HTMLInputElement;
    private readout!: HTMLOutputElement;
    private lockNote!: HTMLParagraphElement;
    private lookaheadMs: number;

    constructor(private root: HTMLElement) {
        this.lookaheadMs = loadStoredMs();
        this.render();
    }

    setPlayer(player: SmfPlayer) {
        this.player = player;
        this.apply();
    }

    setLocked(locked: boolean) {
        this.slider.disabled = locked;
        this.lockNote.hidden = !locked;
    }

    private apply() {
        if (this.player == null) return;
        this.player.lookaheadSeconds = this.lookaheadMs / 1000;
    }

    private render() {
        const row = document.createElement("div");
        row.className = "preference-row";

        const label = document.createElement("label");
        label.textContent = "Scheduling lookahead";
        label.htmlFor = "lookaheadSlider";
        row.appendChild(label);

        this.slider = document.createElement("input");
        this.slider.id = "lookaheadSlider";
        this.slider.type = "range";
        this.slider.min = String(MIN_LOOKAHEAD_SECONDS * 1000);
        this.slider.max = "500";
        this.slider.step = "10";
        this.slider.value = String(this.lookaheadMs);
        this.slider.addEventListener("input", () => {
            this.lookaheadMs = Number(this.slider.value);
            this.readout.value = `${this.lookaheadMs} ms`;
            this.apply();
            try {
                localStorage.setItem(STORAGE_KEY, String(this.lookaheadMs));
            } catch {
                // localStorage unavailable (private mode etc.) — non-fatal.
            }
        });
        row.appendChild(this.slider);

        this.readout = document.createElement("output");
        this.readout.value = `${this.lookaheadMs} ms`;
        row.appendChild(this.readout);

        this.root.appendChild(row);

        this.lockNote = document.createElement("p");
        this.lockNote.className = "hint";
        this.lockNote.textContent = "Stop playback to change the lookahead.";
        this.lockNote.hidden = true;
        this.root.appendChild(this.lockNote);

        const hint = document.createElement("p");
        hint.className = "hint";
        hint.textContent =
            "Events are scheduled this far ahead of the audio clock. Larger = more robust against timer jitter; " +
            "smaller = tighter sync between the views (piano roll / keyboard lead the sound by this amount) and the audio. " +
            "Applies while stopped; persisted in this browser.";
        this.root.appendChild(hint);
    }
}
