export default class Signal<T> {
    listeners: ((data: T) => void)[];

    constructor () {
        this.listeners = [];
    }
    
    on(listener: (data: T) => void) {
        this.listeners.push(listener);
    }
    
    off(listener: (data: T) => void) {
        const pos = this.listeners.indexOf(listener);
        if (pos !== -1) {
            this.listeners.splice(pos, 1);
        }
    }

    offAll() {
        this.listeners = [];
    }

    emit(data: T) {
        for (const listener of this.listeners) {
            listener(data);
        }
    }
}