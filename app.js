const N = 1000;
const ITER = 1000;

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
    let imgData = ctx.createImageData(N, N);
    let data = imgData.data;

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

    let y = y1;
    let idx = 0;
    
    let startTime = Date.now();
    for (j = 0; j < N; j++) {
        let x = x0;
        for (k = 0; k < N; k++) {
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
                data[idx] = Math.sin(c * fRed) * 128 + 127;
                data[idx + 1] = Math.sin(c * fGreen) * 128 + 127;
                data[idx + 2] = Math.sin(c * fBlue) * 128 + 127;
                data[idx + 3] = 255;
            } else {
                // We are in the Mandelbrot set, color black
                data[idx] = 0;
                data[idx + 1] = 0;
                data[idx + 2] = 0;
                data[idx + 3] = 255;
            }
            idx += 4;
            x += dx;
        }
        y -= dy;
    }
    console.log("computed in " + (Date.now() - startTime) / 1000 + "s");

    ctx.putImageData(imgData, 0, 0);
};

roundCoord = x => Math.round(x * 1000) / 1000;
