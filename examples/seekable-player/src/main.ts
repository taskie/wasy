import { SmfPlayer, SynthEngine, smfAnalyze, type SongInfo, type TimedEvent } from "wasy";
import "./style.css";
import { PianoRollView } from "./piano-roll-view.js";
import { KeyboardView } from "./keyboard-view.js";
import { AnalyserView } from "./analyser-view.js";
import { MixerView } from "./mixer-view.js";
import { EventLogView } from "./event-log-view.js";
import { initPanels } from "./panels.js";

const q = <T extends Element>(selector: string): T => {
    const el = document.querySelector<T>(selector);
    if (el == null) throw new Error(`element not found: ${selector}`);
    return el;
};

class Application {
    // AudioContext / synth / player are constructed lazily on the first user
    // gesture (file load). Constructing them at DOMContentLoaded makes the
    // browser keep the context suspended for an unbounded time, and the first
    // resume() afterwards has measurably higher latency than constructing
    // and using the context together.
    private audioContext: AudioContext | null = null;
    private synth: SynthEngine | null = null;
    // One SmfPlayer reused across file loads via `load()`. The TimedEvent
    // listener is wired once at audio init and survives every load.
    private player: SmfPlayer | null = null;
    private analyser: AnalyserNode | null = null;

    private songInfo: SongInfo | null = null;

    private seekBar!: HTMLInputElement;
    private seekReadout!: HTMLOutputElement;
    private seekTimeReadout!: HTMLOutputElement;
    private seekBarBeatReadout!: HTMLOutputElement;
    private playButton!: HTMLButtonElement;
    private pauseButton!: HTMLButtonElement;
    private stopButton!: HTMLButtonElement;
    private fileButton!: HTMLInputElement;
    private metaFormat!: HTMLElement;
    private metaTracks!: HTMLElement;
    private metaResolution!: HTMLElement;
    private metaDuration!: HTMLElement;
    private metaTitle!: HTMLElement;
    private metaCopyright!: HTMLElement;
    private metaTrackNames!: HTMLElement;
    private metaInstrumentNames!: HTMLElement;
    private metaMarkers!: HTMLElement;
    private metaText!: HTMLElement;
    private metaExtraDetails!: HTMLDetailsElement;

    private pianoRollView!: PianoRollView;
    private keyboardView!: KeyboardView;
    private analyserView!: AnalyserView;
    private mixerView!: MixerView;
    private eventLogView!: EventLogView;
    private isUserSeeking = false;
    private hasBuffer = false;

