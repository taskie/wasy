import type { SynthEngine } from "wasy";
import { channelColor } from "./palette.js";

interface ChannelState {
    mute: boolean;
    solo: boolean;
    // Fader position as a 0..1 fraction of the slider; the audible gain
    // applies the quadratic taper (see `effectiveGain`).
    volume: number;
}

interface ChannelStrip {
    soloButton: HTMLButtonElement;
    muteButton: HTMLButtonElement;
    volumeSlider: HTMLInputElement;
    volumeReadout: HTMLOutputElement;
}

// Master fader reference: the engine's design level for `synth.gain.gain`
// (0.1 leaves headroom for 16 summing channels before the compressor).
const MASTER_REFERENCE_GAIN = 0.1;
// Slider position that reproduces the reference gain. Positions above it
// (up to 100) give ~+3.9 dB of boost; 0 is silence.
const MASTER_DEFAULT_VALUE = 80;
// Quadratic fader taper — the same curve family the synth uses for GM2
// CC 7 / CC 11 — so equal slider steps feel like equal loudness steps,
// instead of the top half of a linear fader doing almost nothing.
const masterValueToGain = (value: number) =>
    MASTER_REFERENCE_GAIN * (value / MASTER_DEFAULT_VALUE) ** 2;

const MASTER_STORAGE_KEY = "wasy-master-volume";

const loadStoredMasterValue = (): number => {
    try {
        const raw = localStorage.getItem(MASTER_STORAGE_KEY);
        if (raw == null) return MASTER_DEFAULT_VALUE;
        const value = Number(raw);
        if (!Number.isFinite(value)) return MASTER_DEFAULT_VALUE;
        return Math.min(100, Math.max(0, Math.round(value)));
    } catch {
        return MASTER_DEFAULT_VALUE;
    }
};

// 16-channel mixer + master fader. Writes to `synth.channelGains[ch].gain`
// and `synth.gain.gain` so SMF-driven CC 7 / CC 11 stay independent.
// Solo / mute / volume state lives here; the synth itself has no concept
// of either — effective gain = mute || (anySolo && !solo) ? 0 : taper(volume).
export class MixerView {
    private synth: SynthEngine | null = null;
    private channels: ChannelState[] = [];
    private strips: ChannelStrip[] = [];
    private masterValue = loadStoredMasterValue();
    private masterSlider!: HTMLInputElement;
    private masterReadout!: HTMLOutputElement;

    constructor(private root: HTMLElement) {
        for (let i = 0; i < 16; ++i) {
            this.channels.push({ mute: false, solo: false, volume: 1 });
        }
        this.render();
    }

    setSynth(synth: SynthEngine) {
        this.synth = synth;
        this.applyMaster();
        for (let i = 0; i < 16; ++i) this.applyChannel(i);
    }

    private get anySolo(): boolean {
        return this.channels.some((c) => c.solo);
    }

    private effectiveGain(ch: number): number {
        const c = this.channels[ch];
        if (c.mute) return 0;
        if (this.anySolo && !c.solo) return 0;
        // Quadratic taper, unity at the default fader top (100).
        return c.volume * c.volume;
    }

    private applyChannel(ch: number) {
        if (this.synth == null) return;
        this.synth.channelGains[ch].gain.value = this.effectiveGain(ch);
    }

    private applyAllChannels() {
        for (let i = 0; i < 16; ++i) this.applyChannel(i);
    }

    private applyMaster() {
        if (this.synth == null) return;
        this.synth.gain.gain.value = masterValueToGain(this.masterValue);
    }

