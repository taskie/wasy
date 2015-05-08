import * as midi from "./midi";
import * as smf from "./smf";
import { EventEmitter } from "events";

new EventEmitter();

export interface ITuning {
    frequency(noteNumber: number): number;
}

export class EqualTemperamentTuning implements ITuning {
    private _cache: { [n: number]: number };

    constructor(private _frequencyOf69: number = 440) {
        this._cache = {};
    }

    frequency(noteNumber: number): number {
        if (noteNumber in this._cache) {
            return this._cache[noteNumber];
        } else {
            let frequency = this._frequencyOf69 * Math.pow(2, (noteNumber - 69) / 12);
            this._cache[noteNumber] = frequency;
            return frequency;
        }
    }
}

export class AudioGraph extends EventEmitter {
    data: {[key: string]: any};
    
    destroy() {
        this.emit("destroy", this);
    }
    
    noteOn(event: midi.NoteOnEvent) {
        this.emit("noteon", event, this);
    }
    
    noteOff(event: midi.NoteOffEvent) {
        this.emit("noteoff", event, this);
    }
}

export interface IAudioGraphGenerator {
    generateAudioGraph(): AudioGraph;
}

export class AudioGraphPool {
    _audioGraphStore: { [noteNumber: number]: AudioGraph };
    _noteNumberQueue: number[];

    constructor(public maxCapacity: number, public audioGraphGenerator: IAudioGraphGenerator) {
        this._audioGraphStore = {};
        this._noteNumberQueue = [];
    }
    
    noteOn(event: midi.NoteOnEvent) {
        let audioGraph = this.audioGraphGenerator.generateAudioGraph();
        this._regist(event.noteNumber, audioGraph);
        audioGraph.noteOn(event);
    }

    private _regist(noteNumber: number, audioGraph: AudioGraph) {
        if (noteNumber in this._audioGraphStore) {
            this._removeWithNoteNumber(noteNumber);
        }
        this._noteNumberQueue.push(noteNumber);
        this._audioGraphStore[noteNumber] = audioGraph;
        while (this._noteNumberQueue.length > this.maxCapacity) {
            let oldNoteNumber = this._noteNumberQueue.shift();
            this._audioGraphStore[oldNoteNumber].destroy();
            delete this._audioGraphStore[oldNoteNumber];
        }
    }
    
    noteOff(event: midi.NoteOffEvent) {
        let audioGraph = this.find(event.noteNumber);
        if (audioGraph == null) return;
        audioGraph.noteOff(event);
    }

    unregistAll() {
        for (let noteNumber in this._audioGraphStore) {
            this._audioGraphStore[noteNumber].destroy();
        }
        this._audioGraphStore = {};
        this._noteNumberQueue = [];
    }

    find(noteNumber: number): AudioGraph {
        return this._audioGraphStore[noteNumber];
    }

    get noteNumberGraphMap(): { [noteNumber: number]: AudioGraph } {
        return this._audioGraphStore;
    }

    private _removeWithNoteNumber(noteNumber: number) {
        let index = this._noteNumberQueue.indexOf(noteNumber);
        this._noteNumberQueue.splice(index, 1);
        this._audioGraphStore[noteNumber].destroy();
        delete this._audioGraphStore[noteNumber];
    }
}