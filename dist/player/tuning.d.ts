export interface Tuning {
    frequency(noteNumber: number): number;
}
export declare class EqualTemperamentTuning implements Tuning {
    private _frequencyOf69;
    private _cache;
    constructor(_frequencyOf69?: number);
    frequency(noteNumber: number): number;
}
