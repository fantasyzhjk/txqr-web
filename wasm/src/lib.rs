use flate2::read::DeflateDecoder;
use flate2::write::DeflateEncoder;
use flate2::Compression;
use quircs::Quirc;
use std::io::{Read, Write};
use txqr::qr::{ErrorCorrection, QrGifBuilder};
use txqr::{Decoder, Encoder, Scheme};
use wasm_bindgen::prelude::*;

/// A QR code found in a frame: raw payload bytes plus where it sits, in image pixels.
struct QrHit {
    payload: Vec<u8>,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

/// QR detector for camera frames.
///
/// quirc instead of the core crate's rqrr: quirc was ported from the C library written for
/// live video, so it tolerates perspective and motion far better, and it reports the code's
/// corners. Those corners let the page lock onto the region and decode a fraction of the
/// pixels on the following frames. The detector also keeps its scratch buffers between
/// frames, which is why it lives here and not in a free function.
struct QrReader {
    quirc: Quirc,
}

impl QrReader {
    fn new() -> Self {
        Self {
            quirc: Quirc::default(),
        }
    }

    fn read(&mut self, grayscale: &[u8], width: usize, height: usize) -> Option<QrHit> {
        // A candidate can be detected yet fail to decode (blur, glare, partial frame); keep
        // looking instead of giving up on the first one.
        for code in self.quirc.identify(width, height, grayscale) {
            let code = match code {
                Ok(code) => code,
                Err(_) => continue,
            };
            let Ok(data) = code.decode() else { continue };
            let hit = QrHit {
                payload: data.payload,
                x: 0,
                y: 0,
                width: 0,
                height: 0,
            };
            return Some(bbox(hit, &code.corners, width, height));
        }
        None
    }
}

/// Fills in the axis-aligned box around the (possibly rotated) corners, clamped to the image.
fn bbox(mut hit: QrHit, corners: &[quircs::Point; 4], width: usize, height: usize) -> QrHit {
    let (max_x, max_y) = (width as i32 - 1, height as i32 - 1);
    let mut x0 = i32::MAX;
    let mut y0 = i32::MAX;
    let mut x1 = i32::MIN;
    let mut y1 = i32::MIN;
    for p in corners {
        x0 = x0.min(p.x);
        y0 = y0.min(p.y);
        x1 = x1.max(p.x);
        y1 = y1.max(p.y);
    }
    let (x0, y0) = (x0.clamp(0, max_x), y0.clamp(0, max_y));
    let (x1, y1) = (x1.clamp(0, max_x), y1.clamp(0, max_y));
    hit.x = x0 as u32;
    hit.y = y0 as u32;
    hit.width = (x1 - x0).max(0) as u32 + 1;
    hit.height = (y1 - y0).max(0) as u32 + 1;
    hit
}

/// Marks a payload that was compressed before transmission. Without it a receiver cannot
/// tell compressed bytes from raw ones, so it travels inside the payload itself instead of
/// being a sender/receiver setting that can drift out of sync.
const COMPRESSED_MAGIC: &[u8; 4] = b"TQf1";

/// Near-8-bit entropy means deflate will fail on this payload. Checking that first skips the
/// compressor entirely; this is a single pass over a 64 KiB sample.
fn looks_random(data: &[u8]) -> bool {
    const SAMPLE: usize = 64 * 1024;
    let step = (data.len() / SAMPLE).max(1);

    let mut counts = [0u32; 256];
    let mut total = 0u32;
    for byte in data.iter().step_by(step) {
        counts[*byte as usize] += 1;
        total += 1;
    }

    let total = total as f64;
    let mut entropy = 0.0;
    for count in counts {
        if count > 0 {
            let p = count as f64 / total;
            entropy -= p * p.log2();
        }
    }
    entropy > 7.9
}

/// Compresses `data` for transmission at maximum ratio, or returns it untouched when that
/// would not pay off.
fn pack(data: &[u8]) -> Result<Vec<u8>, wasm_bindgen::JsError> {
    if looks_random(data) {
        return Ok(data.to_vec());
    }

    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::best());
    encoder
        .write_all(data)
        .map_err(|e| wasm_bindgen::JsError::new(&format!("compression failed: {e}")))?;
    let compressed = encoder
        .finish()
        .map_err(|e| wasm_bindgen::JsError::new(&format!("compression failed: {e}")))?;

