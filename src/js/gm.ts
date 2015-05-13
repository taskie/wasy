import * as midi from "./lib/midi";
import SingleEventEmitter from "./lib/single-event-emitter";

export const instrumentPatchs = [
  "Bright Piano",
  "Electric Grand Piano",
  "Honky-tonk Piano",
  "Electric Piano",
  "Electric Piano 2",
  "Harpsichord",
  "Clavi",
  "Celesta",
  "Glockenspiel",
  "Musical box",
  "Vibraphone",
  "Marimba",
  "Xylophone",
  "Tubular Bell",
  "Dulcimer",
  "Drawbar Organ",
  "Percussive Organ",
  "Rock Organ",
  "Church organ",
  "Reed organ",
  "Accordion",
  "Harmonica",
  "Tango Accordion",
  "Acoustic Guitar (nylon)",
  "Acoustic Guitar (steel)",
  "Electric Guitar (jazz)",
  "Electric Guitar (clean)",
  "Electric Guitar (muted)",
  "Overdriven Guitar",
  "Distortion Guitar",
  "Guitar harmonics",
  "Acoustic Bass",
  "Electric Bass (finger)",
  "Electric Bass (pick)",
  "Fretless Bass",
  "Slap Bass 1",
  "Slap Bass 2",
  "Synth Bass 1",
  "Synth Bass 2",
  "Violin",
  "Viola",
  "Cello",
  "Double bass",
  "Tremolo Strings",
  "Pizzicato Strings",
  "Orchestral Harp",
  "Timpani",
  "String Ensemble 1",
  "String Ensemble 2",
  "Synth Strings 1",
  "Synth Strings 2",
  "Voice Aahs",
  "Voice Oohs",
  "Synth Voice",
  "Orchestra Hit",
  "Trumpet",
  "Trombone",
  "Tuba",
  "Muted Trumpet",
  "French horn",
  "Brass Section",
  "Synth Brass 1",
  "Synth Brass 2",
  "Soprano Sax",
  "Alto Sax",
  "Tenor Sax",
  "Baritone Sax",
  "Oboe",
  "English Horn",
  "Bassoon",
  "Clarinet",
  "Piccolo",
  "Flute",
  "Recorder",
  "Pan Flute",
  "Blown Bottle",
  "Shakuhachi",
  "Whistle",
  "Ocarina",
  "Lead 1 (square)",
  "Lead 2 (sawtooth)",
  "Lead 3 (calliope)",
  "Lead 4 (chiff)",
  "Lead 5 (charang)",
  "Lead 6 (voice)",
  "Lead 7 (fifths)",
  "Lead 8 (bass + lead)",
  "Pad 1 (Fantasia)",
  "Pad 2 (warm)",
  "Pad 3 (polysynth)",
  "Pad 4 (choir)",
  "Pad 5 (bowed)",
  "Pad 6 (metallic)",
  "Pad 7 (halo)",
  "Pad 8 (sweep)",
  "FX 1 (rain)",
  "FX 2 (soundtrack)",
  "FX 3 (crystal)",
  "FX 4 (atmosphere)",
  "FX 5 (brightness)",
  "FX 6 (goblins)",
  "FX 7 (echoes)",
  "FX 8 (sci-fi)",
  "Sitar",
  "Banjo",
  "Shamisen",
  "Koto",
  "Kalimba",
  "Bagpipe",
  "Fiddle",
  "Shanai",
  "Tinkle Bell",
  "Agogo",
  "Steel Drums",
  "Woodblock",
  "Taiko Drum",
  "Melodic Tom",
  "Synth Drum",
  "Reverse Cymbal",
  "Guitar Fret Noise",
  "Breath Noise",
  "Seashore",
  "Bird Tweet",
  "Telephone Ring",
  "Helicopter",
  "Applause",
  "Gunshot"
]

export const percussionKeyMap = {
  35: "Bass Drum 2",
  36: "Bass Drum 1",
  37: "Side Stick",
  38: "Snare Drum 1",
  39: "Hand Clap",
  40: "Snare Drum 2",
  41: "Low Tom 2",
  42: "Closed Hi-hat",
  43: "Low Tom 1",
  44: "Pedal Hi-hat",
  45: "Mid Tom 2",
  46: "Open Hi-hat",
  47: "Mid Tom 1",
  48: "High Tom 2",
  49: "Crash Cymbal 1",
  50: "High Tom 1",
  51: "Ride Cymbal 1",
  52: "Chinese Cymbal",
  53: "Ride Bell",
  54: "Tambourine",
  55: "Splash Cymbal",
  56: "Cowbell",
  57: "Crash Cymbal 2",
  58: "Vibra Slap",
  59: "Ride Cymbal 2",
  60: "High Bongo",
  61: "Low Bongo",
  62: "Mute High Conga",
  63: "Open High Conga",
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
  76: "High Wood Block",
  77: "Low Wood Block",
  78: "Mute Cuica",
  79: "Open Cuica",
  80: "Mute Triangle",
  81: "Open Triangle"
}

export interface ExpiredMessage<T>
{
  data: T;
  time: number;
}

export class NotePool<T> {
  _noteStore: { [noteNumber: number]: T };
  _noteNumberQueue: number[];
  _expiredEmitter: SingleEventEmitter<ExpiredMessage<T>>;

  constructor(public polyphony: number = 16) {
    this._noteStore = {};
    this._noteNumberQueue = [];
    this._expiredEmitter = new SingleEventEmitter<ExpiredMessage<T>>();
  }

