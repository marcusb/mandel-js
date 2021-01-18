all: mandel.wasm mandel-shmem.wasm

%.wasm: %.wat
	wat2wasm $< --enable-threads -o $@
