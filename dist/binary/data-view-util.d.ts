export declare function dataViewGetSubDataView(dataView: DataView, byteOffset: number, byteLength?: number): DataView<ArrayBufferLike>;
export declare function dataViewGetUint(dataView: DataView, byteOffset: number, isLittleEndian: boolean, byteLength?: number): number;
export declare function dataViewGetUintVariable(dataView: DataView, byteOffset: number): {
    value: number;
    byteLength: number;
};
export declare function dataViewGetString(dataView: DataView, byteOffset: number, length: number): string;
//# sourceMappingURL=data-view-util.d.ts.map