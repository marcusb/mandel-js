let wasmExports;
let nonSharedMem;
let paletteSize;

onmessage = e => {
    let [event, params] = e.data;
    if (event == 'init') {
        let [mod, palette, buf, imgBytes] = params;
        if (!buf) {
            // allocate the buffer, since we do not have shared memory
            paletteSize = palette.byteLength;
            const pages = Math.ceil((imgBytes + paletteSize) / (64 * 1024));
            nonSharedMem = new WebAssembly.Memory({initial: pages, maximum: pages});
            buf = nonSharedMem;
            const paletteCopy = new Uint8ClampedArray(buf.buffer, 0, paletteSize);
            paletteCopy.set(palette);
        }
        let imports =  {env: {buf: buf}};
        wasmExports = WebAssembly.instantiate(mod, imports).then(instance => instance.exports);
    } else {
        let startTime = performance.now();
        wasmExports.then(wasm => {
            let [taskId, ofs, cols, rows, x0, y, dx, dy, ITER] = params;
            // if we allocated non-shared memory, ignore offset
            let offset = nonSharedMem ? paletteSize : ofs;
            wasm.mandel(offset, rows, cols, x0, y, dx, dy, ITER);
            postMessage([taskId, nonSharedMem && nonSharedMem.buffer, ofs, performance.now() - startTime]);
        });
    }
}