    let header = COMPRESSED_MAGIC.len() + 4;
    if compressed.len() + header >= data.len() {
        return Ok(data.to_vec());
    }

    let mut packed = Vec::with_capacity(header + compressed.len());
    packed.extend_from_slice(COMPRESSED_MAGIC);
    packed.extend_from_slice(&(data.len() as u32).to_le_bytes());
    packed.extend_from_slice(&compressed);
    Ok(packed)
}

/// Undoes [`pack`]. Payloads without the magic are returned as they are, so senders that do
/// not compress stay readable.
fn unpack(data: &[u8]) -> Result<Vec<u8>, wasm_bindgen::JsError> {
    let header = COMPRESSED_MAGIC.len() + 4;
    if data.len() < header || &data[..COMPRESSED_MAGIC.len()] != COMPRESSED_MAGIC {
        return Ok(data.to_vec());
    }

    let mut expected = [0u8; 4];
    expected.copy_from_slice(&data[COMPRESSED_MAGIC.len()..header]);
    let mut out = Vec::with_capacity(u32::from_le_bytes(expected) as usize);
    DeflateDecoder::new(&data[header..])
        .read_to_end(&mut out)
        .map_err(|e| wasm_bindgen::JsError::new(&format!("payload decompression failed: {e}")))?;
    Ok(out)
}

#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

/// Fast RGBA to 8-bit grayscale conversion using ITU-R BT.601 integer approximation.
fn rgba_to_grayscale(rgba: &[u8], width: usize, height: usize) -> Vec<u8> {
    let mut gray = Vec::with_capacity(width * height);
    for chunk in rgba.chunks_exact(4) {
        let r = chunk[0] as u32;
        let g = chunk[1] as u32;
        let b = chunk[2] as u32;
        gray.push(((r * 77 + g * 150 + b * 29) >> 8) as u8);
    }
    gray
}

/// Encodes raw binary data into an animated QR GIF.
/// A finished GIF plus the numbers the page shows: how much compression saved and how many
/// frames the animation really has (the page cannot compute either on its own).
#[wasm_bindgen]
pub struct GifOutput {
    bytes: Vec<u8>,
    packed_size: usize,
    frame_count: usize,
    canvas: u32,
}

#[wasm_bindgen]
impl GifOutput {
    pub fn bytes(&self) -> Vec<u8> {
        self.bytes.clone()
    }

    /// Payload size after compression, i.e. what actually has to be scanned through.
    pub fn packed_size(&self) -> usize {
        self.packed_size
    }

    pub fn frame_count(&self) -> usize {
        self.frame_count
    }

    pub fn canvas(&self) -> u32 {
        self.canvas
    }
}

/// A generation split into steps so the page can show progress. QR encoding each frame is the
/// long part: the page calls `step` in slices and paints between them, then `finish` renders
/// and encodes the GIF in one go.
#[wasm_bindgen]
pub struct GifJob {
    frames: Vec<Vec<u8>>,
    matrices: Vec<Vec<Vec<bool>>>,
    packed_size: usize,
    fps: u32,
    size: u32,
}

