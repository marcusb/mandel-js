// feature detection
console.log("has SharedArrayBuffer:", window.SharedArrayBuffer !== undefined);
console.log("cross-origin isolated:", window.crossOriginIsolated);
console.log("secure context:", window.isSecureContext);
const hasSharedMem = window.crossOriginIsolated && window.SharedArrayBuffer !== undefined;

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
    for (i = 0; i < numWorkers; i++) {
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
    for (i = 0; i < ITER; i++) {
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
navigateTo = rect => {
    history.pushState(rect, "Mandelbrot");
    mandel(rect);
}
window.onpopstate = ev => mandel(ev.state);

// initial frame
window.onload = () => {
    const [x0, y0] = [-2, -1.5];
    const [x1, y1] = [1, 1.5];
    const wasmFile = 'mandel' + (hasSharedMem ? '-shmem' : '') + '.wasm';
    WebAssembly.compileStreaming(fetch(wasmFile))
        .then(mod => {
            initWorkers(mod);
            navigateTo([x0, y0, x1, y1]);
        });
};

mandel = rect => {
    let [x0, y0, x1, y1] = rect;
    const canvas = document.getElementById('canvas');
    const posDiv = document.getElementById('pos');
    const selDiv = document.getElementById('sel');
    const container = document.getElementById('container');
    const ctx = canvas.getContext('2d');

    const dx = (x1 - x0)/N;
    const dy = (y1 - y0)/N;

    coords = (x, y) => [x0 + x * dx, y1 - y * dy];

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

    let paint = () => {
        let imgData = new ImageData(N, N);
        imgData.data.set(imgBuffer);
        ctx.putImageData(imgData, 0, 0);
    };

    let done = 0;
    const startTime = performance.now();
    workerPool.forEach((worker, i) => {
        worker.onmessage = e => {
            let [taskId, buf, ofs, elapsed] = e.data;
            console.log("[t=", Math.round(performance.now() - startTime), "] worker", i,
                ", task", taskId, " done in", Math.round(elapsed), "ms");
            if (buf) {
                // we are not using shared memory, so copy the output into the image buffer
                const data = new Uint8ClampedArray(buf, paletteSize, bytesPerChunk);
                imgBuffer.set(data, ofs - paletteSize);
            }
            done++;
            if (done == numChunks) {
                // all tasks have finished, draw the image
                const t = performance.now();
                console.log("computed in " + (t - startTime) / 1000 + "s");
                paint();
            }
        }
    });
    let y = y1;
    let ofs = paletteSize;
    for (i = 0; i < numChunks; i++) {
        let workerIdx = i % numWorkers;
        let worker = workerPool[workerIdx];
        worker.postMessage(['calc', [i, ofs, N, rowsPerChunk, x0, y, dx, dy, ITER]]);
        y -= rowsPerChunk * dy;
        ofs += bytesPerChunk;
    }
};

roundCoord = x => Math.round(x * 1000) / 1000;
