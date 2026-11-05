import init, { init_panic_hook, GifJob, WasmDecoder } from './pkg/txqr_wasm.js';

let wasmLoaded = false;
let selectedPayload = null;
let currentFileName = 'txqr_data.bin';
let currentGifBlob = null;

// Camera / Scanning state
let mediaStream = null;
let isScanning = false;
let facingMode = 'environment';
let decoder = null;
let scanStartTime = 0;
let scanTimerInterval = null;
let scanThrottleTimer = 0;

// Audio context for completion chime
function playSuccessBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch (_) {}
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function startWasm() {
  const statusBadge = document.getElementById('wasm-status');
  try {
    await init();
    init_panic_hook();
    wasmLoaded = true;
    statusBadge.textContent = 'WASM 就绪';
    statusBadge.className = 'status-badge ready';
  } catch (err) {
    console.error('Failed to init WASM:', err);
    statusBadge.textContent = 'WASM 加载失败';
    statusBadge.className = 'status-badge error';
    statusBadge.title = String(err);
  }
}

// Tab Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(`tab-${btn.dataset.tab}`);
    if (target) target.classList.add('active');

    // If leaving receiver tab, pause camera
    if (btn.dataset.tab !== 'receiver' && isScanning) {
      stopCamera();
    }
  });
});

// Input Mode (File vs Text)
const inputModeRadios = document.querySelectorAll('input[name="input-mode"]');
const fileDropzone = document.getElementById('file-dropzone');
const textContainer = document.getElementById('text-input-container');
const fileInput = document.getElementById('file-input');
const textInput = document.getElementById('text-input');
const textBytesSpan = document.getElementById('text-bytes');
const fileInfo = document.getElementById('file-info');

inputModeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.value === 'file') {
      fileDropzone.classList.remove('hidden');
      textContainer.classList.add('hidden');
    } else {
      fileDropzone.classList.add('hidden');
      textContainer.classList.remove('hidden');
    }
  });
});

// File selection
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  currentFileName = file.name;
  const buffer = await file.arrayBuffer();
  selectedPayload = new Uint8Array(buffer);
  fileInfo.textContent = `已选择: ${file.name} (${formatBytes(selectedPayload.length)})`;
});

// Drag and drop
fileDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileDropzone.classList.add('dragover');
});
fileDropzone.addEventListener('dragleave', () => fileDropzone.classList.remove('dragover'));
fileDropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  fileDropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  currentFileName = file.name;
  const buffer = await file.arrayBuffer();
  selectedPayload = new Uint8Array(buffer);
  fileInfo.textContent = `已选择: ${file.name} (${formatBytes(selectedPayload.length)})`;
});

// Text Input
textInput.addEventListener('input', () => {
  const enc = new TextEncoder();
  selectedPayload = enc.encode(textInput.value);
  textBytesSpan.textContent = selectedPayload.length;
  currentFileName = 'message.txt';
});

// Generate & Playback QR
const btnGenerate = document.getElementById('btn-generate');
const senderOutput = document.getElementById('sender-output');
const qrCanvas = document.getElementById('qr-canvas');
const qrCtx = qrCanvas ? qrCanvas.getContext('2d') : null;
const statDataSize = document.getElementById('stat-data-size');
const statFrameCount = document.getElementById('stat-frame-count');
const statLoopTime = document.getElementById('stat-loop-time');
const btnDownloadGif = document.getElementById('btn-download-gif');
const btnFullscreen = document.getElementById('btn-fullscreen');
const genProgress = document.getElementById('gen-progress');
const genProgressBar = document.getElementById('gen-progress-bar');

let currentJob = null;
let playbackTimer = null;
let currentFrameIndex = 0;
let offscreenCanvas = null;
let offscreenCtx = null;

