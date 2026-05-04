import { midi, type TimedEvent } from "wasy";
import { channelColor } from "./palette.js";

// Per-event categories the filter UI exposes. They group `Event` subclasses
// into the buckets a user actually wants to toggle (e.g. all CC together,
// all Meta together) — finer than the class hierarchy, coarser than the
// per-event-type level.
type Category = "note" | "cc" | "bend" | "program" | "pressure" | "meta" | "sysex";

const CATEGORY_LABELS: Record<Category, string> = {
    note: "Note",
    cc: "CC",
    bend: "Bend",
    program: "Program",
    pressure: "Pressure",
    meta: "Meta",
    sysex: "SysEx",
};

interface Row {
    tick: number;
    channel: number | null; // null = non-channel (Meta / SysEx)
    category: Category;
    typeLabel: string;
    detail: string;
}

// Cap on how many rows live in the buffer / DOM at once. Dense SMFs emit
// hundreds of events per second; keeping it bounded means the log stays a
// rolling window instead of a memory leak. The user can pause to inspect.
const MAX_ROWS = 200;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const formatNote = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

// Names for the most common CCs. Unknown numbers just show "CC <n>".
const CC_NAMES: Record<number, string> = {
    0: "Bank MSB",
    1: "Modulation",
    6: "Data MSB",
    7: "Volume",
    10: "Panpot",
    11: "Expression",
    32: "Bank LSB",
    38: "Data LSB",
    64: "Sustain",
    65: "Portamento",
    66: "Sostenuto",
    67: "Soft",
    71: "Resonance",
    74: "Brightness",
    91: "Reverb",
    93: "Chorus",
    98: "NRPN LSB",
    99: "NRPN MSB",
    100: "RPN LSB",
    101: "RPN MSB",
    120: "AllSoundOff",
    121: "ResetAllControl",
    123: "AllNotesOff",
};

const eventToRow = (e: TimedEvent): Row | null => {
    const m = e.midiEvent;
    const tick = m.tick;
    if (m instanceof midi.NoteOnEvent) {
        return {
            tick,
            channel: m.channel,
            category: "note",
            typeLabel: "Note On",
            detail: `${formatNote(m.noteNumber)} (${m.noteNumber}) vel=${m.velocity}`,
        };
    }
    if (m instanceof midi.NoteOffEvent) {
        return {
            tick,
            channel: m.channel,
            category: "note",
            typeLabel: "Note Off",
            detail: `${formatNote(m.noteNumber)} (${m.noteNumber}) vel=${m.velocity}`,
        };
    }
    if (m instanceof midi.ControlChangeEvent) {
        const name = CC_NAMES[m.controller];
        return {
            tick,
            channel: m.channel,
            category: "cc",
            typeLabel: `CC ${m.controller}`,
            detail: name != null ? `${name} = ${m.value}` : String(m.value),
        };
    }
    if (m instanceof midi.ProgramChangeEvent) {
        return {
            tick,
            channel: m.channel,
            category: "program",
            typeLabel: "Program",
            detail: String(m.program),
        };
    }
    if (m instanceof midi.PitchBendEvent) {
        return {
            tick,
            channel: m.channel,
            category: "bend",
            typeLabel: "Pitch Bend",
            detail: `${m.value > 0 ? "+" : ""}${m.value}`,
        };
    }
    if (m instanceof midi.PolyphonicKeyPressureEvent) {
        return {
            tick,
            channel: m.channel,
            category: "pressure",
            typeLabel: "Poly Aftertouch",
            detail: "",
        };
    }
    if (m instanceof midi.ChannelPressureEvent) {
        return {
            tick,
            channel: m.channel,
            category: "pressure",
            typeLabel: "Aftertouch",
            detail: "",
        };
    }
    if (m instanceof midi.TempoMetaEvent) {
        return {
            tick,
            channel: null,
            category: "meta",
            typeLabel: "Tempo",
            detail: `${m.beatsPerMinute.toFixed(2)} BPM`,
        };
    }
    if (m instanceof midi.MarkerMetaEvent) {
        return { tick, channel: null, category: "meta", typeLabel: "Marker", detail: m.text() };
    }
    if (m instanceof midi.LyricMetaEvent) {
        return { tick, channel: null, category: "meta", typeLabel: "Lyric", detail: m.text() };
    }
    if (m instanceof midi.CopyrightMetaEvent) {
        return { tick, channel: null, category: "meta", typeLabel: "Copyright", detail: m.text() };
    }
    if (m instanceof midi.SequenceTrackNameMetaEvent) {
        return { tick, channel: null, category: "meta", typeLabel: "Track Name", detail: m.text() };
    }
    if (m instanceof midi.InstrumentNameMetaEvent) {
        return { tick, channel: null, category: "meta", typeLabel: "Instrument", detail: m.text() };
    }
    if (m instanceof midi.CuePointMetaEvent) {
        return { tick, channel: null, category: "meta", typeLabel: "Cue Point", detail: m.text() };
    }
    if (m instanceof midi.TextMetaEvent) {
        return { tick, channel: null, category: "meta", typeLabel: "Text", detail: m.text() };
    }
    if (m instanceof midi.MetaEvent) {
        return {
            tick,
            channel: null,
            category: "meta",
            typeLabel: `Meta 0x${m.typeIndex.toString(16).padStart(2, "0")}`,
            detail: "",
        };
    }
    if (m instanceof midi.SystemExclusiveEvent) {
        return {
            tick,
            channel: null,
            category: "sysex",
            typeLabel: "SysEx",
            detail: `${m.dataView.byteLength} bytes`,
        };
    }
    return null;
};

