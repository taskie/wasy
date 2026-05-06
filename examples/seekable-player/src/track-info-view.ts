import { midi, type SongInfo, type TimedEvent } from "wasy";

type TickedItem = { tick: number; text: string };

export class TrackInfoView {
    private el: HTMLElement;
    private lyrics: TickedItem[] = [];
    private lyricValueEl: HTMLElement | null = null;

    constructor(el: HTMLElement) {
        this.el = el;
    }

    setSongInfo(info: SongInfo): void {
        const t = info.metadata;
        this.lyrics = t.lyrics;
        this.lyricValueEl = null;
        this.el.innerHTML = "";

        if (t.trackNames.length > 0) {
            this.el.appendChild(
                this.makeListSection(
                    "Track names",
                    t.trackNames.map((x) => `#${x.trackIndex} ${x.name}`),
                ),
            );
        }
        if (t.instrumentNames.length > 0) {
            this.el.appendChild(
                this.makeListSection(
                    "Instrument names",
                    t.instrumentNames.map((x) => `#${x.trackIndex} ${x.name}`),
                ),
            );
        }
        if (t.text.length > 0) {
            this.el.appendChild(this.makeListSection("Text", t.text));
        }
        if (t.lyrics.length > 0) {
            const { section, valueEl } = this.makeDynamicSection("Lyric");
            this.lyricValueEl = valueEl;
            this.el.appendChild(section);
        }

        this.update(0);
    }

    clear(): void {
        this.el.innerHTML = "";
        this.lyrics = [];
        this.lyricValueEl = null;
    }

    onTimedEvent(e: TimedEvent): void {
        if (e.midiEvent instanceof midi.LyricMetaEvent && this.lyricValueEl != null) {
            this.lyricValueEl.textContent = e.midiEvent.text();
        }
    }

    update(tick: number): void {
        if (this.lyricValueEl != null) {
            const l = this.activeAt(this.lyrics, tick);
            this.lyricValueEl.textContent = l != null ? l.text : "—";
        }
    }

    private activeAt(list: TickedItem[], tick: number): TickedItem | undefined {
        let result: TickedItem | undefined;
        for (const item of list) {
            if (item.tick <= tick) result = item;
            else break;
        }
        return result;
    }

    private makeListSection(label: string, items: string[]): HTMLElement {
        const details = document.createElement("details");
        details.className = "track-info-section";
        const summary = document.createElement("summary");
        summary.className = "track-info-heading";
        summary.textContent = label;
        details.appendChild(summary);
        const textarea = document.createElement("textarea");
        textarea.className = "track-info-textarea";
        textarea.readOnly = true;
        textarea.rows = Math.min(items.length, 8);
        textarea.value = items.join("\n");
        details.appendChild(textarea);
        return details;
    }

    private makeDynamicSection(label: string): { section: HTMLElement; valueEl: HTMLElement } {
        const section = document.createElement("div");
        section.className = "track-info-section";
        const heading = document.createElement("div");
        heading.className = "track-info-heading";
        heading.textContent = label;
        section.appendChild(heading);
        const valueEl = document.createElement("div");
        valueEl.className = "track-info-dynamic";
        valueEl.textContent = "—";
        section.appendChild(valueEl);
        return { section, valueEl };
    }
}
