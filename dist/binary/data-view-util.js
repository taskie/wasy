"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function dataViewGetSubDataView(dataView, byteOffset, byteLength) {
    if (typeof byteLength === "undefined") {
        byteLength = dataView.byteLength - byteOffset;
    }
    return new DataView(dataView.buffer, dataView.byteOffset + byteOffset, byteLength);
}
exports.dataViewGetSubDataView = dataViewGetSubDataView;
function dataViewGetUint(dataView, byteOffset, isLittleEndian, byteLength) {
    var value = 0;
    if (typeof byteLength === "undefined") {
        byteLength = dataView.byteLength - byteOffset;
    }
    if (isLittleEndian) {
        for (var i = byteLength - 1; i >= 0; --i) {
            value = (value << 8) + dataView.getUint8(byteOffset + i);
        }
    }
    else {
        for (var i = 0; i < byteLength; ++i) {
            value = (value << 8) + dataView.getUint8(byteOffset + i);
        }
    }
    return value;
}
exports.dataViewGetUint = dataViewGetUint;
function dataViewGetUintVariable(dataView, byteOffset) {
    var value = 0;
    var pos = 0;
    for (;;) {
        let byte = dataView.getUint8(byteOffset + pos);
        ++pos;
        let msb = byte & 0b10000000;
        let val = byte & 0b01111111;
        value = (value << 7) + val;
        if (!msb) {
            break;
        }
    }
    return { value, byteLength: pos };
}
exports.dataViewGetUintVariable = dataViewGetUintVariable;
function dataViewGetString(dataView, byteOffset, length) {
    let bytes = new Uint8Array(dataView.buffer, dataView.byteOffset + byteOffset, length);
    return String.fromCharCode.apply(null, bytes);
}
exports.dataViewGetString = dataViewGetString;
;
//# sourceMappingURL=data-view-util.js.map