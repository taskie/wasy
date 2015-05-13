export interface Tuning {
    frequency(noteNumber: number): number;
}

export class EqualTemperamentTuning implements Tuning {
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