function renderFrameToCanvas(job, frameIndex, targetSize) {
  if (!job || !qrCtx) return;
  const dim = job.get_frame_dimension(frameIndex, 4);
  const scale = Math.max(1, Math.floor((targetSize || 640) / dim));
  const canvasSize = dim * scale;

  if (qrCanvas.width !== canvasSize || qrCanvas.height !== canvasSize) {
    qrCanvas.width = canvasSize;
    qrCanvas.height = canvasSize;
    qrCanvas.style.width = `${canvasSize}px`;
  }

  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas');
    offscreenCtx = offscreenCanvas.getContext('2d');
  }
  if (offscreenCanvas.width !== dim || offscreenCanvas.height !== dim) {
    offscreenCanvas.width = dim;
    offscreenCanvas.height = dim;
  }

  const rgba = job.get_frame_rgba(frameIndex, 4);
  const imgData = new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), dim, dim);
  offscreenCtx.putImageData(imgData, 0, 0);

  qrCtx.imageSmoothingEnabled = false;
  qrCtx.drawImage(offscreenCanvas, 0, 0, canvasSize, canvasSize);
}

function startPlayback(job, fps, targetSize) {
  if (playbackTimer) {
    clearInterval(playbackTimer);
    playbackTimer = null;
  }
  currentFrameIndex = 0;
  renderFrameToCanvas(job, 0, targetSize);
  const intervalMs = Math.max(20, Math.round(1000 / fps));
  playbackTimer = setInterval(() => {
    const ready = job.encoded_frames();
    if (ready > 0) {
      currentFrameIndex = (currentFrameIndex + 1) % ready;
      renderFrameToCanvas(job, currentFrameIndex, targetSize);
    }
  }, intervalMs);
}

btnGenerate.addEventListener('click', async () => {
  if (!wasmLoaded) {
    alert('WASM 模块尚未就绪，请稍候');
    return;
  }

  // Get current active mode payload
  const currentMode = document.querySelector('input[name="input-mode"]:checked').value;
  if (currentMode === 'text') {
    selectedPayload = new TextEncoder().encode(textInput.value);
  }

  if (!selectedPayload || selectedPayload.length === 0) {
    alert('请先选择文件或输入待传输的文本内容');
    return;
  }

  const chunkLen = parseInt(document.getElementById('cfg-chunk').value) || 100;
  const fps = parseInt(document.getElementById('cfg-fps').value) || 5;
  const size = parseInt(document.getElementById('cfg-size').value) || 640;
  const redundancy = parseFloat(document.getElementById('cfg-redundancy').value) || 0.5;
  const compat = document.getElementById('cfg-scheme').value === 'compat';

  btnGenerate.disabled = true;
  btnGenerate.textContent = '正在准备数据...';
  genProgress.classList.remove('hidden');
  genProgressBar.style.width = '0%';

  try {
    await new Promise(r => setTimeout(r, 10));

    const startTime = performance.now();
    const job = new GifJob(selectedPayload, chunkLen, fps, size, redundancy, compat);
    currentJob = job;
    currentGifBlob = null;

    const packedSize = job.packed_size();
    const totalFrames = job.total_frames();
    const loopTime = (totalFrames / fps).toFixed(1);

    statDataSize.textContent = packedSize < selectedPayload.length
      ? `${formatBytes(selectedPayload.length)} → ${formatBytes(packedSize)} (压缩 ${(selectedPayload.length / packedSize).toFixed(1)}×)`
      : `${formatBytes(selectedPayload.length)} (未压缩)`;
    statFrameCount.textContent = `${totalFrames} 帧`;
    statLoopTime.textContent = `${loopTime} 秒`;

    senderOutput.classList.remove('hidden');
    senderOutput.scrollIntoView({ behavior: 'smooth' });

    // Step first frame and immediately start real-time canvas playback at target size
    job.step(1);
    startPlayback(job, fps, size);

    // Compute remaining frames in background chunks without blocking UI
    let done = job.encoded_frames();
    while (done < totalFrames) {
      done = job.step(25);
      genProgressBar.style.width = `${(done / totalFrames * 100).toFixed(1)}%`;
      btnGenerate.textContent = `编码中 ${done} / ${totalFrames}`;
      await new Promise(r => setTimeout(r, 0));
    }

    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    statDataSize.textContent += `, 用时 ${duration}s`;
    genProgressBar.style.width = '100%';
  } catch (err) {
    alert('生成失败: ' + err);
  } finally {
    genProgress.classList.add('hidden');
    btnGenerate.disabled = false;
    btnGenerate.textContent = '生成动态二维码 GIF';
  }
});

