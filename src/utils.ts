const units = ["o", "ko", "Mo", "Go", "To", "Po", "Eo", "Zo", "Yo"];
const numberFormater = new Intl.NumberFormat("fr");

export function formatSize(size: number): string {
    // SI Binary (base=2, div=10)
    const power = Math.trunc(Math.log2(size) / 10);
    const value = (size / Math.pow(2, 10 * power));

    return formatNumber(value) + " " + units[power];
};

export function formatNumber(value: number, decimals: number = 2): string {
    const x = Math.pow(10, decimals);
    const rounded = Math.round(value * x) / x;

    return numberFormater.format(rounded);
};

export function fitRectangle(sw: number, sh: number, dw: number, dh: number) {
    const fatness1: number = dw / dh;
    const fatness2: number = sw / sh;

    let scaleRatio = 1;

    // adjust scaling
    if (fatness2 >= fatness1) {
        // scale for a snug width
        scaleRatio = dw / sw;
    } else {
        // scale for a snug height
        scaleRatio = dh / sh;
    }

    const nw = sw * scaleRatio;
    const nh = sh * scaleRatio;

    // adjust rectangle 3's center so it is the same as 1's center
    // const xCenterOf1 = (dw / 2);
    // const yCenterOf1 = (dh / 2)

    // const x3 = xCenterOf1 - (nw / 2);
    // const y3 = yCenterOf1 - (nh / 2);

    return [nw, nh, scaleRatio];
}