    start() {
        // Audio is deferred — see ensureAudio(). Only DOM/views are wired here.
        this.seekBar = q<HTMLInputElement>("#seekBar");
        this.seekReadout = q<HTMLOutputElement>("#seekReadout");
        this.seekTimeReadout = q<HTMLOutputElement>("#seekTimeReadout");
        this.seekBarBeatReadout = q<HTMLOutputElement>("#seekBarBeatReadout");
        this.playButton = q<HTMLButtonElement>("#playButton");
        this.pauseButton = q<HTMLButtonElement>("#pauseButton");
        this.stopButton = q<HTMLButtonElement>("#stopButton");
        this.fileButton = q<HTMLInputElement>("#fileButton");
        this.metaFormat = q<HTMLElement>("#metaFormat");
        this.metaTracks = q<HTMLElement>("#metaTracks");
        this.metaResolution = q<HTMLElement>("#metaResolution");
        this.metaDuration = q<HTMLElement>("#metaDuration");
        this.metaTitle = q<HTMLElement>("#metaTitle");
        this.metaCopyright = q<HTMLElement>("#metaCopyright");
        this.metaTrackNames = q<HTMLElement>("#metaTrackNames");
        this.metaInstrumentNames = q<HTMLElement>("#metaInstrumentNames");
        this.metaMarkers = q<HTMLElement>("#metaMarkers");
        this.metaText = q<HTMLElement>("#metaText");
        this.metaExtraDetails = q<HTMLDetailsElement>("#metaExtraDetails");

        const pianoRollCanvas = q<HTMLCanvasElement>("#pianoRollCanvas");
        this.pianoRollView = new PianoRollView(
            pianoRollCanvas.getContext("2d")!,
            pianoRollCanvas.width,
            pianoRollCanvas.height,
        );
        pianoRollCanvas.ondragover = (e) => e.preventDefault();
        pianoRollCanvas.addEventListener("drop", (e) => this.onDrop(e));

        const keyboardCanvas = q<HTMLCanvasElement>("#keyboardCanvas");
        this.keyboardView = new KeyboardView(
            keyboardCanvas.getContext("2d")!,
            keyboardCanvas.width,
            keyboardCanvas.height,
        );

        const analyserCanvas = q<HTMLCanvasElement>("#analyserCanvas");
        this.analyserView = new AnalyserView(
            analyserCanvas.getContext("2d")!,
            analyserCanvas.width,
            analyserCanvas.height,
        );

        this.mixerView = new MixerView(q<HTMLElement>("#mixer"));
        this.eventLogView = new EventLogView(q<HTMLElement>("#eventLog"));

        // Construct / resume AudioContext on the click that opens the file
        // picker — that click is a guaranteed user gesture. The later `change`
        // event isn't treated as transient activation in Firefox (the gesture
        // was consumed by the modal picker), so creating the context inside
        // `onFileChange` triggers Firefox's autoplay-policy warning. By the
        // time `change` fires, the context is already running.
        this.fileButton.addEventListener("click", () => {
            void this.ensureAudio();
        });
        this.fileButton.addEventListener("change", (e) => this.onFileChange(e));
        this.playButton.addEventListener("click", () => this.onPlay());
        this.pauseButton.addEventListener("click", () => this.onPause());
        this.stopButton.addEventListener("click", () => this.onStop());
        this.seekBar.addEventListener("input", () => this.onSeekInput());
        this.seekBar.addEventListener("change", () => this.onSeekCommit());

        this.refreshButtons();
        this.tick();
    }

    // Lazily create the audio graph. Always awaits resume() on return so the
    // caller can schedule against a guaranteed-running clock. Safe to call
    // repeatedly; only the first call constructs.
    private async ensureAudio(): Promise<{
        audioContext: AudioContext;
        synth: SynthEngine;
        player: SmfPlayer;
    }> {
        if (this.audioContext == null) {
            const ctx = new AudioContext();
            this.audioContext = ctx;

            // Analyser tap: SynthEngine → AnalyserNode → destination. AnalyserNode
            // is a passthrough, so audio is unaffected; we just get FFT/wave data
            // for the visualizer.
            const analyser = ctx.createAnalyser();
            analyser.smoothingTimeConstant = 0;
            analyser.connect(ctx.destination);
            this.analyser = analyser;
            this.analyserView.analyser = analyser;

            // The split: SynthEngine handles audio synthesis, SmfPlayer handles
            // SMF parsing + scheduling. The bridge below is the only coupling
            // between them — everything else is independent.
            this.synth = new SynthEngine(ctx, analyser);
            this.player = new SmfPlayer(ctx);
            this.player.onTimedEvent((e) => this.onTimedEvent(e));
            this.mixerView.setSynth(this.synth);
            // Pay Web Audio graph cold-start now (silently, velocity 1) so the
            // first real attack at song start doesn't allocate nodes inside
            // the audio thread — that hitch was previously most audible on
            // tick-0 drum hits at the top of playback.
            this.synth.prewarm();
        }
        if (this.audioContext.state === "suspended") {
            // Awaited so that audioContext.currentTime is actually advancing
            // before any caller schedules an event. Not awaiting this is the
            // single biggest source of perceived lag.
            await this.audioContext.resume();
        }
        return {
            audioContext: this.audioContext,
            synth: this.synth!,
            player: this.player!,
        };
    }