btnDownloadGif.addEventListener('click', async () => {
  if (!currentJob) return;

  if (currentGifBlob) {
    downloadBlob(currentGifBlob);
    return;
  }

  const originalText = btnDownloadGif.textContent;
  btnDownloadGif.disabled = true;
  btnDownloadGif.textContent = '正在生成 GIF 文件...';

  try {
    await new Promise(r => setTimeout(r, 20));
    if (currentJob.encoded_frames() < currentJob.total_frames()) {
      currentJob.step(currentJob.total_frames());
    }
    const gif = currentJob.finish();
    currentGifBlob = new Blob([gif.bytes()], { type: 'image/gif' });
    downloadBlob(currentGifBlob);
  } catch (err) {
    alert('GIF 生成失败: ' + err);
  } finally {
    btnDownloadGif.disabled = false;
    btnDownloadGif.textContent = originalText;
  }
});

function downloadBlob(blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `txqr_${Date.now()}.gif`;
  a.click();
}

btnFullscreen.addEventListener('click', () => {
  const elem = document.getElementById('gif-fullscreen-wrapper');
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  }
});

// ==================== RECEIVER (CAMERA SCANNER) ====================
const btnToggleCamera = document.getElementById('btn-toggle-camera');
const btnSwitchCamera = document.getElementById('btn-switch-camera');
const cameraVideo = document.getElementById('camera-video');
const cameraCanvas = document.getElementById('camera-canvas');
const cameraViewport = document.querySelector('.camera-viewport');
const trackBoxEl = document.getElementById('track-box');
const cameraHint = document.getElementById('camera-hint');
const scanPulse = document.getElementById('scan-pulse');
const scanStatusText = document.getElementById('scan-status-text');
const progressBar = document.getElementById('progress-bar');
const statRecvChunks = document.getElementById('stat-recv-chunks');
const statRecvPercent = document.getElementById('stat-recv-percent');
const statScanTimer = document.getElementById('stat-scan-timer');
const statScanPerf = document.getElementById('stat-scan-perf');
const decodeResultBox = document.getElementById('decode-result-box');
const resultTextPreview = document.getElementById('result-text-preview');
const resultImage = document.getElementById('result-image');
const btnDownloadResult = document.getElementById('btn-download-result');
const btnCopyResult = document.getElementById('btn-copy-result');
const btnScanAgain = document.getElementById('btn-scan-again');

let recoveredPayload = null;
let recoveredType = null; // MIME type when the payload turned out to be an image
let frameCtx = null;
let trackedBox = null; // QR bounds in video pixels, once a frame has been decoded
let missStreak = 0;
// Rolling scan metrics, shown in the UI so slow phones can be diagnosed from the screen
const scanStats = { count: 0, hits: 0, ms: 0 };

const MAX_DECODE_EDGE = 640; // decode size cap
const LOCK_MARGIN = 1.4; // crop this much wider than the tracked QR, so slight wobble still fits
const MIN_CROP = 160; // px; below this a QR cannot be read anyway
const UNLOCK_AFTER = 8; // frames without a hit before falling back to the full frame
function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