#[wasm_bindgen]
impl GifJob {
    #[wasm_bindgen(constructor)]
    pub fn new(
        data: &[u8],
        chunk_len: usize,
        fps: u32,
        size: u32,
        redundancy: f64,
        compat: bool,
    ) -> Result<GifJob, wasm_bindgen::JsError> {
        let scheme = if compat { Scheme::Compat } else { Scheme::Fast };
        let packed = pack(data)?;
        let packed_size = packed.len();
        let frames = Encoder::new(chunk_len, scheme, redundancy)
            .encode(&packed)
            .map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))?;
        Ok(GifJob {
            matrices: Vec::with_capacity(frames.len()),
            frames,
            packed_size,
            fps,
            size,
        })
    }

    pub fn total_frames(&self) -> usize {
        self.frames.len()
    }

    /// How many frames have had their QR matrix generated so far.
    pub fn encoded_frames(&self) -> usize {
        self.matrices.len()
    }

    /// Payload size after compression.
    pub fn packed_size(&self) -> usize {
        self.packed_size
    }

    /// Pixel dimension (width and height) of a frame with `quiet_zone` modules added.
    pub fn get_frame_dimension(&self, index: usize, quiet_zone: u32) -> Result<u32, wasm_bindgen::JsError> {
        let matrix = self
            .matrices
            .get(index)
            .ok_or_else(|| wasm_bindgen::JsError::new("frame index out of bounds"))?;
        Ok(matrix.len() as u32 + quiet_zone * 2)
    }

    /// Flat RGBA pixel buffer (1 module = 1 pixel) for frame `index`, with `quiet_zone` border.
    /// Ready for direct painting via `ImageData` onto an HTML5 canvas.
    pub fn get_frame_rgba(&self, index: usize, quiet_zone: u32) -> Result<Vec<u8>, wasm_bindgen::JsError> {
        let matrix = self
            .matrices
            .get(index)
            .ok_or_else(|| wasm_bindgen::JsError::new("frame index out of bounds"))?;
        let modules = matrix.len();
        let dim = modules + (quiet_zone as usize) * 2;
        let mut rgba = vec![255u8; dim * dim * 4];
        let q = quiet_zone as usize;
        for (y, row) in matrix.iter().enumerate() {
            for (x, &dark) in row.iter().enumerate() {
                if dark {
                    let offset = ((y + q) * dim + (x + q)) * 4;
                    rgba[offset] = 0;
                    rgba[offset + 1] = 0;
                    rgba[offset + 2] = 0;
                }
            }
        }
        Ok(rgba)
    }

    /// QR-encodes up to `count` more frames. Returns how many frames are done so far.
    pub fn step(&mut self, count: usize) -> Result<usize, wasm_bindgen::JsError> {
        let done = self.matrices.len();
        let end = done.saturating_add(count).min(self.frames.len());
        for frame in &self.frames[done..end] {
            let matrix = txqr::qr::encode(frame, ErrorCorrection::M)
                .map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))?;
            self.matrices.push(matrix);
        }
        Ok(self.matrices.len())
    }

    /// Renders and encodes the GIF. Every frame must have been stepped first.
    pub fn finish(&self) -> Result<GifOutput, wasm_bindgen::JsError> {
        if self.matrices.len() != self.frames.len() {
            return Err(wasm_bindgen::JsError::new("frames are not all encoded yet"));
        }
        let gif = QrGifBuilder::from_matrices(self.matrices.clone())
            .fps(self.fps)
            .size(self.size)
            .build()
            .map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))?;
        Ok(GifOutput {
            bytes: gif.bytes,
            packed_size: self.packed_size,
            frame_count: gif.frame_count,
            canvas: gif.canvas,
        })
    }
}

#[wasm_bindgen]
pub fn encode_gif(
    data: &[u8],
    chunk_len: usize,
    fps: u32,
    size: u32,
    redundancy: f64,
    compat: bool,
) -> Result<GifOutput, wasm_bindgen::JsError> {
    let mut job = GifJob::new(data, chunk_len, fps, size, redundancy, compat)?;
    job.step(usize::MAX)?;
    job.finish()
}