    private render() {
        this.root.classList.add("mixer");

        const masterRow = document.createElement("div");
        masterRow.className = "mixer-row mixer-row-master";
        const masterLabel = document.createElement("span");
        masterLabel.className = "mixer-label";
        masterLabel.textContent = "Master";
        masterRow.appendChild(masterLabel);
        // S/M placeholders to align with channel rows below.
        const masterSpacer = document.createElement("span");
        masterSpacer.className = "mixer-button-spacer";
        masterRow.appendChild(masterSpacer);
        this.masterSlider = document.createElement("input");
        this.masterSlider.type = "range";
        this.masterSlider.min = "0";
        this.masterSlider.max = "100";
        this.masterSlider.step = "1";
        this.masterSlider.value = String(this.masterValue);
        this.masterSlider.className = "mixer-slider";
        this.masterSlider.addEventListener("input", () => {
            this.masterValue = Number(this.masterSlider.value);
            this.masterReadout.value = `${this.masterSlider.value}%`;
            this.applyMaster();
            try {
                localStorage.setItem(MASTER_STORAGE_KEY, String(this.masterValue));
            } catch {
                // localStorage unavailable (private mode etc.) — non-fatal.
            }
        });
        masterRow.appendChild(this.masterSlider);
        this.masterReadout = document.createElement("output");
        this.masterReadout.className = "mixer-readout";
        this.masterReadout.value = `${this.masterSlider.value}%`;
        masterRow.appendChild(this.masterReadout);
        this.root.appendChild(masterRow);

        const details = document.createElement("details");
        details.className = "mixer-channels";
        const summary = document.createElement("summary");
        summary.className = "mixer-channels-summary";
        summary.textContent = "Channels";
        details.appendChild(summary);
        const channelRows = document.createElement("div");
        channelRows.className = "mixer-channel-rows";
        for (let ch = 0; ch < 16; ++ch) {
            channelRows.appendChild(this.renderChannelRow(ch));
        }
        details.appendChild(channelRows);
        const hint = document.createElement("p");
        hint.className = "hint";
        hint.textContent =
            "S = solo (any active solo silences others), M = mute. Faders are independent of MIDI volume (CC 7 / 11).";
        details.appendChild(hint);
        this.root.appendChild(details);
    }

    private renderChannelRow(ch: number): HTMLElement {
        const row = document.createElement("div");
        row.className = "mixer-row";

        const label = document.createElement("span");
        label.className = "mixer-label";
        label.textContent = `ch ${ch + 1}`;
        label.style.color = channelColor(ch, true);
        row.appendChild(label);

        const buttons = document.createElement("span");
        buttons.className = "mixer-buttons";
        const soloButton = document.createElement("button");
        soloButton.type = "button";
        soloButton.textContent = "S";
        soloButton.title = `solo ch ${ch + 1}`;
        soloButton.addEventListener("click", () => {
            this.channels[ch].solo = !this.channels[ch].solo;
            soloButton.classList.toggle("active", this.channels[ch].solo);
            // Solo affects every other channel's effective gain.
            this.applyAllChannels();
        });
        const muteButton = document.createElement("button");
        muteButton.type = "button";
        muteButton.textContent = "M";
        muteButton.title = `mute ch ${ch + 1}`;
        muteButton.addEventListener("click", () => {
            this.channels[ch].mute = !this.channels[ch].mute;
            muteButton.classList.toggle("active", this.channels[ch].mute);
            this.applyChannel(ch);
        });
        buttons.appendChild(soloButton);
        buttons.appendChild(muteButton);
        row.appendChild(buttons);

        const volumeSlider = document.createElement("input");
        volumeSlider.type = "range";
        volumeSlider.min = "0";
        volumeSlider.max = "100";
        volumeSlider.step = "1";
        volumeSlider.value = String(Math.round(this.channels[ch].volume * 100));
        volumeSlider.className = "mixer-slider";
        volumeSlider.addEventListener("input", () => {
            this.channels[ch].volume = Number(volumeSlider.value) / 100;
            volumeReadout.value = `${volumeSlider.value}%`;
            this.applyChannel(ch);
        });
        row.appendChild(volumeSlider);

        const volumeReadout = document.createElement("output");
        volumeReadout.className = "mixer-readout";
        volumeReadout.value = `${volumeSlider.value}%`;
        row.appendChild(volumeReadout);

        this.strips[ch] = { soloButton, muteButton, volumeSlider, volumeReadout };
        return row;
    }
}