// The transfer carries raw bytes with no filename, so the type is read from the magic bytes.
function sniffImageType(b) {
  const at = (...sig) => b.length > sig.length && sig.every((v, i) => b[i] === v);
  if (at(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (at(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (at(0x42, 0x4d)) return 'image/bmp';
  return null;
}

// Draws the detected QR's box on the preview. The video is object-fit: cover in a square
// viewport, so the visible area is the video's centre square scaled to the viewport width.
function showTrackBox(box, vw, vh) {
  const side = Math.min(vw, vh);
  const k = (cameraViewport.clientWidth || side) / side;
  trackBoxEl.style.left = `${(box.x - (vw - side) / 2) * k}px`;
  trackBoxEl.style.top = `${(box.y - (vh - side) / 2) * k}px`;
  trackBoxEl.style.width = `${box.width * k}px`;
  trackBoxEl.style.height = `${box.height * k}px`;
}

// Back to the aiming position (the 15%/70% frame from CSS) when there is nothing tracked.
function resetTrackBox() {
  trackBoxEl.style.left = '';
  trackBoxEl.style.top = '';
  trackBoxEl.style.width = '';
  trackBoxEl.style.height = '';
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('当前浏览器或环境不支持访问摄像头 (注意: 需要 HTTPS 或 localhost)');
    return;
  }

  // No decoder without WASM: without this the throw lands in the camera catch below
  if (!wasmLoaded) {
    await startWasm();
    if (!wasmLoaded) {
      alert('WASM 解码模块加载失败，无法扫描。请检查网络后刷新页面。');
      return;
    }
  }

  try {
    cameraHint.textContent = '正在启动相机...';
    const constraints = {
      video: {
        facingMode: { ideal: facingMode },
        // Ask for more pixels than we decode: the QR needs them, not the whole frame
        width: { ideal: 1280 },
        height: { ideal: 720 },
        focusMode: { ideal: 'continuous' }
      },
      audio: false
    };

    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    cameraVideo.srcObject = mediaStream;
    await cameraVideo.play();

    isScanning = true;
    btnToggleCamera.textContent = '停止摄像头';
    btnSwitchCamera.disabled = false;
    cameraHint.textContent = '对准动态二维码取景框';

    initDecoder();
    startScanTimer();
    requestAnimationFrame(scanLoop);
  } catch (err) {
    console.error('Camera access error:', err);
    cameraHint.textContent = '无法打开摄像头: ' + err.message;
    alert('无法打开摄像头: ' + err.message + '\n请确认已授予相机权限并在 HTTPS 环境下运行');
  }
}

function stopCamera() {
  isScanning = false;
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  btnToggleCamera.textContent = '开启摄像头';
  btnSwitchCamera.disabled = true;
  cameraHint.textContent = '摄像头已暂停';
  resetTrackBox();
  stopScanTimer();
}

function initDecoder() {
  // Auto-detect scheme on incoming frames (Fast vs Compat)
  decoder = new WasmDecoder();
  progressBar.style.width = '0%';
  statRecvChunks.textContent = '0 / 0';
  statRecvPercent.textContent = '0%';
  scanPulse.className = 'pulse-dot';
  scanStatusText.textContent = '扫描中，等待二维码...';
  decodeResultBox.classList.add('hidden');
  scanStats.count = 0;
  scanStats.hits = 0;
  scanStats.ms = 0;
  trackedBox = null;
  missStreak = 0;
  resetTrackBox();
  if (statScanPerf) statScanPerf.textContent = '-';
}

function startScanTimer() {
  scanStartTime = performance.now();
  if (scanTimerInterval) clearInterval(scanTimerInterval);
  scanTimerInterval = setInterval(() => {
    if (!isScanning) return;
    const seconds = (performance.now() - scanStartTime) / 1000;
    statScanTimer.textContent = `${seconds.toFixed(1)}s`;
    if (statScanPerf && scanStats.count > 0) {
      const rate = (scanStats.count / seconds).toFixed(1);
      const hitRate = Math.round((scanStats.hits / scanStats.count) * 100);
      statScanPerf.textContent = `${rate}/s · 命中 ${hitRate}% · ${scanStats.ms.toFixed(0)}ms`;
    }
  }, 100);
}

function stopScanTimer() {
  if (scanTimerInterval) {
    clearInterval(scanTimerInterval);
    scanTimerInterval = null;
  }
}

// Scanning loop using canvas extraction and WASM decoder
function scanLoop(now) {
  if (!isScanning) return;

  // Throttle scan rate to ~30 fps (every ~33ms) to conserve CPU
  if (now - scanThrottleTimer > 33) {
    scanThrottleTimer = now;
    processCameraFrame();
  }

  requestAnimationFrame(scanLoop);
}

function processCameraFrame() {
  if (!cameraVideo.videoWidth || !cameraVideo.videoHeight || !decoder) return;

  // The video is shown with object-fit: cover in a square viewport, so only the centre
  // square is visible. Decoding the whole sensor frame wastes pixels on hidden area and
  // shrinks the QR — crop to what the user actually aims at.
  const vw = cameraVideo.videoWidth;
  const vh = cameraVideo.videoHeight;
  const side = Math.min(vw, vh);
  let sx = Math.round((vw - side) / 2);
  let sy = Math.round((vh - side) / 2);
  let sw = side;

  // Locked: decode just around where the QR was last seen, which is a fraction of the pixels
  // and keeps the code large in the image.
  if (trackedBox) {
    const want = Math.max(trackedBox.width, trackedBox.height) * LOCK_MARGIN;
    sw = Math.round(clamp(want, Math.min(MIN_CROP, side), side));
    sx = clamp(Math.round(trackedBox.x + trackedBox.width / 2 - sw / 2), 0, vw - sw);
    sy = clamp(Math.round(trackedBox.y + trackedBox.height / 2 - sw / 2), 0, vh - sw);
  }

  const out = Math.min(MAX_DECODE_EDGE, sw);

  if (cameraCanvas.width !== out) {
    cameraCanvas.width = out;
    cameraCanvas.height = out;
    frameCtx = null; // resizing resets canvas state
  }
  if (!frameCtx) frameCtx = cameraCanvas.getContext('2d', { willReadFrequently: true });
  frameCtx.drawImage(cameraVideo, sx, sy, sw, sw, 0, 0, out, out);

  const imgData = frameCtx.getImageData(0, 0, out, out);
  const t0 = performance.now();

  try {
    const res = decoder.scan_frame(imgData.data, out, out);
    scanStats.count++;
    if (res.qr_detected) scanStats.hits++;
    scanStats.ms = scanStats.ms * 0.8 + (performance.now() - t0) * 0.2;

    if (res.qr_detected) {
      // Keep following the code: the box comes back in decode pixels, map it to video pixels.
      const k = sw / out;
      trackedBox = {
        x: sx + res.x * k,
        y: sy + res.y * k,
        width: res.width * k,
        height: res.height * k
      };
      missStreak = 0;
      showTrackBox(trackedBox, vw, vh);

      const scheme = decoder.detected_scheme();
      const schemeTag = scheme ? ` [${scheme === 'compat' ? 'Compat' : 'Fast'}]` : '';

      if (res.new_frame) {
        scanPulse.className = 'pulse-dot pulse-active';
        scanStatusText.textContent = `捕获新块: ${res.received_chunks} / ${res.total_chunks}`;
      } else {
        scanPulse.className = 'pulse-dot pulse-seen';
        scanStatusText.textContent = `已采集过该块，等待下一帧...`;
      }

      if (res.total_chunks > 0) {
        const percent = Math.min(100, Math.round((res.received_chunks / res.total_chunks) * 100));
        progressBar.style.width = `${percent}%`;
        statRecvChunks.textContent = `${res.received_chunks} / ${res.total_chunks}`;
        statRecvPercent.textContent = `${percent}%`;
      }
    } else {
      // Lost it (phone moved): widen back to the whole visible frame to re-acquire.
      if (trackedBox && ++missStreak > UNLOCK_AFTER) {
        trackedBox = null;
        missStreak = 0;
        resetTrackBox();
      }
      scanPulse.className = 'pulse-dot';
      scanStatusText.textContent = '未捕捉到二维码，请对准屏幕';
    }

    if (res.completed) {
      onTransferComplete();
    }
  } catch (err) {
    console.error('Scan error:', err);
  }
}

function onTransferComplete() {
  stopCamera();
  playSuccessBeep();
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100]);
  }

  try {
    recoveredPayload = decoder.get_data();
  } catch (err) {
    console.error('Payload unpack failed:', err);
    scanStatusText.textContent = '数据解压失败，请确认发送端与接收端配置文件一致';
    return;
  }
  if (!recoveredPayload) return;
  const scheme = decoder.detected_scheme();
  const schemeLabel = scheme ? ` (${scheme === 'compat' ? 'Compat' : 'Fast'} 模式)` : '';
  scanStatusText.textContent = `还原完毕！${schemeLabel}`;
  scanPulse.className = 'pulse-dot pulse-active';
  progressBar.style.width = '100%';
  statRecvPercent.textContent = '100%';

  // An image payload is shown inline; anything else is tried as UTF-8 text, then raw bytes.
  recoveredType = sniffImageType(recoveredPayload);
  if (recoveredType) {
    if (resultImage.src) URL.revokeObjectURL(resultImage.src);
    resultImage.src = URL.createObjectURL(new Blob([recoveredPayload], { type: recoveredType }));
    resultImage.classList.remove('hidden');
    resultTextPreview.textContent = `图片 ${recoveredType} (${formatBytes(recoveredPayload.length)})`;
    resultTextPreview.classList.remove('hidden');
    btnCopyResult.classList.add('hidden');
  } else {
    resultImage.classList.add('hidden');
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(recoveredPayload);
      resultTextPreview.textContent = text;
      resultTextPreview.classList.remove('hidden');
      btnCopyResult.classList.remove('hidden');
    } catch (_) {
      // Binary payload
      resultTextPreview.textContent = `二进制文件数据 (${formatBytes(recoveredPayload.length)})`;
      resultTextPreview.classList.remove('hidden');
      btnCopyResult.classList.add('hidden');
    }
  }

  decodeResultBox.classList.remove('hidden');
  decodeResultBox.scrollIntoView({ behavior: 'smooth' });
}

