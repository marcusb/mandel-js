# mandel-js

Simple web-based Mandelbrot set explorer. This was written as a fun teaching exercise.
The design goals are speed and small code size, in that order.

It uses web workers for parallelization, so you can put those CPU cores to use!
The math code is written in WebAssembly. Shared memory is used where available.

It will use SIMD instructions for a ~2x speed boost, when available. This is only known
to work on recent Chrome browsers if you enable a [flag](chrome://flags/#enable-webassembly-simd).

Try it out [here](https://dlbk35kw7uw7f.cloudfront.net/)!

## Features

* Click and select-and to zoom
* History navigation - use the Back button to navigate where you came from
* Colors are randomized on load

## License

Licensed under the [MIT License](https://github.com/marcusb/mandel-js/blob/master/LICENSE).