    private onTimedEvent(e: TimedEvent) {
        // The crucial line: SmfPlayer hands us a TimedEvent, we hand the
        // MIDI event to the synth at the audio time the player computed.
        // wasy.Wasy contains exactly this same line internally.
        // SmfPlayer only emits after load(), which is only reachable after
        // ensureAudio() — so synth is non-null here.
        const time = e.timeStamp.accurateTime(e.midiEvent.tick);
        // Diagnostic: warn when the scheduled audio time has slipped to
        // the present or past. Web Audio treats start(timeInPast) as
        // "start now", which is the prime suspect for "drums fire early"
        // (ワンショットの鋭いアタックほど即発火が知覚されやすい).
        const slack = time - this.audioContext!.currentTime;
        if (slack <= 0) {
            console.warn(
                `[wasy] late schedule: slack=${(slack * 1000).toFixed(1)}ms tick=${e.midiEvent.tick} ${e.midiEvent.constructor.name}`,
            );
        }
        this.synth!.receiveEvent(e.midiEvent, time);
        this.keyboardView.onTimedEvent(e);
        this.eventLogView.onTimedEvent(e);
    }

    private async onFileChange(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (files == null || files.length === 0) return;
        await this.loadFile(files[0]);
    }

    private async onDrop(e: DragEvent) {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (files == null || files.length === 0) return;
        await this.loadFile(files[0]);
    }

    private async loadFile(file: File) {
        // Construct (and resume) the audio graph synchronously with the user
        // gesture. Awaiting before play() means the timer always anchors to a
        // running audio clock.
        const { synth, player } = await this.ensureAudio();

        const buffer = await file.arrayBuffer();
        synth.pause();
        // Await the worker: parse + analyze runs on the worker thread, then
        // the worker posts SongInfo back. Once load() resolves, both
        // `player.songInfo` (UI: piano-roll, metadata, duration) and the
        // playback state (timer.resolution) are populated. Single parse —
        // no main-thread `smf.parseSong(buffer)` needed.
        await player.load(buffer);
        const songInfo = player.songInfo!;
        this.songInfo = songInfo;
        this.refreshMeta();
        this.pianoRollView.setNotes(songInfo.notes, songInfo.resolution);
        this.pianoRollView.setTimeSignatureMap(songInfo.timeSignatureMap);
        this.keyboardView.clear();
        this.eventLogView.clear();

        this.hasBuffer = true;
        player.play();
        this.refreshButtons();
    }

    private refreshMeta() {
        if (this.songInfo == null) return;
        this.metaFormat.textContent = String(this.songInfo.format);
        this.metaTracks.textContent = String(this.songInfo.numberOfTracks);
        this.metaResolution.textContent = String(this.songInfo.resolution);
        const totalSeconds = smfAnalyze.tickToSeconds(
            this.songInfo.durationTicks,
            this.songInfo.tempoMap,
            this.songInfo.resolution,
        );
        this.metaDuration.textContent = `${smfAnalyze.formatTime(totalSeconds)} (${this.songInfo.durationTicks} tick)`;
        this.seekBar.max = String(this.songInfo.durationTicks);
        this.seekBar.value = "0";
        this.seekBar.disabled = false;

        const t = this.songInfo.metadata;
        this.metaTitle.textContent = t.title ?? "-";
        this.metaCopyright.textContent = t.copyright.length > 0 ? t.copyright.join(" / ") : "-";
        this.metaTrackNames.textContent =
            t.trackNames.length > 0
                ? t.trackNames.map((x) => `#${x.trackIndex} ${x.name}`).join(", ")
                : "-";
        this.metaInstrumentNames.textContent =
            t.instrumentNames.length > 0
                ? t.instrumentNames.map((x) => `#${x.trackIndex} ${x.name}`).join(", ")
                : "-";
        this.metaMarkers.textContent =
            t.markers.length > 0 ? t.markers.map((x) => `${x.tick}: ${x.text}`).join(", ") : "-";
        this.metaText.textContent = t.text.length > 0 ? t.text.join(" / ") : "-";
        const hasExtra =
            t.trackNames.length > 0 ||
            t.instrumentNames.length > 0 ||
            t.markers.length > 0 ||
            t.text.length > 0;
        this.metaExtraDetails.hidden = !hasExtra;
    }

