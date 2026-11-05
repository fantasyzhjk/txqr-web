use quircs::Quirc;
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
        // Compression lives in the library; Compat ignores the flag and stays Go-compatible.
        let (frames, packed_size) = Encoder::new(chunk_len, scheme, redundancy)
            .compressed(true)
            .encode_with_len(data)
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
    pub fn get_frame_dimension(
        &self,
        index: usize,
        quiet_zone: u32,
    ) -> Result<u32, wasm_bindgen::JsError> {
        let matrix = self
            .matrices
            .get(index)
            .ok_or_else(|| wasm_bindgen::JsError::new("frame index out of bounds"))?;
        Ok(matrix.len() as u32 + quiet_zone * 2)
    }

    /// Flat RGBA pixel buffer (1 module = 1 pixel) for frame `index`, with `quiet_zone` border.
    /// Ready for direct painting via `ImageData` onto an HTML5 canvas.
    pub fn get_frame_rgba(
        &self,
        index: usize,
        quiet_zone: u32,
    ) -> Result<Vec<u8>, wasm_bindgen::JsError> {
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

/// Guesses the scheme of the first frame from its declared `chunk_len` and payload, because the
/// frame header does not say which scheme it belongs to.
///
/// * A Fast frame always carries exactly one RaptorQ symbol, and RaptorQ aligns symbol sizes to
///   8 bytes, so `chunk_len % 8 != 0` or `payload.len() != chunk_len` means Compat.
/// * A Compat payload is base64 text *until* blocks get XORed together, after which its bytes can
///   be anything — so the alphabet check below only decides when it matches.
///
/// A Fast symbol that happens to be all base64 characters is the one case this gets wrong; the
/// caller's alternative would be to buffer the transfer and retry under the other scheme.
/// Guesses the scheme of the first frame; the header does not say which one it belongs to.
///
/// Compat splits the base64 text into `ceil(total/chunk_len)` near-equal blocks, so a Compat
/// frame carries `floor(total/count)` or `ceil(total/count)` bytes — which is usually less than
/// the declared `chunk_len`. A Fast frame carries exactly one RaptorQ symbol, so its payload is
/// exactly `chunk_len` bytes.
///
/// When both lengths fit, only the bytes are left as a hint: untouched Compat blocks are base64
/// text, but XORed ones are not, and a Fast symbol can be text too. That is the one ambiguous
/// case, and it needs a transfer buffered under both schemes to resolve.
fn looks_like_compat(chunk_len: usize, total: usize, payload: &[u8]) -> bool {
    let count = total.div_ceil(chunk_len.max(1)).max(1);
    let block_fits = payload.len() == total.div_ceil(count) || payload.len() == total / count;
    let symbol_fits = payload.len() == chunk_len;
    if block_fits != symbol_fits {
        return block_fits;
    }

    payload
        .iter()
        .all(|&b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/' || b == b'=')
}

/// State machine decoder for receiving animated QR frames over camera or stream.
#[wasm_bindgen]
pub struct WasmDecoder {
    inner: Option<Decoder>,
    forced_scheme: Option<Scheme>,
    detected_scheme: Option<Scheme>,
    reader: QrReader,
    last_qr_detected: bool,
    last_new_frame: bool,
}

#[wasm_bindgen]
impl WasmDecoder {
    #[wasm_bindgen(constructor)]
    pub fn new(compat: Option<bool>) -> Self {
        let forced_scheme = match compat {
            Some(true) => Some(Scheme::Compat),
            _ => None, // None or false defaults to auto-detection
        };
        Self::with_forced_scheme(forced_scheme)
    }

    pub fn auto() -> Self {
        Self::with_forced_scheme(None)
    }

    pub fn fast() -> Self {
        Self::with_forced_scheme(Some(Scheme::Fast))
    }

    pub fn compat() -> Self {
        Self::with_forced_scheme(Some(Scheme::Compat))
    }

    fn with_forced_scheme(forced_scheme: Option<Scheme>) -> Self {
        Self {
            inner: forced_scheme.map(Decoder::new),
            forced_scheme,
            detected_scheme: forced_scheme,
            reader: QrReader::new(),
            last_qr_detected: false,
            last_new_frame: false,
        }
    }

    /// Resets the decoder state to accept a new transfer.
    pub fn reset(&mut self) {
        self.inner = self.forced_scheme.map(Decoder::new);
        self.detected_scheme = self.forced_scheme;
        self.last_qr_detected = false;
        self.last_new_frame = false;
    }

    /// Returns `"fast"`, `"compat"`, or `""` if not yet detected.
    pub fn detected_scheme(&self) -> String {
        match self.detected_scheme {
            Some(Scheme::Fast) => "fast".to_string(),
            Some(Scheme::Compat) => "compat".to_string(),
            None => "".to_string(),
        }
    }

    fn ensure_decoder(
        &mut self,
        frame_bytes: &[u8],
    ) -> Result<&mut Decoder, wasm_bindgen::JsError> {
        if self.inner.is_none() {
            let scheme = match self.forced_scheme {
                Some(s) => s,
                None => {
                    let bar = frame_bytes
                        .iter()
                        .position(|&b| b == b'|')
                        .ok_or_else(|| wasm_bindgen::JsError::new("missing header delimiter"))?;
                    let header = std::str::from_utf8(&frame_bytes[..bar])
                        .map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))?;
                    let mut fields = header.split('/');
                    let chunk_len: usize = fields.nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
                    let total: usize = fields.next().and_then(|s| s.parse().ok()).unwrap_or(0);
                    let payload = &frame_bytes[bar + 1..];

                    if looks_like_compat(chunk_len, total, payload) {
                        Scheme::Compat
                    } else {
                        Scheme::Fast
                    }
                }
            };
            self.detected_scheme = Some(scheme);
            self.inner = Some(Decoder::new(scheme));
        }
        Ok(self.inner.as_mut().unwrap())
    }

    /// Feeds a raw txqr frame directly. Returns true if decode completed.
    pub fn add_frame(&mut self, frame: &[u8]) -> Result<bool, wasm_bindgen::JsError> {
        let decoder = self.ensure_decoder(frame)?;
        let prev_received = decoder.received_chunks();
        let completed = decoder
            .add_frame(frame)
            .map_err(|e| wasm_bindgen::JsError::new(&e.to_string()))?;
        self.last_new_frame = decoder.received_chunks() > prev_received || completed;
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
        let hit = self.reader.read(&gray, width as usize, height as usize);

        let Some(hit) = hit else {
            self.last_qr_detected = false;
            self.last_new_frame = false;
            return Ok(self.idle_result(false));
        };

        self.last_qr_detected = true;
        let decoder = match self.ensure_decoder(&hit.payload) {
            Ok(d) => d,
            Err(_) => {
                self.last_new_frame = false;
                return Ok(self.idle_result(false));
            }
        };

        let prev_received = decoder.received_chunks();
        // A frame whose QR decodes but whose payload is not a txqr symbol (another QR on
        // screen, a truncated frame) is a miss, not an error: keep scanning.
        let completed = match decoder.add_frame(&hit.payload) {
            Ok(completed) => completed,
            Err(_) => {
                self.last_new_frame = false;
                return Ok(ScanResult {
                    qr_detected: true,
                    new_frame: false,
                    completed: false,
                    received_chunks: self.inner.as_ref().map_or(0, |d| d.received_chunks()),
                    total_chunks: self.inner.as_ref().map_or(0, |d| d.chunk_count()),
                    x: hit.x,
                    y: hit.y,
                    width: hit.width,
                    height: hit.height,
                });
            }
        };
        let inner = self.inner.as_ref().unwrap();
        self.last_new_frame = inner.received_chunks() > prev_received || completed;

        Ok(ScanResult {
            qr_detected: true,
            new_frame: self.last_new_frame,
            completed,
            received_chunks: inner.received_chunks(),
            total_chunks: inner.chunk_count(),
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
            received_chunks: self.inner.as_ref().map_or(0, |d| d.received_chunks()),
            total_chunks: self.inner.as_ref().map_or(0, |d| d.chunk_count()),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        }
    }

    pub fn is_completed(&self) -> bool {
        self.inner.as_ref().map_or(false, |d| d.data().is_some())
    }

    pub fn total_chunks(&self) -> usize {
        self.inner.as_ref().map_or(0, |d| d.chunk_count())
    }

    pub fn received_chunks(&self) -> usize {
        self.inner.as_ref().map_or(0, |d| d.received_chunks())
    }

    pub fn progress(&self) -> f32 {
        let Some(inner) = &self.inner else {
            return 0.0;
        };
        let total = inner.chunk_count();
        if total == 0 {
            0.0
        } else {
            (inner.received_chunks() as f32 / total as f32).min(1.0)
        }
    }

    pub fn get_data(&self) -> Result<Option<Vec<u8>>, wasm_bindgen::JsError> {
        // The library hands out the payload already decompressed.
        Ok(self
            .inner
            .as_ref()
            .and_then(|inner| inner.data())
            .map(<[u8]>::to_vec))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::AnimationDecoder;

    #[test]
    fn test_looks_like_compat() {
        for size in [5, 15, 50, 100, 250, 500, 1000, 5000] {
            let data = (0..size).map(|i| (i % 256) as u8).collect::<Vec<_>>();

            // Test Fast
            let fast_job = GifJob::new(&data, 100, 5, 300, 0.5, false).expect("fast job");
            for frame in &fast_job.frames {
                let bar = frame.iter().position(|&b| b == b'|').unwrap();
                let header = std::str::from_utf8(&frame[..bar]).unwrap();
                let mut fields = header.split('/');
                let chunk_len: usize = fields.nth(1).unwrap().parse().unwrap();
                let total: usize = fields.next().unwrap().parse().unwrap();
                let payload = &frame[bar + 1..];
                assert!(
                    !looks_like_compat(chunk_len, total, payload),
                    "Fast frame misclassified as Compat! size={size}, chunk_len={chunk_len}, payload_len={}",
                    payload.len()
                );
            }

            // Test Compat
            let compat_job = GifJob::new(&data, 100, 5, 300, 0.5, true).expect("compat job");
            for frame in &compat_job.frames {
                let bar = frame.iter().position(|&b| b == b'|').unwrap();
                let header = std::str::from_utf8(&frame[..bar]).unwrap();
                let mut fields = header.split('/');
                let chunk_len: usize = fields.nth(1).unwrap().parse().unwrap();
                let total: usize = fields.next().unwrap().parse().unwrap();
                let payload = &frame[bar + 1..];

                // A blend of several Compat blocks can be exactly as long as the budget and no
                // longer base64; a Fast symbol would look identical, so nothing decides it.
                let count = total.div_ceil(chunk_len.max(1)).max(1);
                let ambiguous = payload.len() == chunk_len
                    && (payload.len() == total.div_ceil(count) || payload.len() == total / count);
                let base64 = payload
                    .iter()
                    .all(|&b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/' || b == b'=');
                if ambiguous && !base64 {
                    continue;
                }

                assert!(
                    looks_like_compat(chunk_len, total, payload),
                    "Compat frame misclassified as Fast! size={size}, chunk_len={chunk_len}, payload_len={}",
                    payload.len()
                );
            }
        }
    }

    #[test]
    fn test_auto_decoder_handles_both_fast_and_compat() {
        let payload = b"Test auto-detecting scheme between Fast and Compat!";

        // 1. Auto-decoder scanning Fast frames:
        let fast_gif = encode_gif(payload, 30, 5, 300, 0.5, false).expect("fast gif");
        let mut auto_dec1 = WasmDecoder::auto();
        let frames = image::codecs::gif::GifDecoder::new(std::io::Cursor::new(fast_gif.bytes()))
            .expect("read gif")
            .into_frames()
            .collect_frames()
            .expect("collect frames");
        for frame in frames {
            let rgba = frame.into_buffer();
            let (w, h) = (rgba.width(), rgba.height());
            if auto_dec1
                .scan_frame(rgba.as_raw(), w, h)
                .expect("scan")
                .completed
            {
                break;
            }
        }
        assert!(auto_dec1.is_completed());
        assert_eq!(auto_dec1.detected_scheme(), "fast");
        assert_eq!(auto_dec1.get_data().unwrap().as_deref(), Some(&payload[..]));

        // 2. Auto-decoder scanning Compat frames:
        let compat_gif = encode_gif(payload, 30, 5, 300, 0.5, true).expect("compat gif");
        let mut auto_dec2 = WasmDecoder::auto();
        let frames2 = image::codecs::gif::GifDecoder::new(std::io::Cursor::new(compat_gif.bytes()))
            .expect("read gif")
            .into_frames()
            .collect_frames()
            .expect("collect frames");
        for frame in frames2 {
            let rgba = frame.into_buffer();
            let (w, h) = (rgba.width(), rgba.height());
            if auto_dec2
                .scan_frame(rgba.as_raw(), w, h)
                .expect("scan")
                .completed
            {
                break;
            }
        }
        assert!(auto_dec2.is_completed());
        assert_eq!(auto_dec2.detected_scheme(), "compat");
        assert_eq!(auto_dec2.get_data().unwrap().as_deref(), Some(&payload[..]));
    }

    #[test]
    fn test_encode_and_scan_flow() {
        let payload = b"Hello from txqr air-gapped web transfer!";
        let gif = encode_gif(payload, 30, 5, 300, 0.5, false).expect("encode gif");
        assert!(!gif.bytes().is_empty());

        let mut decoder = WasmDecoder::auto();
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
                assert!(
                    result.width >= w / 2,
                    "box {} too small for image {}",
                    result.width,
                    w
                );
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

    /// Compression has to survive the whole pipe: encode -> GIF -> camera frames -> decode.
    #[test]
    fn compressed_payload_survives_the_gif_round_trip() {
        let payload: Vec<u8> = b"the quick brown fox jumps over the lazy dog.
"
        .repeat(60)
        .to_vec();
        let gif = encode_gif(&payload, 300, 8, 300, 0.5, false).expect("encode gif");
        assert!(
            gif.packed_size() < payload.len(),
            "payload was not compressed"
        );

        let mut decoder = WasmDecoder::auto();
        let frames = image::codecs::gif::GifDecoder::new(std::io::Cursor::new(gif.bytes()))
            .expect("read gif")
            .into_frames()
            .collect_frames()
            .expect("collect frames");

        for frame in frames {
            let rgba = frame.into_buffer();
            let (w, h) = (rgba.width(), rgba.height());
            if decoder
                .scan_frame(rgba.as_raw(), w, h)
                .expect("scan frame")
                .completed
            {
                break;
            }
        }

        assert_eq!(
            decoder.get_data().expect("decode payload").as_deref(),
            Some(&payload[..])
        );
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
        assert!(
            rgba.chunks_exact(4)
                .any(|p| p[0] == 0 && p[1] == 0 && p[2] == 0)
        );
    }
}
