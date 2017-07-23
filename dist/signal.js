"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Signal {
    constructor() {
        this.listeners = [];
    }
    on(listener) {
        this.listeners.push(listener);
    }
    off(listener) {
        let pos = this.listeners.indexOf(listener);
        if (pos !== -1) {
            this.listeners.splice(pos, 1);
        }
    }
    offAll() {
        this.listeners = [];
    }
    emit(data) {
        for (let listener of this.listeners) {
            listener(data);
        }
    }
}
exports.default = Signal;
//# sourceMappingURL=signal.js.map