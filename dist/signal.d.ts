export default class Signal<T> {
    listeners: ((data: T) => void)[];
    constructor();
    on(listener: (data: T) => void): void;
    off(listener: (data: T) => void): void;
    offAll(): void;
    emit(data: T): void;
}