  onExpired(listener: (message: ExpiredMessage<T>) => void) {
    this._expiredEmitter.on(listener);
  }

  offExpired(listener: (message: ExpiredMessage<T>) => void) {
    this._expiredEmitter.off(listener);
  }

  register(noteNumber: number, data: T, time: number) {
    {
      // check store
      let oldData = this._noteStore[noteNumber];
      if (oldData != null) {
        this._expiredEmitter.emit({data: oldData, time});
        let oldIndex = this._noteNumberQueue.indexOf(noteNumber);
        if (oldIndex !== -1) {
          this._noteNumberQueue.splice(oldIndex, 1);
        }
      }
      this._noteStore[noteNumber] = data;
    }
    {
      // check queue
      this._noteNumberQueue.push(noteNumber);
      while (this._noteNumberQueue.length > this.polyphony) {
        let oldNoteNumber = this._noteNumberQueue.shift();
        this._expiredEmitter.emit({data: this._noteStore[oldNoteNumber], time});
        this._noteStore[oldNoteNumber] = null;
      }
    }
  }

  unregisterAll(time: number = 0) {
    for (let noteNumber of this._noteNumberQueue) {
      this._expiredEmitter.emit({data: this._noteStore[noteNumber], time});
    }
    this._noteStore = {};
    this._noteNumberQueue = [];
  }

  find(noteNumber: number): T {
    return this._noteStore[noteNumber];
  }

  get noteStore(): { [noteNumber: number]: T } {
    return this._noteStore;
  }

  get noteNumberQueue(): number[] {
    return this._noteNumberQueue;
  }
}

export interface Patch<T> {
  receiveEvent(event: midi.Event, time: number);
}

export class Instrument<T> {
  patch: Patch<T>;
  notePool: NotePool<T>;
  private _expiredEmitter: SingleEventEmitter<ExpiredMessage<T>>;
  private _programChangeEmitter: SingleEventEmitter<midi.ProgramChangeEvent>;

  source: AudioNode;
  _panner: PannerNode;
  _gain: GainNode;

  volume: number;      // 7
  panpot: number;      // 10
  expression: number;  // 11
  pitchBend: number;
  
  constructor(public audioContext: AudioContext, public destination: AudioNode) {
    this.notePool = new NotePool<T>();
    this.notePool.onExpired(this._expiredListener.bind(this));
    this._expiredEmitter = new SingleEventEmitter<ExpiredMessage<T>>();
    this._programChangeEmitter = new SingleEventEmitter<midi.ProgramChangeEvent>();

    this._panner = this.audioContext.createPanner();
    this._gain = this.audioContext.createGain();
    this.source = this._panner;
    this._panner.connect(this._gain);
    this._gain.connect(destination);

    this.volume = 100;
    this.panpot = 64;
    this.expression = 127;
    this.pitchBend = 0;
  }
  destroy() {
    this.notePool.unregisterAll();
    this._expiredEmitter.offAll();
    this._programChangeEmitter.offAll();
  }
  setPanpot(panpot: number) {
    var value = (panpot - 64) * Math.PI / (64 * 2);
    this._panner.setPosition(Math.sin(value), 0, -Math.cos(value));
    this.panpot = panpot;
  }
  setVolume(volume: number, time: number) {
    this._gain.gain.setValueAtTime(volume / 127 * this.expression / 127, time);
    this.volume = volume;
  }
  setExpression(expression: number, time: number) {
    this._gain.gain.setValueAtTime(this.volume / 127 * expression / 127, time);
    this.expression = expression;
  }
  get detuneRange () { return 2; }
  set detune(detune: number) { this.pitchBend = detune / 100 / this.detuneRange * 8192; }
  get detune () { return this.pitchBend / 8192 * this.detuneRange * 100; }
  registerNote(noteNumber: number, data: T, time: number) {
    this.notePool.register(noteNumber, data, time);
  }
  findNote(noteNumber: number) {
    return this.notePool.find(noteNumber);
  }
  get noteStore () {
    return this.notePool.noteStore;
  }
  onExpired(listener: (data: ExpiredMessage<T>) => void) {
    this._expiredEmitter.on(listener);
  }
  offExpired(listener: (data: ExpiredMessage<T>) => void) {
    this._expiredEmitter.off(listener);
  }
  private _expiredListener(message: ExpiredMessage<T>) {
    this._expiredEmitter.emit(message);
  }
  onProgramChange(listener: (event: midi.ProgramChangeEvent) => void) {
    this._programChangeEmitter.on(listener);
  }
  offProgramChange(listener: (event: midi.ProgramChangeEvent) => void) {
    this._programChangeEmitter.off(listener);
  }
  receiveEvent(event: midi.Event, time: number) {
    if (event instanceof midi.ControlChangeEvent) {
      switch (event.controller) {
        case 7:
          this.setVolume(event.value, time);
          break;
        case 10:
          this.setPanpot(event.value);
          break;
        case 11:
          this.setExpression(event.value, time);
          break;
        default:
          if (this.patch) {
            this.patch.receiveEvent(event, time);
          }
          break;
      }
    } else if (event instanceof midi.ProgramChangeEvent) {
      this._programChangeEmitter.emit(event);
    } else {
      if (this.patch) {
        this.patch.receiveEvent(event, time);
      }
    }
  }
}
