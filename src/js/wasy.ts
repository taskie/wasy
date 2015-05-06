interface ITuning {
    frequency(noteNumber: number): number;
}

class EqualTemperamentTuning implements ITuning {
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

class AudioGraph {
    nodes: { [name: string]: AudioNode };
    userInfo: Object;

    destroy() {
        this.disconnectAll();
    }
    
    disconnectAll() {
        for (let name in this.nodes) {
            this.nodes[name].disconnect();
        }
    }
}

class AudioGraphPool {
    _audioGraphStore: { [noteNumber: number]: AudioGraph };
    _noteNumberQueue: number[];

    constructor(public maxCapacity: number) {
        this._audioGraphStore = {};
        this._noteNumberQueue = [];
    }

    regist(noteNumber: number, audioGraph: AudioGraph) {
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

    find(noteNumber: number): AudioGraph {
        return this._audioGraphStore[noteNumber];
    }

    get noteNumberGraphMap(): { [noteNumber: number]: AudioGraph } {
        return this._audioGraphStore;
    }

    unregist(noteNumber: number) {
        if (noteNumber in this._audioGraphStore) {
            this._removeWithNoteNumber(noteNumber);
        }
    }

    unregistAll() {
        for (let noteNumber in this._audioGraphStore) {
            this._audioGraphStore[noteNumber].destroy();
        }
        this._audioGraphStore = {};
        this._noteNumberQueue = [];
    }

    private _removeWithNoteNumber(noteNumber: number) {
        let index = this._noteNumberQueue.indexOf(noteNumber);
        this._noteNumberQueue.splice(index, 1);
        this._audioGraphStore[noteNumber].destroy();
        delete this._audioGraphStore[noteNumber];
    }
}

interface IInstrumentEvent {
    time: number;
}

interface IInstrumentNoteOnEvent extends IInstrumentEvent {
    instrument: Instrument;
    noteNumber: number;
    velocity: number;
}

interface IInstrumentNoteOffEvent extends IInstrumentEvent {
    instrument: Instrument;
    noteNumber: number;
    audioGraph: AudioGraph;
}

class Instrument {
    private _pool: AudioGraphPool;

    onNoteOn: (event: IInstrumentNoteOnEvent) => AudioGraph;
    onNoteOff: (event: IInstrumentNoteOffEvent) => void;

    constructor(
        public songEnvironment: SongEnvironment,
        public channelEnvironment: ChannelEnvironment) {
        this._pool = new AudioGraphPool(1);
    }

    noteOn(noteNumber: number, velocity: number, time: number) {
        if (this.onNoteOn != null) {
            let audioGraph = this.onNoteOn({ instrument: this, noteNumber, velocity, time });
            if (audioGraph != null) {
                this._pool.regist(noteNumber, audioGraph);
            }
        }
    }

    noteOff(noteNumber: number, time: number) {
        if (this.onNoteOff != null) {
            let audioGraph = this._pool.find(noteNumber);
            if (audioGraph != null) {
                console.log(audioGraph);
                this.onNoteOff({ instrument: this, noteNumber, audioGraph, time });
            }
        }
    }

    allSoundOff() {
        this._pool.unregistAll();
    }

    set polyphony(polyphony: number) {
        this._pool.maxCapacity = polyphony;
    }

    get polyphony() {
        return this._pool.maxCapacity;
    }
}

class ChannelEnvironment {

}

class SongEnvironment {

}

class Player {
    
}

let audioContext: AudioContext = new AudioContext();
let songEnvironment = new SongEnvironment();
let channelEnvironment = new ChannelEnvironment();
let instruments = new Array <Instrument>(16);
for (let i = 0; i < instruments.length; ++i) {
    instruments[i] = new Instrument(songEnvironment, channelEnvironment);    
}
let tuning = new EqualTemperamentTuning();

function webMidiLinkRecv(event) {
    console.log(event.data);
    var msg = event.data.split(",");
    switch (msg[0]) {
        case "midi":
            let status = parseInt(msg[1], 16);
            let channel = status & 0x0f;
            switch (status & 0xf0) {
                case 0x80:
                    console.log("Recv: NoteOff");
                    instruments[channel].noteOff(parseInt(msg[2], 16), audioContext.currentTime);
                    break;
                case 0x90:
                    console.log("Recv: NoteOn");
                    var velo = parseInt(msg[3], 16);
                    if (velo > 0)
                        instruments[channel].noteOn(parseInt(msg[2], 16), velo, audioContext.currentTime);
                    else
                        instruments[channel].noteOff(parseInt(msg[2], 16), audioContext.currentTime);
                    break;
                case 0xb0:
                    console.log("Recv: allSoundOff");
                    if (parseInt(msg[2], 16) == 0x78) {
                        instruments[channel].allSoundOff();
                    }
                    break;
            }
            break;
    }
}