// Subscribes to TimedEvents and renders a rolling list grouped by category.
// Events arrive on the audio scheduling cadence (very dense for busy SMFs);
// to avoid layout thrash, `onTimedEvent` only enqueues, and `draw()` (called
// from the host's animation-frame loop) flushes the queue into the DOM.
export class EventLogView {
    private filters: Record<Category, boolean> = {
        note: true,
        cc: true,
        bend: true,
        program: true,
        pressure: true,
        meta: true,
        sysex: true,
    };
    private paused = false;
    // Ring buffer of the last MAX_ROWS rows the user has not cleared. Kept
    // separately from the DOM so toggling a filter can re-render from
    // history without losing context.
    private buffer: Row[] = [];
    private pending: Row[] = [];
    private listEl!: HTMLElement;
    private pauseButton!: HTMLButtonElement;

    constructor(private root: HTMLElement) {
        this.render();
    }

    onTimedEvent(e: TimedEvent) {
        if (this.paused) return;
        const row = eventToRow(e);
        if (row == null) return;
        this.pending.push(row);
    }

    clear() {
        this.buffer = [];
        this.pending = [];
        this.listEl.replaceChildren();
    }

    draw() {
        if (this.pending.length === 0) return;
        const fragment = document.createDocumentFragment();
        for (const row of this.pending) {
            this.buffer.push(row);
            if (this.filters[row.category]) {
                fragment.appendChild(this.makeRow(row));
            }
        }
        if (this.buffer.length > MAX_ROWS) {
            this.buffer.splice(0, this.buffer.length - MAX_ROWS);
        }
        this.listEl.appendChild(fragment);
        while (this.listEl.childElementCount > MAX_ROWS) {
            this.listEl.firstElementChild?.remove();
        }
        this.pending.length = 0;
        this.listEl.scrollTop = this.listEl.scrollHeight;
    }

    private rerenderFromBuffer() {
        this.listEl.replaceChildren();
        const fragment = document.createDocumentFragment();
        for (const row of this.buffer) {
            if (this.filters[row.category]) {
                fragment.appendChild(this.makeRow(row));
            }
        }
        this.listEl.appendChild(fragment);
        this.listEl.scrollTop = this.listEl.scrollHeight;
    }

    private makeRow(row: Row): HTMLElement {
        const div = document.createElement("div");
        div.className = "event-log-row";
        const tick = document.createElement("span");
        tick.className = "event-log-tick";
        tick.textContent = String(row.tick);
        div.appendChild(tick);
        const ch = document.createElement("span");
        ch.className = "event-log-channel";
        if (row.channel != null) {
            ch.textContent = `ch${String(row.channel + 1).padStart(2, "0")}`;
            ch.style.color = channelColor(row.channel, true);
        } else {
            ch.textContent = "—";
        }
        div.appendChild(ch);
        const type = document.createElement("span");
        type.className = "event-log-type";
        type.textContent = row.typeLabel;
        div.appendChild(type);
        const detail = document.createElement("span");
        detail.className = "event-log-detail";
        detail.textContent = row.detail;
        div.appendChild(detail);
        return div;
    }

    private render() {
        this.root.classList.add("event-log");

        const controls = document.createElement("div");
        controls.className = "event-log-controls";
        for (const cat of Object.keys(this.filters) as Category[]) {
            const label = document.createElement("label");
            label.className = "event-log-filter";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = this.filters[cat];
            cb.addEventListener("change", () => {
                this.filters[cat] = cb.checked;
                this.rerenderFromBuffer();
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode(` ${CATEGORY_LABELS[cat]}`));
            controls.appendChild(label);
        }
        const spacer = document.createElement("span");
        spacer.className = "event-log-spacer";
        controls.appendChild(spacer);
        this.pauseButton = document.createElement("button");
        this.pauseButton.type = "button";
        this.pauseButton.textContent = "pause";
        this.pauseButton.addEventListener("click", () => {
            this.paused = !this.paused;
            this.pauseButton.classList.toggle("active", this.paused);
            this.pauseButton.textContent = this.paused ? "resume" : "pause";
        });
        controls.appendChild(this.pauseButton);
        const clearButton = document.createElement("button");
        clearButton.type = "button";
        clearButton.textContent = "clear";
        clearButton.addEventListener("click", () => this.clear());
        controls.appendChild(clearButton);
        this.root.appendChild(controls);

        this.listEl = document.createElement("div");
        this.listEl.className = "event-log-list";
        this.root.appendChild(this.listEl);
    }
}
