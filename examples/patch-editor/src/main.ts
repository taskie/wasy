import {
    Instrument,
    compileDrumKit,
    compileTone,
    midi,
    type DrumKitDefinition,
    type DrumVoiceDefinition,
    type Envelope,
    type FrequencySpec,
    type Monophony,
    type PatchDefinition,
    type ToneDefinition,
    type ToneSource,
} from "wasy";
import "./style.css";
import { PianoKeyboard } from "./piano-keyboard.js";

const q = <T extends Element>(sel: string): T => {
    const el = document.querySelector<T>(sel);
    if (!el) throw new Error(`not found: ${sel}`);
    return el;
};

// GM drum key names (35–81).
const DRUM_NAMES: Record<number, string> = {
    35: "Acoustic Bass Drum",
    36: "Bass Drum 1",
    37: "Side Stick",
    38: "Acoustic Snare",
    39: "Hand Clap",
    40: "Electric Snare",
    41: "Low Floor Tom",
    42: "Closed Hi-hat",
    43: "High Floor Tom",
    44: "Pedal Hi-hat",
    45: "Low Tom",
    46: "Open Hi-hat",
    47: "Low-mid Tom",
    48: "Hi-mid Tom",
    49: "Crash Cymbal 1",
    50: "High Tom",
    51: "Ride Cymbal 1",
    52: "Chinese Cymbal",
    53: "Ride Bell",
    54: "Tambourine",
    55: "Splash Cymbal",
    56: "Cowbell",
    57: "Crash Cymbal 2",
    58: "Vibraslap",
    59: "Ride Cymbal 2",
    60: "Hi Bongo",
    61: "Low Bongo",
    62: "Mute Hi Conga",
    63: "Open Hi Conga",
    64: "Low Conga",
    65: "High Timbale",
    66: "Low Timbale",
    67: "High Agogo",
    68: "Low Agogo",
    69: "Cabasa",
    70: "Maracas",
    71: "Short Whistle",
    72: "Long Whistle",
    73: "Short Guiro",
    74: "Long Guiro",
    75: "Claves",
    76: "Hi Wood Block",
    77: "Low Wood Block",
    78: "Mute Cuica",
    79: "Open Cuica",
    80: "Mute Triangle",
    81: "Open Triangle",
};

const DEFAULT_TONE_DEF: ToneDefinition = {
    source: { kind: "oscillator", oscillatorType: "square" },
    envelope: { type: "adsr", attack: 0.005, release: 0.05 },
};

