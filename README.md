# txqr-web

基于 WebAssembly (WASM) 的纯前端动态二维码（txqr）发送与移动端扫描还原系统。

- **在线演示**：<https://fantasyzhjk.github.io/txqr-web/>

- **发送端 (Sender)**：支持拖入文件或输入文本，Fast 模式下先用 Deflate (level 9) 压缩（压不动或本身就是已压缩格式时自动跳过），再用 RaptorQ (RFC 6330) 喷泉码切片编码，生成循环播放的动画 GIF。Compat 模式（兼容 Go 版接收端）从不压缩，保证线上字节与 Go 编码器一致。
- **接收端 (Receiver)**：支持手机或电脑浏览器直接调用摄像头实时捕获屏幕上的二维码，WASM 高速解码并重组文件，零后端、零数据外泄。

## 目录结构

```text
txqr-web/
├── wasm/          # Rust WebAssembly 桥接库 (引用 txqr-rs 核心算法)
│   ├── Cargo.toml
│   └── src/
└── www/           # 原生极简静态网页
    ├── index.html # 前端页面
    ├── style.css  # 响应式样式（适配手机竖屏与 PC）
    ├── app.js     # 相机调度与 WASM 交互
    └── pkg/       # wasm-pack 编译生成的 WASM 产物
```

## 快速运行

进入 `www` 目录启动任意静态 HTTP 服务（注意：手机浏览器调用摄像头需要 `https` 或 `localhost` 环境）：

### 1. 本地电脑测试 (localhost)

```bash
cd www
npx serve .
# 或者
python -m http.server 8080
```

打开浏览器访问 `http://localhost:8080` 即可。

### 2. 手机扫描电脑屏幕 (局域网 HTTPS 测试)

由于现代移动端浏览器出于安全策略，仅在 HTTPS 或 localhost 允许调用摄像头：

使用包含 HTTPS 支持的简易工具（例如 `caddy` 或 `mkcert`，或使用手机局域网调试工具 / ngrok / Cloudflare Tunnel）：

```bash
# 例如使用 caddy 自动签发局域网证书：
caddy file-server --listen :8443 --tls internal --root ./www
```

手机连接同一局域网 WiFi，打开 `https://<你的电脑内网IP>:8443` 即可扫码接收。

## 重新构建 WASM

若修改了 `wasm/src/` 中的代码，可执行：

```bash
cd wasm
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir ../www/pkg --out-name txqr_wasm   target/wasm32-unknown-unknown/release/txqr_wasm.wasm
```

（`wasm-pack` 亦可，本机未安装时用上面两条命令等价。）
