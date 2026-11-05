/* tslint:disable */
/* eslint-disable */

/**
 * A generation split into steps so the page can show progress. QR encoding each frame is the
 * long part: the page calls `step` in slices and paints between them, then `finish` renders
 * and encodes the GIF in one go.
 */
export class GifJob {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * How many frames have had their QR matrix generated so far.
     */
    encoded_frames(): number;
    /**
     * Renders and encodes the GIF. Every frame must have been stepped first.
     */
    finish(): GifOutput;
    /**
     * Pixel dimension (width and height) of a frame with `quiet_zone` modules added.
     */
    get_frame_dimension(index: number, quiet_zone: number): number;
    /**
     * Flat RGBA pixel buffer (1 module = 1 pixel) for frame `index`, with `quiet_zone` border.
     * Ready for direct painting via `ImageData` onto an HTML5 canvas.
     */
    get_frame_rgba(index: number, quiet_zone: number): Uint8Array;
    constructor(data: Uint8Array | number[], chunk_len: number, fps: number, size: number, redundancy: number, compat: boolean);
    /**
     * Payload size after compression.
     */
    packed_size(): number;
    /**
     * QR-encodes up to `count` more frames. Returns how many frames are done so far.
     */
    step(count: number): number;
    total_frames(): number;
}

/**
 * Encodes raw binary data into an animated QR GIF.
 * A finished GIF plus the numbers the page shows: how much compression saved and how many
 * frames the animation really has (the page cannot compute either on its own).
 */
export class GifOutput {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    bytes(): Uint8Array;
    canvas(): number;
    frame_count(): number;
    /**
     * Payload size after compression, i.e. what actually has to be scanned through.
     */
    packed_size(): number;
}

/**
 * Result of scanning a single video frame.
 */
export class ScanResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Whether the transfer is now complete.
     */
    completed: boolean;
    height: number;
    /**
     * Whether this frame contributed a new symbol to the fountain decoder.
     */
    new_frame: boolean;
    /**
     * Whether any QR code was detected and decoded in the image.
     */
    qr_detected: boolean;
    /**
     * Number of chunks received so far.
     */
    received_chunks: number;
    /**
     * Total expected source chunks.
     */
    total_chunks: number;
    width: number;
    /**
     * Bounding box of the QR code in the scanned image, all zeros when none was found.
     */
    x: number;
    y: number;
}

/**
 * State machine decoder for receiving animated QR frames over camera or stream.
 */
export class WasmDecoder {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Feeds a raw txqr frame directly. Returns true if decode completed.
     */
    add_frame(frame: Uint8Array | number[]): boolean;
    static auto(): WasmDecoder;
    static compat(): WasmDecoder;
    /**
     * Returns `"fast"`, `"compat"`, or `""` if not yet detected.
     */
    detected_scheme(): string;
    static fast(): WasmDecoder;
    get_data(): Uint8Array | undefined;
    is_completed(): boolean;
    constructor(compat?: boolean | null);
    progress(): number;
    received_chunks(): number;
    /**
     * Resets the decoder state to accept a new transfer.
     */
    reset(): void;
    /**
     * Scans an RGBA image buffer (from canvas/video), extracts QR code, and feeds to decoder.
     * Returns ScanResult with status.
     */
    scan_frame(rgba: Uint8Array | number[], width: number, height: number): ScanResult;
    total_chunks(): number;
}

export function encode_gif(data: Uint8Array | number[], chunk_len: number, fps: number, size: number, redundancy: number, compat: boolean): GifOutput;

export function init_panic_hook(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_scanresult_completed: (a: number) => number;
    readonly __wbg_get_scanresult_height: (a: number) => number;
    readonly __wbg_get_scanresult_new_frame: (a: number) => number;
    readonly __wbg_get_scanresult_qr_detected: (a: number) => number;
    readonly __wbg_get_scanresult_received_chunks: (a: number) => number;
    readonly __wbg_get_scanresult_total_chunks: (a: number) => number;
    readonly __wbg_get_scanresult_width: (a: number) => number;
    readonly __wbg_get_scanresult_x: (a: number) => number;
    readonly __wbg_get_scanresult_y: (a: number) => number;
    readonly __wbg_gifjob_free: (a: number, b: number) => void;
    readonly __wbg_gifoutput_free: (a: number, b: number) => void;
    readonly __wbg_scanresult_free: (a: number, b: number) => void;
    readonly __wbg_set_scanresult_completed: (a: number, b: number) => void;
    readonly __wbg_set_scanresult_height: (a: number, b: number) => void;
    readonly __wbg_set_scanresult_new_frame: (a: number, b: number) => void;
    readonly __wbg_set_scanresult_qr_detected: (a: number, b: number) => void;
    readonly __wbg_set_scanresult_received_chunks: (a: number, b: number) => void;
    readonly __wbg_set_scanresult_total_chunks: (a: number, b: number) => void;
    readonly __wbg_set_scanresult_width: (a: number, b: number) => void;
    readonly __wbg_set_scanresult_x: (a: number, b: number) => void;
    readonly __wbg_set_scanresult_y: (a: number, b: number) => void;
    readonly __wbg_wasmdecoder_free: (a: number, b: number) => void;
    readonly encode_gif: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly gifjob_encoded_frames: (a: number) => number;
    readonly gifjob_finish: (a: number) => [number, number, number];
    readonly gifjob_get_frame_dimension: (a: number, b: number, c: number) => [number, number, number];
    readonly gifjob_get_frame_rgba: (a: number, b: number, c: number) => [number, number, number, number];
    readonly gifjob_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly gifjob_packed_size: (a: number) => number;
    readonly gifjob_step: (a: number, b: number) => [number, number, number];
    readonly gifjob_total_frames: (a: number) => number;
    readonly gifoutput_bytes: (a: number) => [number, number];
    readonly gifoutput_canvas: (a: number) => number;
    readonly gifoutput_frame_count: (a: number) => number;
    readonly gifoutput_packed_size: (a: number) => number;
    readonly init_panic_hook: () => void;
    readonly wasmdecoder_add_frame: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmdecoder_auto: () => number;
    readonly wasmdecoder_compat: () => number;
    readonly wasmdecoder_detected_scheme: (a: number) => [number, number];
    readonly wasmdecoder_fast: () => number;
    readonly wasmdecoder_get_data: (a: number) => [number, number, number, number];
    readonly wasmdecoder_is_completed: (a: number) => number;
    readonly wasmdecoder_new: (a: number) => number;
    readonly wasmdecoder_progress: (a: number) => number;
    readonly wasmdecoder_received_chunks: (a: number) => number;
    readonly wasmdecoder_reset: (a: number) => void;
    readonly wasmdecoder_scan_frame: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly wasmdecoder_total_chunks: (a: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
