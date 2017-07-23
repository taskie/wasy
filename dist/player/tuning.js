"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class EqualTemperamentTuning {
    constructor(_frequencyOf69 = 440) {
        this._frequencyOf69 = _frequencyOf69;
        this._cache = {};
    }
    frequency(noteNumber) {
        if (noteNumber in this._cache) {
            return this._cache[noteNumber];
        }
        else {
            let frequency = this._frequencyOf69 * Math.pow(2, (noteNumber - 69) / 12);
            this._cache[noteNumber] = frequency;
            return frequency;
        }
    }
}
exports.EqualTemperamentTuning = EqualTemperamentTuning;
//# sourceMappingURL=tuning.js.map