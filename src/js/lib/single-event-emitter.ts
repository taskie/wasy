export default class SingleEventEmitter<T>
{
  listeners: ((data: T) => void)[];
  constructor () {
    this.listeners = [];
  }
  on(listener: (data: T) => void) {
    this.listeners.push(listener);
  }
  off(listener: (data: T) => void) {
    let pos = this.listeners.indexOf(listener);
    if (pos !== -1) {
      this.listeners.splice(pos, 1);
    }
  }
  offAll() {
    this.listeners = [];
  }
  emit(data: T) {
    for (let listener of this.listeners) {
      listener(data);
    }
  }
}