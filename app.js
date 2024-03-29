// feature detection
console.log("has SharedArrayBuffer:", window.SharedArrayBuffer !== undefined);
console.log("cross-origin isolated:", window.crossOriginIsolated);
console.log("secure context:", window.isSecureContext);
const hasSharedMem = window.crossOriginIsolated && window.SharedArrayBuffer !== undefined;

const simdModule = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60,
    0x00, 0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00,
    0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b
]);
const relaxedSimdModule = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60,
    0x00, 0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x0f, 0x01, 0x0d, 0x00,
    0x41, 0x01, 0xfd, 0x0f, 0x41, 0x02, 0xfd, 0x0f, 0xfd, 0x80, 0x02, 0x0b
]);
const hasSimd = WebAssembly.validate(simdModule);
const hasRelaxedSimd = WebAssembly.validate(relaxedSimdModule);
console.log("has SIMD:", hasSimd);
console.log("has Relaxed SIMD:", hasRelaxedSimd);

const N = 1024;
const ITER = 1000;

const paletteSize = 4 * (ITER + 1);
const imgSize = 4 * N * N;
// image buffer holds the palette and the image data
const memorySize = paletteSize + imgSize;
const pages = Math.ceil(memorySize / (64 * 1024));
const memory = new WebAssembly.Memory({initial: pages, maximum: pages, shared: hasSharedMem});
const palette = new Uint8ClampedArray(memory.buffer, 0, paletteSize);
const imgBuffer = new Uint8ClampedArray(memory.buffer, paletteSize, imgSize);

// create the thread pool
const numWorkers = navigator.hardwareConcurrency || 4;
// We divide the work into tasks by chunks, which are horizontal bands, for
// concurrent processing. The black parts take the most computation time,
// so to decrease variance in load distribution between threads (and avoid
// waiting for slow tasks), we use more chunks than workers, and portion
// them out to workers in an interleaved fashion.
const numChunks = Math.max(numWorkers * numWorkers, 64);
const rowsPerChunk = N / numChunks;
const bytesPerChunk = 4 * N * rowsPerChunk;
const workerPool = [];

let initWorkers = wasmModule => {
    for (let i = 0; i < numWorkers; i++) {
        let worker = new Worker("worker.js");
        worker.postMessage(['init', [wasmModule, hasSharedMem || palette, hasSharedMem && memory, bytesPerChunk]]);
        workerPool.push(worker);
    }
}

// color palette randomization
(function initPalette() {
    // here is one 4-byte entry for each possible iteration value (r, g, b, alpha).
    let paramGen = () => 15 * (1 + 2 * Math.random());
    const [fRed, fGreen, fBlue] = [paramGen(), paramGen(), paramGen()];
    let ofs = 0;
    let d = 2 / ITER;
    let c = -1;
    for (let i = 0; i < ITER; i++) {
        palette[ofs++] = Math.sin(c * fRed) * 128 + 127;
        palette[ofs++] = Math.sin(c * fGreen) * 128 + 127;
        palette[ofs++] = Math.sin(c * fBlue) * 128 + 127;
        palette[ofs++] = 0xff;
        c += d;
    }
    // last entry for black (i=ITER)
    palette[ofs++] = 0;
    palette[ofs++] = 0;
    palette[ofs++] = 0;
    palette[ofs++] = 0xff;
})();

// history navigation
window.navigateTo = rect => {
    history.pushState(rect, "Mandelbrot");
    mandel(rect);
};
window.onpopstate = ev => ev.state && mandel(ev.state);

// run a performance benchmark
window.benchmark = rect => {
    const warmupRounds = 5;
    const perfRounds = 20;

    let runPerf = n => {
        return new Promise(done => {
            const times = [];
            let loop = i => {
                if (i == 0) {
                    done(times);
                } else {
                    const startRound = performance.now();
                    compute(rect).then(() => {
                        const elapsed = performance.now() - startRound;
                        times.push(elapsed);
                        console.log("round", i, "time", Math.round(elapsed), "ms");
                        loop(i-1);
                    });
                }
            };
            loop(n);
        });
    };

    runPerf(warmupRounds)
        .then(() => runPerf(perfRounds))
        .then(times => {
            const n = times.length;
            const mean = times.reduce((acc, val) => acc + val, 0) / n;
            const stddev = Math.sqrt(times.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n);
            console.log("n=", perfRounds, "mean=", Math.round(mean), "ms", "stddev=", Math.round(stddev), "ms");
        })
        .then(paint);
};