    private async onPlay() {
        if (!this.hasBuffer) return;
        // The play button is a user gesture too; resume the context if the
        // browser auto-suspended (e.g. tab backgrounded).
        const { player } = await this.ensureAudio();
        if (player.paused) {
            player.resume();
        } else {
            player.play();
        }
        this.refreshButtons();
    }

    private onPause() {
        if (!this.hasBuffer) return;
        this.player!.pause();
        this.synth!.pause();
        this.keyboardView.clear();
        this.refreshButtons();
    }

    private onStop() {
        if (!this.hasBuffer) return;
        const player = this.player!;
        const synth = this.synth!;
        player.pause();
        synth.pause();
        // SmfPlayer.seek auto-resumes if not paused; pause again to leave it stopped.
        player.seek(0);
        player.pause();
        synth.pause();
        this.keyboardView.clear();
        this.seekBar.value = "0";
        this.refreshButtons();
    }

    private onSeekInput() {
        this.isUserSeeking = true;
        this.updateReadout(Number(this.seekBar.value));
    }

    private onSeekCommit() {
        if (!this.hasBuffer) {
            this.isUserSeeking = false;
            return;
        }
        const tick = Number(this.seekBar.value);
        // Mirror wasy.Wasy.seek: kill in-flight notes on the synth before
        // jumping. SmfPlayer.seek replays state events (ProgramChange /
        // ControlChange / Tempo / SysEx) up to the target tick so the
        // synth state matches what it would have been at `tick`.
        this.synth!.pause();
        this.player!.seek(tick);
        this.keyboardView.clear();
        this.isUserSeeking = false;
        this.refreshButtons();
    }

    private updateReadout(tick: number) {
        const info = this.songInfo;
        const total = info?.durationTicks ?? 0;
        this.seekReadout.value = `${tick} / ${total} tick`;
        if (info != null) {
            const seconds = smfAnalyze.tickToSeconds(tick, info.tempoMap, info.resolution);
            const totalSeconds = smfAnalyze.tickToSeconds(total, info.tempoMap, info.resolution);
            this.seekTimeReadout.value = `${smfAnalyze.formatTime(seconds)} / ${smfAnalyze.formatTime(totalSeconds)}`;
            const { bar, beat } = smfAnalyze.tickToBarBeat(
                tick,
                info.timeSignatureMap,
                info.resolution,
            );
            this.seekBarBeatReadout.value = `${bar}:${beat}`;
        } else {
            this.seekTimeReadout.value = "00:00 / 00:00";
            this.seekBarBeatReadout.value = "1:1";
        }
    }

    private refreshButtons() {
        const hasBuffer = this.hasBuffer;
        // Before audio init, treat as paused so the play button is enabled.
        const paused = this.player?.paused ?? true;
        this.playButton.disabled = !hasBuffer || !paused;
        this.pauseButton.disabled = !hasBuffer || paused;
        this.stopButton.disabled = !hasBuffer;
    }

    private tick() {
        const currentTick = this.hasBuffer
            ? Math.min(Math.max(0, this.player!.timer.tick), this.songInfo?.durationTicks ?? 0)
            : 0;
        if (this.hasBuffer && !this.isUserSeeking) {
            const t = Math.round(currentTick);
            this.seekBar.value = String(t);
            this.updateReadout(t);
        }
        // While the user drags the seek bar, render the slider's tick instead
        // of timer.tick so the roll previews the seek target.
        const previewTick = this.isUserSeeking ? Number(this.seekBar.value) : currentTick;
        this.pianoRollView.setCurrentTick(previewTick);
        this.pianoRollView.draw();
        this.keyboardView.draw();
        this.analyserView.draw();
        this.eventLogView.draw();
        requestAnimationFrame(() => this.tick());
    }
}

const app = new Application();
document.addEventListener("DOMContentLoaded", () => {
    initPanels();
    app.start();
});
