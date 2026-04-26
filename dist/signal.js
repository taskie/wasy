export default class Signal {
    listeners;
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
//# sourceMappingURL=signal.js.map