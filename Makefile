all: mandel.wasm

%.wasm: %.wat
	wat2wasm $< --enable-threads -o $@