// initial frame
window.onload = () => {
    const [x0, y0] = [-2, -1.5];
    const [x1, y1] = [1, 1.5];
    const suffix = hasSharedMem ? (
        hasRelaxedSimd ? "-relaxed-simd" : (hasSimd ? "-simd" : "-shmem")) : "";
    const wasmFile = `mandel${suffix}.wasm`
    WebAssembly.compileStreaming(fetch(wasmFile))
        .then(mod => {
            initWorkers(mod);
            if (document.location.hash == '#perf') {
                // append "#perf" to URL to run benchmark
                benchmark([x0, y0, x1, y1]);
            } else {
                navigateTo([x0, y0, x1, y1]);
            }
        });
};

window.mandel = rect => {
    let [x0, y0, x1, y1] = rect;
    const canvas = document.getElementById('canvas');
    const posDiv = document.getElementById('pos');
    const selDiv = document.getElementById('sel');
    const container = document.getElementById('container');

    const dx = (x1 - x0)/N;
    const dy = (y1 - y0)/N;

    let coords = (x, y) => [x0 + x * dx, y1 - y * dy];

    // selection
    let selPos;
    let selectionStart = (x, y) => {
        // (x, y) relative to canvas
        selPos = [x, y];
        selDiv.classList.add("enabled");
        selDiv.style.left = x + canvas.offsetLeft;
        selDiv.style.top = y + canvas.offsetTop;
        selDiv.style.width = 0;
        selDiv.style.height = 0;
    };
    let selectionMove = (x, y) => {
        let [a, b] = coords(x, y);
        posDiv.textContent = roundCoord(a) + " " + (b > 0 ? "+" : "-") + " " + roundCoord(Math.abs(b)) + "i";
        if (selPos) {
            let [left, top] = selPos;
            let size = Math.min(x - left, y - top);
            selDiv.style.width = size;
            selDiv.style.height = size;
        }
    };
    let selectionEnd = () => {
        let rect = selDiv.getBoundingClientRect();
        let [x0, y0] = coords(rect.left + window.scrollX - canvas.offsetLeft, rect.bottom + window.scrollY - canvas.offsetTop);
        let [x1, y1] = coords(rect.right + window.scrollX - canvas.offsetLeft + window.scrollX, rect.top + window.scrollY - canvas.offsetTop);
        selDiv.classList.remove("enabled");
        selPos = null;
        navigateTo([x0, y0, x1, y1]);
    };
    canvas.onmousedown = ev => selectionStart(ev.offsetX, ev.offsetY);
    container.onmousemove = ev =>
        selectionMove(ev.offsetX + ev.target.offsetLeft - canvas.offsetLeft,
            ev.offsetY + ev.target.offsetTop - canvas.offsetTop);
    container.onmouseup = selectionEnd;
    canvas.ontouchstart = ev => {
        let t = ev.targetTouches[0];
        selectionStart(t.pageX - canvas.offsetLeft, t.pageY - canvas.offsetTop);
    };
    container.ontouchmove = ev => {
        let t = ev.targetTouches[0];
        selectionMove(t.pageX - canvas.offsetLeft, t.pageY - canvas.offsetTop);
    };
    container.ontouchend = selectionEnd;

    compute(rect).then(paint);
};

window.paint = () => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const imgData = new ImageData(N, N);
    imgData.data.set(imgBuffer);
    ctx.putImageData(imgData, 0, 0);
};

window.compute = rect => {
    return new Promise(resolve => {
        let [x0, y0, x1, y1] = rect;
        const dx = (x1 - x0) / N;
        const dy = (y1 - y0) / N;
        let done = 0;
        const startTime = performance.now();
        let y = y1;
        let ofs = paletteSize;
        let nextChunk = 0;
        let startTask = worker => {
            worker.postMessage(['calc', [nextChunk++, ofs, N, rowsPerChunk, x0, y, dx, dy, ITER]]);
            y -= rowsPerChunk * dy;
            ofs += bytesPerChunk;
        };
        workerPool.forEach(worker => {
            worker.onmessage = e => {
                let [taskId, buf, ofs, elapsed] = e.data;
                //console.log("[t=", Math.round(performance.now() - startTime), "] worker", i,
                //    ", task", taskId, " done in", Math.round(elapsed), "ms");
                if (buf) {
                    // we are not using shared memory, so copy the output into the image buffer
                    const data = new Uint8ClampedArray(buf, paletteSize, bytesPerChunk);
                    imgBuffer.set(data, ofs - paletteSize);
                }
                done++;
                if (done == numChunks) {
                    resolve();
                } else if (nextChunk < numChunks) {
                    startTask(worker);
                }
            }
            startTask(worker);
        });
    });
}

window.roundCoord = x => Math.round(x * 1000) / 1000;
