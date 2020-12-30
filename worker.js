onmessage = e => {
    let startTime = performance.now();
    let [taskId, buf, cols, rows, x0, y, dx, dy, ITER, fRed, fGreen, fBlue] = e.data;
    let idx = 0;
    for (j = 0; j < rows; j++) {
        let x = x0;
        for (k = 0; k < cols; k++) {
            // z = a + bi
            // w = x + y i
            // The update is z := z^2 + w
            // We save some multiplications by also storing
            //   aa = a*a
            //   bb = b*b
            // so they can be re-used in the following round.
            let a = 0;
            let b = 0;
            let aa = 0;
            let bb = 0;
            let tmp;
            for (i = 0; i < ITER; i++) {
                tmp = aa - bb + x;
                b = 2*a*b + y;
                a = tmp;
                aa = a * a;
                if (aa > 10) {
                    break;
                }
                bb = b * b;
                if (aa + bb > 10) {
                    break;
                }
            }
            if (i < ITER) {
                // We escaped, color the point accordingly
                let c = 2 * (i / ITER) - 1;
                buf[idx] = Math.sin(c * fRed) * 128 + 127;
                buf[idx + 1] = Math.sin(c * fGreen) * 128 + 127;
                buf[idx + 2] = Math.sin(c * fBlue) * 128 + 127;
                buf[idx + 3] = 255;
            } else {
                // We are in the Mandelbrot set, color black
                buf[idx] = 0;
                buf[idx + 1] = 0;
                buf[idx + 2] = 0;
                buf[idx + 3] = 255;
            }
            idx += 4;
            x += dx;
        }
        y -= dy;
    }
    postMessage([taskId, performance.now() - startTime]);
}
