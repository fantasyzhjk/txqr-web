/* @ts-self-types="./txqr_wasm.d.ts" */

/**
 * A generation split into steps so the page can show progress. QR encoding each frame is the
 * long part: the page calls `step` in slices and paints between them, then `finish` renders
 * and encodes the GIF in one go.
 */
export class GifJob {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GifJobFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_gifjob_free(ptr, 0);
    }
    /**
     * How many frames have had their QR matrix generated so far.
     * @returns {number}
     */
    encoded_frames() {
        const ret = wasm.gifjob_encoded_frames(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Renders and encodes the GIF. Every frame must have been stepped first.
     * @returns {GifOutput}
     */
    finish() {
        const ret = wasm.gifjob_finish(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return GifOutput.__wrap(ret[0]);
    }
    /**
     * Pixel dimension (width and height) of a frame with `quiet_zone` modules added.
     * @param {number} index
     * @param {number} quiet_zone
     * @returns {number}
     */
    get_frame_dimension(index, quiet_zone) {
        const ret = wasm.gifjob_get_frame_dimension(this.__wbg_ptr, index, quiet_zone);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Flat RGBA pixel buffer (1 module = 1 pixel) for frame `index`, with `quiet_zone` border.
     * Ready for direct painting via `ImageData` onto an HTML5 canvas.
     * @param {number} index
     * @param {number} quiet_zone
     * @returns {Uint8Array}
     */
    get_frame_rgba(index, quiet_zone) {
        const ret = wasm.gifjob_get_frame_rgba(this.__wbg_ptr, index, quiet_zone);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {Uint8Array | number[]} data
     * @param {number} chunk_len
     * @param {number} fps
     * @param {number} size
     * @param {number} redundancy
     * @param {boolean} compat
     */
    constructor(data, chunk_len, fps, size, redundancy, compat) {
        const val2 = +chunk_len;
        const val3 = +fps;
        const val4 = +size;
        const val5 = +redundancy;
        const val6 = +compat;
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.gifjob_new(ptr0, len0, val2, val3, val4, val5, val6);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        GifJobFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Payload size after compression.
     * @returns {number}
     */
    packed_size() {
        const ret = wasm.gifjob_packed_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * QR-encodes up to `count` more frames. Returns how many frames are done so far.
     * @param {number} count
     * @returns {number}
     */
    step(count) {
        const ret = wasm.gifjob_step(this.__wbg_ptr, count);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * @returns {number}
     */
    total_frames() {
        const ret = wasm.gifjob_total_frames(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) GifJob.prototype[Symbol.dispose] = GifJob.prototype.free;

/**
 * Encodes raw binary data into an animated QR GIF.
 * A finished GIF plus the numbers the page shows: how much compression saved and how many
 * frames the animation really has (the page cannot compute either on its own).
 */
export class GifOutput {
    static __wrap(ptr) {
        const obj = Object.create(GifOutput.prototype);
        obj.__wbg_ptr = ptr;
        GifOutputFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GifOutputFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_gifoutput_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    bytes() {
        const ret = wasm.gifoutput_bytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number}
     */
    canvas() {
        const ret = wasm.gifoutput_canvas(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    frame_count() {
        const ret = wasm.gifoutput_frame_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Payload size after compression, i.e. what actually has to be scanned through.
     * @returns {number}
     */
    packed_size() {
        const ret = wasm.gifoutput_packed_size(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) GifOutput.prototype[Symbol.dispose] = GifOutput.prototype.free;

/**
 * Result of scanning a single video frame.
 */
export class ScanResult {
    static __wrap(ptr) {
        const obj = Object.create(ScanResult.prototype);
        obj.__wbg_ptr = ptr;
        ScanResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ScanResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_scanresult_free(ptr, 0);
    }
    /**
     * Whether the transfer is now complete.
     * @returns {boolean}
     */
    get completed() {
        const ret = wasm.__wbg_get_scanresult_completed(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get height() {
        const ret = wasm.__wbg_get_scanresult_height(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Whether this frame contributed a new symbol to the fountain decoder.
     * @returns {boolean}
     */
    get new_frame() {
        const ret = wasm.__wbg_get_scanresult_new_frame(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Whether any QR code was detected and decoded in the image.
     * @returns {boolean}
     */
    get qr_detected() {
        const ret = wasm.__wbg_get_scanresult_qr_detected(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Number of chunks received so far.
     * @returns {number}
     */
    get received_chunks() {
        const ret = wasm.__wbg_get_scanresult_received_chunks(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Total expected source chunks.
     * @returns {number}
     */
    get total_chunks() {
        const ret = wasm.__wbg_get_scanresult_total_chunks(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get width() {
        const ret = wasm.__wbg_get_scanresult_width(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Bounding box of the QR code in the scanned image, all zeros when none was found.
     * @returns {number}
     */
    get x() {
        const ret = wasm.__wbg_get_scanresult_x(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get y() {
        const ret = wasm.__wbg_get_scanresult_y(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Whether the transfer is now complete.
     * @param {boolean} arg0
     */
    set completed(arg0) {
        wasm.__wbg_set_scanresult_completed(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set height(arg0) {
        wasm.__wbg_set_scanresult_height(this.__wbg_ptr, arg0);
    }
    /**
     * Whether this frame contributed a new symbol to the fountain decoder.
     * @param {boolean} arg0
     */
    set new_frame(arg0) {
        wasm.__wbg_set_scanresult_new_frame(this.__wbg_ptr, arg0);
    }
    /**
     * Whether any QR code was detected and decoded in the image.
     * @param {boolean} arg0
     */
    set qr_detected(arg0) {
        wasm.__wbg_set_scanresult_qr_detected(this.__wbg_ptr, arg0);
    }
    /**
     * Number of chunks received so far.
     * @param {number} arg0
     */
    set received_chunks(arg0) {
        wasm.__wbg_set_scanresult_received_chunks(this.__wbg_ptr, arg0);
    }
    /**
     * Total expected source chunks.
     * @param {number} arg0
     */
    set total_chunks(arg0) {
        wasm.__wbg_set_scanresult_total_chunks(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set width(arg0) {
        wasm.__wbg_set_scanresult_width(this.__wbg_ptr, arg0);
    }
    /**
     * Bounding box of the QR code in the scanned image, all zeros when none was found.
     * @param {number} arg0
     */
    set x(arg0) {
        wasm.__wbg_set_scanresult_x(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set y(arg0) {
        wasm.__wbg_set_scanresult_y(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) ScanResult.prototype[Symbol.dispose] = ScanResult.prototype.free;

/**
 * State machine decoder for receiving animated QR frames over camera or stream.
 */
export class WasmDecoder {
    static __wrap(ptr) {
        const obj = Object.create(WasmDecoder.prototype);
        obj.__wbg_ptr = ptr;
        WasmDecoderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmDecoderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmdecoder_free(ptr, 0);
    }
    /**
     * Feeds a raw txqr frame directly. Returns true if decode completed.
     * @param {Uint8Array | number[]} frame
     * @returns {boolean}
     */
    add_frame(frame) {
        const ptr0 = passArray8ToWasm0(frame, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdecoder_add_frame(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    /**
     * @returns {WasmDecoder}
     */
    static auto() {
        const ret = wasm.wasmdecoder_auto();
        return WasmDecoder.__wrap(ret);
    }
    /**
     * @returns {WasmDecoder}
     */
    static compat() {
        const ret = wasm.wasmdecoder_compat();
        return WasmDecoder.__wrap(ret);
    }
    /**
     * Returns `"fast"`, `"compat"`, or `""` if not yet detected.
     * @returns {string}
     */
    detected_scheme() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmdecoder_detected_scheme(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {WasmDecoder}
     */
    static fast() {
        const ret = wasm.wasmdecoder_fast();
        return WasmDecoder.__wrap(ret);
    }
    /**
     * @returns {Uint8Array | undefined}
     */
    get_data() {
        const ret = wasm.wasmdecoder_get_data(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {boolean}
     */
    is_completed() {
        const ret = wasm.wasmdecoder_is_completed(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean | null} [compat]
     */
    constructor(compat) {
        const ret = wasm.wasmdecoder_new(isLikeNone(compat) ? 0xFFFFFF : compat ? 1 : 0);
        this.__wbg_ptr = ret;
        WasmDecoderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    progress() {
        const ret = wasm.wasmdecoder_progress(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    received_chunks() {
        const ret = wasm.wasmdecoder_received_chunks(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Resets the decoder state to accept a new transfer.
     */
    reset() {
        wasm.wasmdecoder_reset(this.__wbg_ptr);
    }
    /**
     * Scans an RGBA image buffer (from canvas/video), extracts QR code, and feeds to decoder.
     * Returns ScanResult with status.
     * @param {Uint8Array | number[]} rgba
     * @param {number} width
     * @param {number} height
     * @returns {ScanResult}
     */
    scan_frame(rgba, width, height) {
        const val2 = +width;
        const val3 = +height;
        const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdecoder_scan_frame(this.__wbg_ptr, ptr0, len0, val2, val3);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ScanResult.__wrap(ret[0]);
    }
    /**
     * @returns {number}
     */
    total_chunks() {
        const ret = wasm.wasmdecoder_total_chunks(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) WasmDecoder.prototype[Symbol.dispose] = WasmDecoder.prototype.free;

/**
 * @param {Uint8Array | number[]} data
 * @param {number} chunk_len
 * @param {number} fps
 * @param {number} size
 * @param {number} redundancy
 * @param {boolean} compat
 * @returns {GifOutput}
 */
export function encode_gif(data, chunk_len, fps, size, redundancy, compat) {
    const val2 = +chunk_len;
    const val3 = +fps;
    const val4 = +size;
    const val5 = +redundancy;
    const val6 = +compat;
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.encode_gif(ptr0, len0, val2, val3, val4, val5, val6);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return GifOutput.__wrap(ret[0]);
}

export function init_panic_hook() {
    wasm.init_panic_hook();
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_208446807d0d1e30: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_error_757e9472f8410341: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_new_bb74001155cb8ca8: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_stack_575c4e0918581b9c: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
        },
    };
    return {
        __proto__: null,
        "./txqr_wasm_bg.js": import0,
    };
}

const GifJobFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_gifjob_free(ptr, 1));
const GifOutputFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_gifoutput_free(ptr, 1));
const ScanResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_scanresult_free(ptr, 1));
const WasmDecoderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmdecoder_free(ptr, 1));

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes);
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

let __wbg_init_promise;
async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path) {

    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('txqr_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