btnToggleCamera.addEventListener('click', () => {
  if (isScanning) {
    stopCamera();
  } else {
    startCamera();
  }
});

btnSwitchCamera.addEventListener('click', () => {
  facingMode = (facingMode === 'environment') ? 'user' : 'environment';
  if (isScanning) {
    stopCamera();
    startCamera();
  }
});

btnCopyResult.addEventListener('click', async () => {
  if (!resultTextPreview.textContent) return;
  await navigator.clipboard.writeText(resultTextPreview.textContent);
  btnCopyResult.textContent = '已复制';
  setTimeout(() => btnCopyResult.textContent = '复制文本', 2000);
});

btnDownloadResult.addEventListener('click', () => {
  if (!recoveredPayload) return;
  const blob = new Blob([recoveredPayload], { type: recoveredType || 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `restored_${Date.now()}${recoveredType ? '.' + recoveredType.split('/')[1] : '.bin'}`;
  a.click();
  URL.revokeObjectURL(a.href);
});

btnScanAgain.addEventListener('click', () => {
  decodeResultBox.classList.add('hidden');
  resultImage.classList.add('hidden');
  if (resultImage.src) {
    URL.revokeObjectURL(resultImage.src);
    resultImage.removeAttribute('src');
  }
  initDecoder();
  startCamera();
});

// Initialize on page load
startWasm();