/// Result of scanning a single video frame.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub struct ScanResult {
    /// Whether any QR code was detected and decoded in the image.
    pub qr_detected: bool,
    /// Whether this frame contributed a new symbol to the fountain decoder.
    pub new_frame: bool,
    /// Whether the transfer is now complete.
    pub completed: bool,
    /// Number of chunks received so far.
    pub received_chunks: usize,
    /// Total expected source chunks.
    pub total_chunks: usize,
    /// Bounding box of the QR code in the scanned image, all zeros when none was found.
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// State machine decoder for receiving animated QR frames over camera or stream.
#[wasm_bindgen]
pub struct WasmDecoder {
    inner: Decoder,
    reader: QrReader,
    compat: bool,
    last_qr_detected: bool,
    last_new_frame: bool,
}

#[wasm_bindgen]
impl WasmDecoder {
    #[wasm_bindgen(constructor)]
    pub fn new(compat: bool) -> Self {
        let scheme = if compat { Scheme::Compat } else { Scheme::Fast };
        Self {
            inner: Decoder::new(scheme),
            reader: QrReader::new(),
            compat,
            last_qr_detected: false,
            last_new_frame: false,
        }
    }

    /// Resets the decoder state to accept a new transfer.
    pub fn reset(&mut self) {
        let scheme = if self.compat { Scheme::Compat } else { Scheme::Fast };
        self.inner = Decoder::new(scheme);
        self.last_qr_detected = false;
        self.last_new_frame = false;
    }

