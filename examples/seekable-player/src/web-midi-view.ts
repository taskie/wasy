import { midi, instrumentPatchs } from "wasy";

type Listener = (e: midi.Event) => void;

export class WebMidiView {
    private statusEl: HTMLElement;
    private deviceListEl: HTMLElement;
    private requestBtn: HTMLButtonElement;
    private forceChk: HTMLInputElement;
    private chSel: HTMLSelectElement;
    private progSel: HTMLSelectElement;
    private midiAccess: MIDIAccess | null = null;
    private listeners: Listener[] = [];

    constructor(
        container: HTMLElement,
        private options: { onRequest?: () => void } = {},
    ) {
        const q = <T extends Element>(sel: string): T => {
            const el = container.querySelector<T>(sel);
            if (el == null) throw new Error(`WebMidiView: element not found: ${sel}`);
            return el;
        };

        this.statusEl = q<HTMLElement>(".webmidi-status");
        this.requestBtn = q<HTMLButtonElement>(".webmidi-request-btn");
        this.deviceListEl = q<HTMLElement>(".webmidi-device-list");
        this.forceChk = q<HTMLInputElement>(".webmidi-force-chk");
        this.chSel = q<HTMLSelectElement>(".webmidi-ch-sel");
        this.progSel = q<HTMLSelectElement>(".webmidi-prog-sel");

        for (let ch = 1; ch <= 16; ch++) {
            const opt = document.createElement("option");
            opt.value = String(ch - 1);
            opt.textContent = ch === 10 ? "10 (drums)" : String(ch);
            this.chSel.appendChild(opt);
        }

        for (let p = 0; p < 128; p++) {
            const opt = document.createElement("option");
            opt.value = String(p);
            opt.textContent = `${p + 1}: ${instrumentPatchs[p] ?? "?"}`;
            this.progSel.appendChild(opt);
        }

        if (!("requestMIDIAccess" in navigator)) {
            this.statusEl.textContent = "Web MIDI API not supported in this browser.";
            this.requestBtn.disabled = true;
        } else {
            this.statusEl.textContent = "Web MIDI API: supported.";
        }

        this.requestBtn.addEventListener("click", () => {
            this.options.onRequest?.();
            void this.doRequest();
        });

        this.progSel.addEventListener("change", () => this.sendProgramChange());
    }

    on(listener: Listener): void {
        this.listeners.push(listener);
    }

    // Rewrite the channel nibble of a ChannelEvent; non-channel events pass through.
    private rechannel(e: midi.Event): midi.Event {
        if (!(e instanceof midi.ChannelEvent)) return e;
        const ch = Number(this.chSel.value) & 0x0f;
        const newStatus = (e.status & 0xf0) | ch;
        return new (e.constructor as new (dv: DataView, tick: number, st: number) => midi.Event)(
            e.dataView,
            e.tick,
            newStatus,
        );
    }

    private emit(e: midi.Event): void {
        const event = this.forceChk.checked ? this.rechannel(e) : e;
        for (const l of this.listeners) l(event);
    }

    // PC always targets the currently selected channel regardless of the force checkbox.
    private sendProgramChange(): void {
        const channel = Number(this.chSel.value) & 0x0f;
        const program = Number(this.progSel.value);
        const buf = new Uint8Array([program]);
        const dv = new DataView(buf.buffer);
        const event = new midi.ProgramChangeEvent(dv, 0, 0xc0 | channel);
        for (const l of this.listeners) l(event);
    }

    private async doRequest(): Promise<void> {
        this.requestBtn.disabled = true;
        try {
            const access = await navigator.requestMIDIAccess();
            this.midiAccess = access;
            this.requestBtn.textContent = "Refresh";
            this.requestBtn.disabled = false;
            this.updateDeviceList();
            access.onstatechange = () => this.updateDeviceList();
        } catch (err) {
            this.statusEl.textContent = `MIDI access denied: ${String(err)}`;
            this.requestBtn.disabled = false;
        }
    }

    private updateDeviceList(): void {
        const inputs = [...this.midiAccess!.inputs.values()];
        this.deviceListEl.innerHTML = "";

        if (inputs.length === 0) {
            const li = document.createElement("li");
            li.className = "webmidi-no-devices";
            li.textContent = "No MIDI input devices connected.";
            this.deviceListEl.appendChild(li);
            this.statusEl.textContent = "Web MIDI: no devices connected.";
            return;
        }

        for (const input of inputs) {
            const li = document.createElement("li");
            li.dataset.state = input.state;
            li.textContent =
                input.state === "connected"
                    ? (input.name ?? "(unnamed)")
                    : `${input.name ?? "(unnamed)"} — ${input.state}`;
            this.deviceListEl.appendChild(li);

            input.onmidimessage = (event) => {
                const data = event.data;
                if (!data || data.length === 0) return;
                const status = data[0];
                const subDataView = new DataView(data.buffer, data.byteOffset + 1);
                try {
                    this.emit(midi.Event.create(subDataView, 0, status));
                } catch {
                    // ignore malformed sysex / unrecognised status bytes
                }
            };
        }

        const n = inputs.length;
        this.statusEl.textContent = `Web MIDI: ${n} device${n !== 1 ? "s" : ""} connected.`;
    }
}