const DEFAULT_DRUM_KIT: DrumKitDefinition = {
    kind: "drumKit",
    busGain: 2,
    voices: {
        36: {
            name: "Bass Drum 1",
            source: { kind: "oscillator", oscillatorType: "square", pitch: { fixed: 150 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.2 },
            oneShot: true,
        },
        38: {
            name: "Acoustic Snare",
            source: { kind: "noise", filterFrequency: { fixed: 3000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.15 },
            oneShot: true,
        },
        42: {
            name: "Closed Hi-hat",
            source: { kind: "noise", filterFrequency: { fixed: 6000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
            oneShot: true,
            routing: "left",
            excludeGroup: 1,
        },
        46: {
            name: "Open Hi-hat",
            source: { kind: "noise", filterFrequency: { fixed: 6000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.4 },
            oneShot: true,
            routing: "left",
            excludeGroup: 1,
        },
        49: {
            name: "Crash Cymbal 1",
            source: { kind: "noise", filterFrequency: { fixed: 8000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 1.5 },
            oneShot: true,
        },
    },
    defaultVoice: {
        source: { kind: "noise" },
        envelope: { type: "ramp", begin: 1, end: 0, duration: 0.05 },
        oneShot: true,
    },
};

class PatchEditorApp {
    private audioContext: AudioContext | null = null;
    private instrument: Instrument<Monophony> | null = null;

    private isDrum = false;
    private toneDef: ToneDefinition = JSON.parse(JSON.stringify(DEFAULT_TONE_DEF));
    private drumDef: DrumKitDefinition = JSON.parse(JSON.stringify(DEFAULT_DRUM_KIT));
    private selectedDrumNote: number | null = null;

    private keyboard!: PianoKeyboard;
    private activeKeys = new Set<number>();

    start() {
        // Mode toggle
        q<HTMLButtonElement>("#melodyModeBtn").addEventListener("click", () => this.setMode(false));
        q<HTMLButtonElement>("#drumModeBtn").addEventListener("click", () => this.setMode(true));

        // JSON panel
        q<HTMLButtonElement>("#applyJsonBtn").addEventListener("click", () => this.applyJson());
        q<HTMLButtonElement>("#copyJsonBtn").addEventListener("click", () => this.copyJson());

        // Melody source controls
        q<HTMLSelectElement>("#sourceKind").addEventListener("change", () =>
            this.onSourceKindChange(),
        );
        q<HTMLSelectElement>("#oscType").addEventListener("change", () =>
            this.onMelodyParamChange(),
        );
        q<HTMLSelectElement>("#pitchSpec").addEventListener("change", () =>
            this.onPitchSpecChange(),
        );
        q<HTMLInputElement>("#pitchHz").addEventListener("input", () => this.onMelodyParamChange());
        q<HTMLSelectElement>("#filterFreqSpec").addEventListener("change", () =>
            this.onFilterFreqSpecChange(),
        );
        q<HTMLInputElement>("#filterFreqHz").addEventListener("input", () =>
            this.onMelodyParamChange(),
        );

        // Melody envelope controls
        q<HTMLSelectElement>("#envType").addEventListener("change", () => this.onEnvTypeChange());
        for (const id of [
            "attack",
            "hold",
            "decay",
            "sustain",
            "fade",
            "release",
            "rampBegin",
            "rampEnd",
            "rampDuration",
        ]) {
            const el = q<HTMLInputElement>(`#${id}`);
            el.addEventListener("input", () => {
                q<HTMLOutputElement>(`#${id}Out`).value = el.value;
                this.onMelodyParamChange();
            });
        }
        q<HTMLInputElement>("#oneShotCheck").addEventListener("change", () =>
            this.onMelodyParamChange(),
        );

        // Drum kit controls
        const busGainEl = q<HTMLInputElement>("#busGain");
        busGainEl.addEventListener("input", () => {
            q<HTMLOutputElement>("#busGainOut").value = busGainEl.value;
            this.drumDef.busGain = parseFloat(busGainEl.value);
            this.rebuildPatch();
            this.updateJson();
        });

        // Drum voice editor controls
        for (const id of [
            "voiceRampBegin",
            "voiceRampEnd",
            "voiceRampDuration",
            "voiceAttack",
            "voiceRelease",
        ]) {
            const el = q<HTMLInputElement>(`#${id}`);
            el.addEventListener("input", () => {
                q<HTMLOutputElement>(`#${id}Out`).value = el.value;
            });
        }
        q<HTMLSelectElement>("#voiceSourceKind").addEventListener("change", () =>
            this.onVoiceSourceKindChange(),
        );
        q<HTMLSelectElement>("#voicePitchSpec").addEventListener("change", () =>
            this.onVoicePitchSpecChange(),
        );
        q<HTMLSelectElement>("#voiceFilterFreqSpec").addEventListener("change", () =>
            this.onVoiceFilterFreqSpecChange(),
        );
        q<HTMLSelectElement>("#voiceEnvType").addEventListener("change", () =>
            this.onVoiceEnvTypeChange(),
        );
        q<HTMLButtonElement>("#applyVoiceBtn").addEventListener("click", () =>
            this.applyVoiceEdit(),
        );
        q<HTMLButtonElement>("#deleteVoiceBtn").addEventListener("click", () => this.deleteVoice());
        q<HTMLButtonElement>("#addVoiceBtn").addEventListener("click", () =>
            this.addVoiceAtSelectedKey(),
        );

        // Keyboard
        const canvas = q<HTMLCanvasElement>("#keyboardCanvas");
        this.keyboard = new PianoKeyboard(canvas.getContext("2d")!, canvas.width, canvas.height);
        this.keyboard.onNoteOn = (n) => this.noteOn(n);
        this.keyboard.onNoteOff = (n) => this.noteOff(n);

        // Web MIDI
        this.initWebMidi();

        // Velocity readout
        const velEl = q<HTMLInputElement>("#velocitySlider");
        velEl.addEventListener("input", () => {
            q<HTMLOutputElement>("#velocityReadout").value = velEl.value;
        });

        this.setMode(false);
        this.tick();
    }

    private setMode(drum: boolean) {
        this.isDrum = drum;
        q<HTMLButtonElement>("#melodyModeBtn").classList.toggle("active", !drum);
        q<HTMLButtonElement>("#drumModeBtn").classList.toggle("active", drum);
        (q("#melodyParamsPanel") as HTMLElement).style.display = drum ? "none" : "";
        (q("#drumParamsPanel") as HTMLElement).style.display = drum ? "" : "none";

        if (drum) {
            this.renderVoiceList();
        } else {
            this.populateMelodyControls(this.toneDef);
        }
        this.rebuildPatch();
        this.updateJson();
    }

    private get velocity(): number {
        return parseInt(q<HTMLInputElement>("#velocitySlider").value, 10);
    }

    private async ensureAudio() {
        if (this.audioContext == null) {
            const ctx = new AudioContext();
            this.audioContext = ctx;
            const masterGain = ctx.createGain();
            masterGain.gain.value = 0.5;
            masterGain.connect(ctx.destination);
            this.instrument = new Instrument<Monophony>(ctx, masterGain);
            this.instrument.onExpired((msg) => {
                msg.data.parentPatch.onExpired(msg.data, msg.time);
            });
            this.rebuildPatch();
        }
        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }
    }

    private rebuildPatch() {
        const inst = this.instrument;
        if (inst == null) return;
        try {
            if (this.isDrum) {
                inst.patch = compileDrumKit(inst, this.drumDef);
            } else {
                inst.patch = compileTone(inst, this.toneDef);
            }
        } catch (e) {
            console.warn("patch compile error:", e);
        }
    }

    private async noteOn(noteNumber: number) {
        await this.ensureAudio();
        const ctx = this.audioContext!;
        const inst = this.instrument!;
        const v = this.velocity;
        const bytes = new Uint8Array([noteNumber, v]);
        const dv = new DataView(bytes.buffer);
        const event = new midi.NoteOnEvent(dv, 0, 0x90);
        inst.receiveEvent(event, ctx.currentTime);
        this.activeKeys.add(noteNumber);
        this.keyboard.highlight(noteNumber, true);
    }

    private noteOff(noteNumber: number) {
        if (!this.audioContext || !this.instrument) return;
        const ctx = this.audioContext;
        const inst = this.instrument;
        const bytes = new Uint8Array([noteNumber, 0]);
        const dv = new DataView(bytes.buffer);
        const event = new midi.NoteOffEvent(dv, 0, 0x80);
        inst.receiveEvent(event, ctx.currentTime);
        this.activeKeys.delete(noteNumber);
        this.keyboard.highlight(noteNumber, false);
    }

    // --- Melody parameter controls ---

    private buildToneDefFromControls(): ToneDefinition {
        const kind = q<HTMLSelectElement>("#sourceKind").value as "oscillator" | "noise";
        let source: ToneSource;
        if (kind === "oscillator") {
            const oscType = q<HTMLSelectElement>("#oscType").value as OscillatorType;
            const pitchSpec = q<HTMLSelectElement>("#pitchSpec").value;
            let pitch: FrequencySpec | undefined;
            if (pitchSpec === "fixed") {
                pitch = { fixed: parseFloat(q<HTMLInputElement>("#pitchHz").value) };
            }
            source = { kind: "oscillator", oscillatorType: oscType, pitch };
        } else {
            const freqSpec = q<HTMLSelectElement>("#filterFreqSpec").value;
            let filterFrequency: FrequencySpec | undefined;
            if (freqSpec === "fixed") {
                filterFrequency = { fixed: parseFloat(q<HTMLInputElement>("#filterFreqHz").value) };
            }
            source = { kind: "noise", filterFrequency };
        }

        const envType = q<HTMLSelectElement>("#envType").value;
        let envelope: Envelope;
        if (envType === "adsr") {
            envelope = {
                type: "adsr",
                attack: parseFloat(q<HTMLInputElement>("#attack").value),
                hold: parseFloat(q<HTMLInputElement>("#hold").value) || undefined,
                decay: parseFloat(q<HTMLInputElement>("#decay").value) || undefined,
                sustain: parseFloat(q<HTMLInputElement>("#sustain").value),
                fade: parseFloat(q<HTMLInputElement>("#fade").value) || undefined,
                release: parseFloat(q<HTMLInputElement>("#release").value),
            };
        } else {
            envelope = {
                type: "ramp",
                begin: parseFloat(q<HTMLInputElement>("#rampBegin").value),
                end: parseFloat(q<HTMLInputElement>("#rampEnd").value),
                duration: parseFloat(q<HTMLInputElement>("#rampDuration").value),
            };
        }
        const oneShot = q<HTMLInputElement>("#oneShotCheck").checked || undefined;
        return { source, envelope, oneShot };
    }

    private populateMelodyControls(def: ToneDefinition) {
        const src = def.source;
        q<HTMLSelectElement>("#sourceKind").value = src.kind;
        if (src.kind === "oscillator") {
            q<HTMLSelectElement>("#oscType").value = src.oscillatorType;
            const pSpec =
                src.pitch && src.pitch !== "tracking" && typeof src.pitch === "object"
                    ? "fixed"
                    : "tracking";
            q<HTMLSelectElement>("#pitchSpec").value = pSpec;
            if (
                pSpec === "fixed" &&
                typeof src.pitch === "object" &&
                src.pitch !== null &&
                "fixed" in src.pitch
            ) {
                q<HTMLInputElement>("#pitchHz").value = String(
                    (src.pitch as { fixed: number }).fixed,
                );
            }
        } else {
            const fSpec =
                src.filterFrequency &&
                src.filterFrequency !== "tracking" &&
                typeof src.filterFrequency === "object"
                    ? "fixed"
                    : "tracking";
            q<HTMLSelectElement>("#filterFreqSpec").value = fSpec;
            if (
                fSpec === "fixed" &&
                typeof src.filterFrequency === "object" &&
                src.filterFrequency !== null &&
                "fixed" in src.filterFrequency
            ) {
                q<HTMLInputElement>("#filterFreqHz").value = String(
                    (src.filterFrequency as { fixed: number }).fixed,
                );
            }
        }
        this.onSourceKindChange();

        const env = def.envelope;
        q<HTMLSelectElement>("#envType").value = env.type;
        if (env.type === "adsr") {
            const setSlider = (id: string, val: number) => {
                q<HTMLInputElement>(`#${id}`).value = String(val);
                q<HTMLOutputElement>(`#${id}Out`).value = String(val);
            };
            setSlider("attack", env.attack ?? 0.005);
            setSlider("hold", env.hold ?? 0);
            setSlider("decay", env.decay ?? 0);
            setSlider("sustain", env.sustain ?? 1);
            setSlider("fade", env.fade ?? 0);
            setSlider("release", env.release ?? 0.05);
        } else {
            const setSlider = (id: string, val: number) => {
                q<HTMLInputElement>(`#${id}`).value = String(val);
                q<HTMLOutputElement>(`#${id}Out`).value = String(val);
            };
            setSlider("rampBegin", env.begin);
            setSlider("rampEnd", env.end);
            setSlider("rampDuration", env.duration);
        }
        this.onEnvTypeChange();
        q<HTMLInputElement>("#oneShotCheck").checked = !!def.oneShot;
    }

    private onSourceKindChange() {
        const kind = q<HTMLSelectElement>("#sourceKind").value;
        (q("#oscTypeField") as HTMLElement).style.display = kind === "oscillator" ? "" : "none";
        (q("#pitchField") as HTMLElement).style.display = kind === "oscillator" ? "" : "none";
        (q("#filterFreqField") as HTMLElement).style.display = kind === "noise" ? "" : "none";
        this.onPitchSpecChange();
        this.onFilterFreqSpecChange();
        this.onMelodyParamChange();
    }

    private onPitchSpecChange() {
        const spec = q<HTMLSelectElement>("#pitchSpec").value;
        (q("#pitchHzField") as HTMLElement).style.display = spec === "fixed" ? "" : "none";
        this.onMelodyParamChange();
    }

    private onFilterFreqSpecChange() {
        const spec = q<HTMLSelectElement>("#filterFreqSpec").value;
        (q("#filterFreqHzField") as HTMLElement).style.display = spec === "fixed" ? "" : "none";
        this.onMelodyParamChange();
    }

    private onEnvTypeChange() {
        const type = q<HTMLSelectElement>("#envType").value;
        (q("#adsrFields") as HTMLElement).style.display = type === "adsr" ? "" : "none";
        (q("#rampFields") as HTMLElement).style.display = type === "ramp" ? "" : "none";
        this.onMelodyParamChange();
    }

    private onMelodyParamChange() {
        this.toneDef = this.buildToneDefFromControls();
        this.rebuildPatch();
        this.updateJson();
    }

    // --- Drum voice list ---

    private renderVoiceList() {
        const list = q<HTMLElement>("#voiceList");
        list.innerHTML = "";
        const notes = Object.keys(this.drumDef.voices)
            .map(Number)
            .toSorted((a, b) => a - b);
        for (const note of notes) {
            const voice = this.drumDef.voices[note];
            if (!voice) continue;
            const row = document.createElement("div");
            row.className = "voice-row" + (note === this.selectedDrumNote ? " selected" : "");
            row.dataset.note = String(note);

            const noteEl = document.createElement("span");
            noteEl.className = "voice-row-note";
            noteEl.textContent = String(note);

            const nameEl = document.createElement("span");
            nameEl.className = "voice-row-name";
            nameEl.textContent = voice.name ?? DRUM_NAMES[note] ?? `Note ${note}`;

            const badge = document.createElement("span");
            badge.className = "voice-row-badge";
            badge.textContent = voice.source.kind === "oscillator" ? "osc" : "noise";

            row.append(noteEl, nameEl, badge);
            row.addEventListener("click", () => this.selectDrumVoice(note));
            list.append(row);
        }
    }

    private selectDrumVoice(note: number) {
        this.selectedDrumNote = note;
        this.renderVoiceList();
        const voice = this.drumDef.voices[note];
        if (!voice) return;
        (q("#voiceEditorPanel") as HTMLElement).style.display = "";
        q<HTMLElement>("#voiceEditorNote").textContent =
            `${note} — ${voice.name ?? DRUM_NAMES[note] ?? ""}`;
        this.populateVoiceControls(voice);
    }

    private populateVoiceControls(voice: DrumVoiceDefinition) {
        q<HTMLSelectElement>("#voiceRouting").value = voice.routing ?? "center";
        q<HTMLInputElement>("#voiceExcludeGroup").value = String(voice.excludeGroup ?? 0);
        const src = voice.source;
        q<HTMLSelectElement>("#voiceSourceKind").value = src.kind;
        if (src.kind === "oscillator") {
            q<HTMLSelectElement>("#voiceOscType").value = src.oscillatorType;
            const pSpec = src.pitch && typeof src.pitch === "object" ? "fixed" : "tracking";
            q<HTMLSelectElement>("#voicePitchSpec").value = pSpec;
            if (pSpec === "fixed" && typeof src.pitch === "object" && "fixed" in src.pitch) {
                q<HTMLInputElement>("#voicePitchHz").value = String(
                    (src.pitch as { fixed: number }).fixed,
                );
            }
        } else {
            const fSpec =
                src.filterFrequency && typeof src.filterFrequency === "object"
                    ? "fixed"
                    : "tracking";
            q<HTMLSelectElement>("#voiceFilterFreqSpec").value = fSpec;
            if (
                fSpec === "fixed" &&
                typeof src.filterFrequency === "object" &&
                "fixed" in src.filterFrequency
            ) {
                q<HTMLInputElement>("#voiceFilterFreqHz").value = String(
                    (src.filterFrequency as { fixed: number }).fixed,
                );
            }
        }
        this.onVoiceSourceKindChange();

        const env = voice.envelope;
        q<HTMLSelectElement>("#voiceEnvType").value = env.type;
        if (env.type === "ramp") {
            const set = (id: string, v: number) => {
                q<HTMLInputElement>(`#${id}`).value = String(v);
                q<HTMLOutputElement>(`#${id}Out`).value = String(v);
            };
            set("voiceRampBegin", env.begin);
            set("voiceRampEnd", env.end);
            set("voiceRampDuration", env.duration);
        } else {
            const set = (id: string, v: number) => {
                q<HTMLInputElement>(`#${id}`).value = String(v);
                q<HTMLOutputElement>(`#${id}Out`).value = String(v);
            };
            set("voiceAttack", env.attack);
            set("voiceRelease", env.release);
        }
        this.onVoiceEnvTypeChange();
        q<HTMLInputElement>("#voiceOneShot").checked = !!voice.oneShot;
    }

    private onVoiceSourceKindChange() {
        const kind = q<HTMLSelectElement>("#voiceSourceKind").value;
        (q("#voiceOscTypeField") as HTMLElement).style.display =
            kind === "oscillator" ? "" : "none";
        (q("#voicePitchField") as HTMLElement).style.display = kind === "oscillator" ? "" : "none";
        (q("#voiceFilterFreqField") as HTMLElement).style.display = kind === "noise" ? "" : "none";
        this.onVoicePitchSpecChange();
        this.onVoiceFilterFreqSpecChange();
    }

    private onVoicePitchSpecChange() {
        const spec = q<HTMLSelectElement>("#voicePitchSpec").value;
        (q("#voicePitchHzField") as HTMLElement).style.display = spec === "fixed" ? "" : "none";
    }

    private onVoiceFilterFreqSpecChange() {
        const spec = q<HTMLSelectElement>("#voiceFilterFreqSpec").value;
        (q("#voiceFilterFreqHzField") as HTMLElement).style.display =
            spec === "fixed" ? "" : "none";
    }

    private onVoiceEnvTypeChange() {
        const type = q<HTMLSelectElement>("#voiceEnvType").value;
        (q("#voiceRampFields") as HTMLElement).style.display = type === "ramp" ? "" : "none";
        (q("#voiceAdsrFields") as HTMLElement).style.display = type === "adsr" ? "" : "none";
    }

    private buildVoiceFromControls(): DrumVoiceDefinition {
        const kind = q<HTMLSelectElement>("#voiceSourceKind").value as "oscillator" | "noise";
        let source: ToneSource;
        if (kind === "oscillator") {
            const oscType = q<HTMLSelectElement>("#voiceOscType").value as OscillatorType;
            const pSpec = q<HTMLSelectElement>("#voicePitchSpec").value;
            const pitch: FrequencySpec | undefined =
                pSpec === "fixed"
                    ? { fixed: parseFloat(q<HTMLInputElement>("#voicePitchHz").value) }
                    : undefined;
            source = { kind: "oscillator", oscillatorType: oscType, pitch };
        } else {
            const fSpec = q<HTMLSelectElement>("#voiceFilterFreqSpec").value;
            const filterFrequency: FrequencySpec | undefined =
                fSpec === "fixed"
                    ? { fixed: parseFloat(q<HTMLInputElement>("#voiceFilterFreqHz").value) }
                    : undefined;
            source = { kind: "noise", filterFrequency };
        }
        const envType = q<HTMLSelectElement>("#voiceEnvType").value;
        let envelope: Envelope;
        if (envType === "ramp") {
            envelope = {
                type: "ramp",
                begin: parseFloat(q<HTMLInputElement>("#voiceRampBegin").value),
                end: parseFloat(q<HTMLInputElement>("#voiceRampEnd").value),
                duration: parseFloat(q<HTMLInputElement>("#voiceRampDuration").value),
            };
        } else {
            envelope = {
                type: "adsr",
                attack: parseFloat(q<HTMLInputElement>("#voiceAttack").value),
                release: parseFloat(q<HTMLInputElement>("#voiceRelease").value),
            };
        }
        const routing = q<HTMLSelectElement>("#voiceRouting").value as "center" | "left" | "right";
        const excludeGroup =
            parseInt(q<HTMLInputElement>("#voiceExcludeGroup").value, 10) || undefined;
        const oneShot = q<HTMLInputElement>("#voiceOneShot").checked || undefined;
        const note = this.selectedDrumNote!;
        return {
            name: DRUM_NAMES[note] ?? `Note ${note}`,
            source,
            envelope,
            routing,
            excludeGroup,
            oneShot,
        };
    }

    private applyVoiceEdit() {
        if (this.selectedDrumNote == null) return;
        this.drumDef.voices[this.selectedDrumNote] = this.buildVoiceFromControls();
        this.renderVoiceList();
        this.rebuildPatch();
        this.updateJson();
    }

    private deleteVoice() {
        if (this.selectedDrumNote == null) return;
        delete this.drumDef.voices[this.selectedDrumNote];
        this.selectedDrumNote = null;
        (q("#voiceEditorPanel") as HTMLElement).style.display = "none";
        this.renderVoiceList();
        this.rebuildPatch();
        this.updateJson();
    }

    private addVoiceAtSelectedKey() {
        // Find the lowest unmapped note from 35 onwards, or use selected drum note.
        let note = this.selectedDrumNote ?? 36;
        if (this.drumDef.voices[note] != null) {
            // Find next free
            for (let n = 35; n <= 81; n++) {
                if (this.drumDef.voices[n] == null) {
                    note = n;
                    break;
                }
            }
        }
        const def: DrumVoiceDefinition = {
            name: DRUM_NAMES[note] ?? `Note ${note}`,
            source: { kind: "noise", filterFrequency: { fixed: 3000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
            oneShot: true,
        };
        this.drumDef.voices[note] = def;
        this.selectedDrumNote = note;
        this.renderVoiceList();
        this.selectDrumVoice(note);
        this.rebuildPatch();
        this.updateJson();
    }

    // --- JSON import/export ---

    private updateJson() {
        const def: PatchDefinition = this.isDrum ? this.drumDef : this.toneDef;
        q<HTMLTextAreaElement>("#jsonEditor").value = JSON.stringify(def, null, 2);
        q<HTMLElement>("#jsonStatus").textContent = "";
        q<HTMLElement>("#jsonStatus").className = "json-status";
    }

    private applyJson() {
        const text = q<HTMLTextAreaElement>("#jsonEditor").value;
        const status = q<HTMLElement>("#jsonStatus");
        try {
            const parsed = JSON.parse(text) as PatchDefinition;
            if ("kind" in parsed && parsed.kind === "drumKit") {
                this.drumDef = parsed;
                this.isDrum = true;
                q<HTMLButtonElement>("#melodyModeBtn").classList.remove("active");
                q<HTMLButtonElement>("#drumModeBtn").classList.add("active");
                (q("#melodyParamsPanel") as HTMLElement).style.display = "none";
                (q("#drumParamsPanel") as HTMLElement).style.display = "";
                this.selectedDrumNote = null;
                (q("#voiceEditorPanel") as HTMLElement).style.display = "none";
                this.renderVoiceList();
            } else {
                this.toneDef = parsed as ToneDefinition;
                this.isDrum = false;
                q<HTMLButtonElement>("#melodyModeBtn").classList.add("active");
                q<HTMLButtonElement>("#drumModeBtn").classList.remove("active");
                (q("#melodyParamsPanel") as HTMLElement).style.display = "";
                (q("#drumParamsPanel") as HTMLElement).style.display = "none";
                this.populateMelodyControls(this.toneDef);
            }
            this.rebuildPatch();
            status.textContent = "Applied";
            status.className = "json-status";
        } catch (e) {
            status.textContent = String(e);
            status.className = "json-status error";
        }
    }

    private async copyJson() {
        const text = q<HTMLTextAreaElement>("#jsonEditor").value;
        await navigator.clipboard.writeText(text);
        const status = q<HTMLElement>("#jsonStatus");
        status.textContent = "Copied!";
        status.className = "json-status";
        setTimeout(() => {
            status.textContent = "";
        }, 1500);
    }

    // --- Web MIDI ---

    private initWebMidi() {
        const select = q<HTMLSelectElement>("#midiInputSelect");
        if (typeof navigator.requestMIDIAccess !== "function") return;
        navigator.requestMIDIAccess().then(
            (access) => {
                const inputs = [...access.inputs.values()];
                for (const input of inputs) {
                    const opt = document.createElement("option");
                    opt.value = input.id;
                    opt.textContent = input.name ?? input.id;
                    select.append(opt);
                }
                let currentInput: MIDIInput | null = null;
                const activate = (id: string) => {
                    if (currentInput) currentInput.onmidimessage = null;
                    currentInput = null;
                    if (!id) return;
                    const inp = access.inputs.get(id);
                    if (!inp) return;
                    currentInput = inp;
                    inp.onmidimessage = (e) => {
                        if (!e.data) return;
                        const dv = new DataView(e.data.buffer);
                        const status = dv.getUint8(0);
                        const sub = new DataView(e.data.buffer, 1);
                        const ev = midi.Event.create(sub, 0, status);
                        this.handleMidiEvent(ev);
                    };
                };
                select.addEventListener("change", () => activate(select.value));
                if (inputs.length > 0) {
                    select.value = inputs[0].id;
                    activate(inputs[0].id);
                }
            },
            () => {},
        );
    }

    private handleMidiEvent(event: midi.Event) {
        if (event instanceof midi.NoteOnEvent) {
            this.noteOn(event.noteNumber).catch(() => {});
            this.keyboard.highlight(event.noteNumber, true);
        } else if (event instanceof midi.NoteOffEvent) {
            this.noteOff(event.noteNumber);
            this.keyboard.highlight(event.noteNumber, false);
        }
    }

    // --- Animation loop ---

    private tick() {
        const drumNote = this.isDrum ? (this.selectedDrumNote ?? undefined) : undefined;
        this.keyboard.draw(drumNote);
        requestAnimationFrame(() => this.tick());
    }
}

const app = new PatchEditorApp();
document.addEventListener("DOMContentLoaded", () => app.start());
