const N = 1024;
const ITER = 1000;

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
for (i = 0; i < numWorkers; i++) {
    workerPool.push(new Worker("worker.js"));
}

console.log("cross-origin isolated: ", window.crossOriginIsolated);
console.log("secure context:", window.isSecureContext);

// color randomization parameters
paramGen = () => 15 * (1 + 2 * Math.random());
const [fRed, fGreen, fBlue] = [paramGen(), paramGen(), paramGen()];

// history navigation
navigateTo = rect => {
    history.pushState(rect, "Mandelbrot");
    mandel(rect);
}
window.onpopstate = ev => mandel(ev.state);

// initial frame
window.onload = () => {
    let [x0, y0] = [-2, -1.5];
    let [x1, y1] = [1, 1.5];
    navigateTo([x0, y0, x1, y1]);
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
    canvas.onmousedown = ev => {
        selPos = [ev.offsetX, ev.offsetY];
        selDiv.classList.add("enabled");
        selDiv.style.left = ev.offsetX + canvas.offsetLeft;
        selDiv.style.top = ev.offsetY + canvas.offsetTop;
        selDiv.style.width = 0;
        selDiv.style.height = 0;
    };
    container.onmousemove = ev => {
        let [x, y] = coords(ev.offsetX, ev.offsetY);
        posDiv.textContent = roundCoord(x) + " " + (y > 0 ? "+" : "-") + " " + roundCoord(Math.abs(y)) + "i";
        if (selPos) {
            let [left, top] = selPos;
            let right = ev.offsetX + ev.target.offsetLeft;
            let bottom = ev.offsetY + ev.target.offsetTop;
            let size = Math.min(right - left, bottom - top);
            selDiv.style.width = size;
            selDiv.style.height = size;
        }
    };
    container.onmouseup = ev => {
        let rect = selDiv.getBoundingClientRect();
        let [x0, y0] = coords(rect.left + window.scrollX - canvas.offsetLeft, rect.top + window.scrollY - canvas.offsetTop);
        let [x1, y1] = coords(rect.right + window.scrollX - canvas.offsetLeft + window.scrollX, rect.bottom + window.scrollY - canvas.offsetTop);
        selDiv.classList.remove("enabled");
        selPos = null;
        navigateTo([x0, y0, x1, y1]);
    };

    let sharedBuffer = new SharedArrayBuffer(4*N*N);

    let paint = () => {
        // Using a SharedArrayBuffer as ImageData array is not allowed, so we need to make a copy
        let data = new Uint8ClampedArray(sharedBuffer);
        let arr = new Uint8ClampedArray(data.length);
        arr.set(data);
        let imgData = new ImageData(arr, N);
        ctx.putImageData(imgData, 0, 0);
    };

    let done = 0;
    const startTime = performance.now();
    workerPool.forEach((worker, i) => {
        worker.onmessage = e => {
            let [taskId, elapsed] = e.data;
            console.log("[t=", Math.round(performance.now() - startTime), "] worker", i,
                ", task", taskId, " done in", Math.round(elapsed), "ms");
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
    for (i = 0; i < numChunks; i++) {
        let workerIdx = i % numWorkers;
        let worker = workerPool[workerIdx];
        const buf = new Uint8ClampedArray(sharedBuffer, i * bytesPerChunk, bytesPerChunk);
        worker.postMessage([i, buf, N, rowsPerChunk, x0, y, dx, dy, ITER, fRed, fGreen, fBlue]);
        y -= rowsPerChunk * dy;
    }
};

roundCoord = x => Math.round(x * 1000) / 1000;