    /// Feeds a raw txqr frame directly. Returns true if decode completed.
    pub fn add_frame(&mut self, frame: &[u8]) -> Result<bool, wasm_bindgen::JsError> {
        let prev_received = self.inner.received_chunks();
        let completed = self
            .inner
            .add_frame(frame)
            .map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))?;
        self.last_new_frame = self.inner.received_chunks() > prev_received || completed;
        self.last_qr_detected = true;
        Ok(completed)
    }

    /// Scans an RGBA image buffer (from canvas/video), extracts QR code, and feeds to decoder.
    /// Returns ScanResult with status.
    pub fn scan_frame(
        &mut self,
        rgba: &[u8],
        width: u32,
        height: u32,
    ) -> Result<ScanResult, wasm_bindgen::JsError> {
        if self.is_completed() {
            return Ok(self.idle_result(true));
        }

        if (width as usize) * (height as usize) * 4 != rgba.len() {
            return Err(wasm_bindgen::JsError::new(
                "RGBA buffer length does not match width * height * 4",
            ));
        }

        let gray = rgba_to_grayscale(rgba, width as usize, height as usize);
        let hit = self
            .reader
            .read(&gray, width as usize, height as usize);

        let Some(hit) = hit else {
            self.last_qr_detected = false;
            self.last_new_frame = false;
            return Ok(self.idle_result(false));
        };

        self.last_qr_detected = true;
        let prev_received = self.inner.received_chunks();
        // A frame whose QR decodes but whose payload is not a txqr symbol (another QR on
        // screen, a truncated frame) is a miss, not an error: keep scanning.
        let completed = match self.inner.add_frame(&hit.payload) {
            Ok(completed) => completed,
            Err(_) => {
                self.last_new_frame = false;
                return Ok(ScanResult {
                    qr_detected: true,
                    new_frame: false,
                    completed: false,
                    received_chunks: self.inner.received_chunks(),
                    total_chunks: self.inner.chunk_count(),
                    x: hit.x,
                    y: hit.y,
                    width: hit.width,
                    height: hit.height,
                });
            }
        };
        self.last_new_frame = self.inner.received_chunks() > prev_received || completed;

        Ok(ScanResult {
            qr_detected: true,
            new_frame: self.last_new_frame,
            completed,
            received_chunks: self.inner.received_chunks(),
            total_chunks: self.inner.chunk_count(),
            x: hit.x,
            y: hit.y,
            width: hit.width,
            height: hit.height,
        })
    }

    fn idle_result(&self, completed: bool) -> ScanResult {
        ScanResult {
            qr_detected: false,
            new_frame: false,
            completed,
            received_chunks: self.inner.received_chunks(),
            total_chunks: self.inner.chunk_count(),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        }
    }

    pub fn is_completed(&self) -> bool {
        self.inner.data().is_some()
    }

    pub fn total_chunks(&self) -> usize {
        self.inner.chunk_count()
    }

    pub fn received_chunks(&self) -> usize {
        self.inner.received_chunks()
    }

    pub fn progress(&self) -> f32 {
        let total = self.inner.chunk_count();
        if total == 0 {
            0.0
        } else {
            (self.inner.received_chunks() as f32 / total as f32).min(1.0)
        }
    }

    pub fn get_data(&self) -> Result<Option<Vec<u8>>, wasm_bindgen::JsError> {
        match self.inner.data() {
            Some(data) => unpack(data).map(Some),
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::AnimationDecoder;

    #[test]
    fn test_compat_encode_and_scan_flow() {
        // Let's test if ALL 2.0*k frames ALWAYS reach rank k, or if some fail!
        let mut failed = 0;
        let trials = 1000;
        for seed in 0..trials {
            // vary the size between 100 and 1500
            let size = 100 + (seed * 17) % 1400;
            let payload: Vec<u8> = (0..size).map(|i| ((i * 31 + seed) % 256) as u8).collect();
            let mut job = GifJob::new(&payload, 100, 5, 300, 0.5, true).expect("encode gif");
            job.step(usize::MAX).expect("step");

            let mut decoder = WasmDecoder::new(true);
            let mut done = false;
            for frame in &job.frames {
                if decoder.add_frame(frame).expect("add frame") {
                    done = true;
                    break;
                }
            }
            if !done {
                failed += 1;
                println!("Seed {seed} (size {size}, chunks={}): NEVER COMPLETED! received {} / {}",
                    decoder.total_chunks(), decoder.received_chunks(), decoder.total_chunks());
            }
        }
        println!("Tested {trials} transfers: {failed} failed ({}%)", failed * 100 / trials);
    }

    #[test]
    fn test_encode_and_scan_flow() {
        let payload = b"Hello from txqr air-gapped web transfer!";
        let gif = encode_gif(payload, 30, 5, 300, 0.5, false).expect("encode gif");
        assert!(!gif.bytes().is_empty());

        let mut decoder = WasmDecoder::new(false);
        let frames = image::codecs::gif::GifDecoder::new(std::io::Cursor::new(gif.bytes()))
            .expect("read gif")
            .into_frames()
            .collect_frames()
            .expect("collect frames");

        let mut done = false;
        for frame in frames {
            let rgba = frame.into_buffer();
            let (w, h) = (rgba.width(), rgba.height());
            let result = decoder.scan_frame(rgba.as_raw(), w, h).expect("scan frame");
            if result.qr_detected {
                // The page locks onto this box on the next frame, so it has to be inside the
                // image and roughly code-sized.
                assert!(result.width > 0 && result.height > 0, "empty box");
                assert!(result.x + result.width <= w && result.y + result.height <= h);
                assert!(result.width >= w / 2, "box {} too small for image {}", result.width, w);
            }
            if result.completed {
                done = true;
                break;
            }
        }

        assert!(done);
        assert_eq!(
            decoder.get_data().expect("decode payload").as_deref(),
            Some(&payload[..])
        );
    }

    /// Compression has to survive the whole pipe: pack -> GIF -> camera frames -> unpack.
    #[test]
    fn compressed_payload_survives_the_gif_round_trip() {
        let payload: Vec<u8> = b"the quick brown fox jumps over the lazy dog.
"
            .repeat(60)
            .to_vec();
        let gif = encode_gif(&payload, 300, 8, 300, 0.5, false).expect("encode gif");
        assert!(gif.packed_size() < payload.len(), "payload was not compressed");

        let mut decoder = WasmDecoder::new(false);
        let frames = image::codecs::gif::GifDecoder::new(std::io::Cursor::new(gif.bytes()))
            .expect("read gif")
            .into_frames()
            .collect_frames()
            .expect("collect frames");

        for frame in frames {
            let rgba = frame.into_buffer();
            let (w, h) = (rgba.width(), rgba.height());
            if decoder.scan_frame(rgba.as_raw(), w, h).expect("scan frame").completed {
                break;
            }
        }

        assert_eq!(
            decoder.get_data().expect("decode payload").as_deref(),
            Some(&payload[..])
        );
    }

    /// The short payload above is small enough that compression barely helps; this one is long
    /// and repetitive, which is the case compression is for.
    #[test]
    fn compresses_repetitive_payloads() {
        let data: Vec<u8> = b"txqr air-gap transfer, line after line.\n"
            .repeat(400)
            .to_vec();
        let packed = pack(&data).expect("pack");
        assert_eq!(&packed[..4], COMPRESSED_MAGIC);
        assert!(packed.len() * 4 < data.len(), "packed {} vs {} bytes", packed.len(), data.len());
        assert_eq!(unpack(&packed).expect("unpack"), data);
    }

    /// Already-compressed payloads must travel verbatim: the size check catches the ones that
    /// cannot shrink (JPEG, media, archives).
    #[test]
    fn leaves_compressed_payloads_alone() {
        let mut jpeg = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46];
        jpeg.extend((0..65536u32).map(pseudo_random_byte));
        assert_eq!(pack(&jpeg).expect("pack"), jpeg);
    }

    /// Random-looking bytes are recognised before deflate runs, not after it wastes time.
    #[test]
    fn detects_random_payloads_cheaply() {
        let random: Vec<u8> = (0..1_000_000u32).map(pseudo_random_byte).collect();
        assert!(looks_random(&random));

        let text = b"fn main() { println!(\"hello\"); }
".repeat(5000);
        assert!(!looks_random(&text));

        let packed = pack(&random).expect("pack");
        assert_eq!(packed.len(), random.len());
    }

    /// Uncompressed but incompressible data must never come out bigger than it went in.
    #[test]
    fn never_expands_a_payload() {
        let data: Vec<u8> = (0..8192u32).map(pseudo_random_byte).collect();
        let packed = pack(&data).expect("pack");
        assert!(packed.len() <= data.len(), "packed {} > {}", packed.len(), data.len());
        assert_eq!(unpack(&packed).expect("unpack"), data);
    }

    #[test]
    fn test_canvas_frame_rgba_output() {
        let payload = b"TxQR Canvas Test Payload";
        let mut job = GifJob::new(payload, 30, 5, 300, 0.5, false).expect("create job");
        assert!(job.total_frames() > 0);
        assert_eq!(job.encoded_frames(), 0);

        job.step(1).expect("step 1");
        assert_eq!(job.encoded_frames(), 1);

        let quiet_zone = 4;
        let dim = job.get_frame_dimension(0, quiet_zone).expect("dimension");
        let rgba = job.get_frame_rgba(0, quiet_zone).expect("rgba");
        assert_eq!(rgba.len(), (dim * dim * 4) as usize);

        // Border corners must be white (quiet zone)
        assert_eq!(&rgba[0..4], &[255, 255, 255, 255]);
        // There must be some dark pixels in the QR code
        assert!(rgba.chunks_exact(4).any(|p| p[0] == 0 && p[1] == 0 && p[2] == 0));
    }

    /// xorshift32: deterministic, and unstructured enough that no compressor can exploit it.
    fn pseudo_random_byte(i: u32) -> u8 {
        let mut x = i.wrapping_mul(2_654_435_761).wrapping_add(0x9E37_79B9) | 1;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        (x >> 7) as u8
    }
}
