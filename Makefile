all: mandel.wasm mandel-shmem.wasm mandel-simd.wasm

%.wasm: %.wat
	wat2wasm $< --enable-threads --enable-simd -o $@
