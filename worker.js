let wasmExports;

onmessage = e => {
    let [event, params] = e.data;
    if (event == 'init') {
        let [mod, buf] = params;
        let imports =  {env: {buf: buf}};
        wasmExports = WebAssembly.instantiate(mod, imports).then(instance => instance.exports);
    } else {
        let startTime = performance.now();
        wasmExports.then(wasm => {
            let [taskId, ofs, cols, rows, x0, y, dx, dy, ITER] = params;
            wasm.mandel(ofs, rows, cols, x0, y, dx, dy, ITER);
            postMessage([taskId, performance.now() - startTime]);
        });
    }
}
