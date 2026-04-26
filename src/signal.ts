export interface Signal<T> {
    on(listener: (data: T) => void): void;
    off(listener: (data: T) => void): void;
    offAll(): void;
    emit(data: T): void;
}

export function createSignal<T>(): Signal<T> {
    let listeners: ((data: T) => void)[] = [];
    return {
        on(listener) {
            listeners.push(listener);
        },
        off(listener) {
            const pos = listeners.indexOf(listener);
            if (pos !== -1) {
                listeners.splice(pos, 1);
            }
        },
        offAll() {
            listeners = [];
        },
        emit(data) {
            for (const listener of listeners) {
                listener(data);
            }
        },
    };
}
