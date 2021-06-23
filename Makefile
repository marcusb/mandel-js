all: mandel.wasm mandel-shmem.wasm mandel-simd.wasm

WAT2WASM := wat2wasm

%.wasm: %.wat
	$(WAT2WASM) $< --enable-threads --enable-simd -o $@
