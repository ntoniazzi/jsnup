<script lang="ts" setup>

import { PageSizes, PDFDocument } from "pdf-lib";
import type {PDFDocumentProxy} from "pdfjs-dist";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
// import { app, filesystem, events, os } from "@neutralinojs/lib";
import "./styles.scss";
import { ref, shallowRef } from 'vue';
import { computed, reactive } from "@vue/reactivity";
import { formatNumber, formatSize, fitRectangle } from './utils';
import SpinButton from "./SpinButton.vue";

const { filesystem, os } = Neutralino;

const NL_PATH_SEP = ('string' === typeof NL_OS && NL_OS === "Windows") ? "\\" : "/";
const isNeutralino = ("undefined" !== typeof NL_MODE) && "window" === NL_MODE;
const workerUrl = new URL(
    "/node_modules/pdfjs-dist/build/pdf.worker.js",
    import.meta.url
);

if (typeof window !== "undefined" && "Worker" in window) {
    const url = workerUrl.toString();
    GlobalWorkerOptions.workerSrc = url;
}

interface OutputConfig {
    format: Format,
    repeat: boolean,
    placement: number,
    orientation: Orientation,
    columns: number,
    rows: number,
};

enum Orientation {
    Portrait,
    Landscape,
};

interface Thumb {
    pageNumber: number,
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    src: string,
}

const input = ref<HTMLInputElement>(null);
const pdf = shallowRef<PDFDocument>(null);
const file = ref<File>(null);
const link = ref<HTMLAnchorElement>(null);
const thumbs = ref<Thumb[]>([]);
const pageNumber = ref<number>(0);
const output = reactive<OutputConfig>({format: "A4", repeat: false, placement: 0, orientation: Orientation.Portrait, columns: 2, rows: 2});
const errorMessage = ref<string>("");
const pageRatio = ref<number>(1);
const fileLoaded = ref<boolean>(false);
const url = ref<string>(null);

let pdfjs: PDFDocumentProxy = null;
const buildCanvas = document.createElement("canvas");
const buildCtx = buildCanvas.getContext("2d");

let lastDir = os.getPath("documents") + NL_PATH_SEP;

// const types = [
//     { label: "1×1", rows: 1, columns: 1, w: '100%' },
//     { label: "1×2", rows: 1, columns: 2, w: '50%'  },
//     { label: "2×1", rows: 2, columns: 1, w: '50.1%'  },
//     { label: "2×2", rows: 2, columns: 2, w: '50%'  },
// ];

const thumbSize = 256;

function onOpenDocs() {
    fileLoaded.value = false;
    thumbs.value = [];
    pdf.value = null;
    pageNumber.value = 0;

    if (isNeutralino) {
        nlOpenDocs();

        return;
    }

    input.value.click();
}

function readFile() {
    const files = input.value.files;
    if (files.length === 0) {
        return;
    }

    file.value = files[0];

    const reader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>) => {
        bytesLoaded(event.target.result as ArrayBuffer);
    };
    reader.readAsArrayBuffer(file.value);
}

async function bytesLoaded(bytes: ArrayBuffer) {
    try {
        pdf.value = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch (error) {
        console.error(error);
        fileLoaded.value = true;
        errorMessage.value = "Impossible de lire ce fichier.";
        return;
    }
    pdfjs = await getDocument(bytes).promise;

    if (pageFormat.value !== "") {
        output.format = pageFormat.value;
    }

    const max = Math.min(10, pdf.value.getPageCount());

    const promises = [];

    for (let i = 0; i < max; ++i) {
        let canvas = document.createElement('canvas');
        // document.body.appendChild(canvas);
        let context = canvas.getContext("2d");
        let thumb = {
            pageNumber: i,
            canvas,
            context,
            src: ""
        };
        thumbs.value.push(thumb);

        promises.push(createPreview(thumb));
    }

    Promise.all(promises).then(() => {
        console.log("All previews updated");
        fileLoaded.value = true;
    });
}

function createPreview(thumb: Thumb): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
        pdfjs.getPage(thumb.pageNumber + 1)
        .then(page => {
            let viewport = page.getViewport();
            let vw = viewport.viewBox[2];
            let vh = viewport.viewBox[3];
            pageRatio.value = vw / vh;
            let maxDim = Math.max(vw, vh);
            let scale = thumbSize / maxDim;
            let newWidth = vw * scale;
            let newHeight = vh * scale;

            thumb.canvas.height = newHeight;
            thumb.canvas.width = newWidth;

            return page.render({
                canvasContext: thumb.context,
                viewport: viewport.clone({scale})
            }).promise;
        })
        .then(() => {
            thumb.src = thumb.canvas.toDataURL("image/jpeg");
            resolve();
        })
    });

    return promise;
}

// watch(pageNumber, () => {
    // updatePreview();
// });

async function nlOpenDocs() {
    let filenames: string[] = [];
    try {
        filenames = await os.showOpenDialog(
            "Sélectionnez un fichierPDF",
            {
                filters: [
                    {name: "PDF", extensions: ['pdf']},
                    {name: 'All files', extensions: ['*']}
                ],
                defaultPath: lastDir,
            }
        );
    } catch(reason) {
        console.log(reason);

        return;
        // app.exit(1);
    }

    console.log("Filename", filenames);

    if (filenames.length === 0) {
        console.log("nothing to do");

        return;
    }

    const pos = filenames[0].lastIndexOf(NL_PATH_SEP);
    lastDir = filenames[0].substring(0, pos + 1);

    console.log("Read file " + filenames[0] + ", last dir " + lastDir);

    const bytes = await filesystem.readBinaryFile(filenames[0]) as ArrayBuffer;

    file.value = {
        name: filenames[0].substring(pos + 1),
        size: bytes.byteLength,
    };

    bytesLoaded(bytes);
}

async function processPDF() {
    const outDoc = await PDFDocument.create();

    let page = null;

    // page = outDoc.addPage(PageSizes.A4);

    const numCells = output.columns * output.rows;
    const outputWidth = PageSizes[output.format][0];
    const outputHeight = PageSizes[output.format][1];
    const outputRatio = outputWidth / outputHeight;

    const canvasWidth  = output.orientation === Orientation.Landscape ? outputHeight : outputWidth;
    const canvasHeight = output.orientation === Orientation.Landscape ? outputWidth : outputHeight;

    console.log(`[output] canvas ${canvasWidth}x${canvasHeight}`);

    const cellWidth = canvasWidth / output.columns;
    const cellHeight = canvasHeight / output.rows;

    if (output.repeat) {
        // repeat selected page over destination page
        let sourcePage = pdf.value.getPage(pageNumber.value);
        page = outDoc.addPage([canvasWidth, canvasHeight]);
        let embed = await outDoc.embedPage(sourcePage);
        let [,, xScale] = fitRectangle(sourcePage.getWidth(), sourcePage.getHeight(), cellWidth, cellHeight);
        let x = 0, y = 0;
        for (let i = 0, m = numCells; i < m; ++i) {
            page.drawPage(embed, {x, y, xScale, yScale: xScale});

            x += cellWidth;
            if (x >= canvasWidth) {
                x = 0;
                y += cellHeight;
            }
        }
    } else {
        // copy each page of input PDF to destination
        let x = 0, y = canvasHeight - cellHeight, n = 0;
        let numPages = pdf.value.getPageCount();
        for (let i = 0; i < numPages; ++i) {
            // get page
            let sourcePage = pdf.value.getPage(i);
            let embed = await outDoc.embedPage(sourcePage);
            let [,, xScale] = fitRectangle(sourcePage.getWidth(), sourcePage.getHeight(), cellWidth, cellHeight);
            if (null === page) {
                page = outDoc.addPage([canvasWidth, canvasHeight]);
            }

            page.drawPage(embed, {x, y, xScale, yScale: xScale});

            x += cellWidth;
            if (x >= canvasWidth) {
                x = 0;
                y -= cellHeight;

                if (y < 0) {
                    n++;
                    y = canvasHeight - cellHeight;
                    x = 0;

                    page = null;
                }
            }
        }
    }

    let pdfBytes;
    try {
        console.log("saving doc");
        pdfBytes = await outDoc.save();
    } catch (reason) {
        console.error("Error creating nup", reason);
    }

    return pdfBytes;
}

async function processAndSave() {
    const pdfBytes = await processPDF();

    if (isNeutralino) {
        let outfile;
        try {
            outfile = await os.showSaveDialog(
                "Enregistrer le fichier sous…",
                {
                    filters: [
                    {name: "PDF", "extensions": ['pdf']},
                    {name: 'Tous les fichiers', extensions: ['*']}
                    ],
                    defaultPath: lastDir,
                }
            );
        } catch (reason) {
            console.error("cannot select file", reason);
        }

        try {
            await filesystem.writeBinaryFile(outfile, pdfBytes);
        } catch (reason) {
            console.error("cannot write file", reason);
        }

        os.open("file://" + outfile);

        return;
    }

    let blob = new Blob([pdfBytes], { type: 'application/pdf' });
    if (null !== url.value) {
        URL.revokeObjectURL(url.value);
    }

    url.value = URL.createObjectURL(blob);
    window.setTimeout(() => { link.value.click() }, 100);
}

function pdfToCm(value: number): number {
    return value / 72 * 2.54;
}

const pageSize = computed(() => {
    if (null === pdf.value) {
        return { width: 0, height: 0};
    }

    const size = pdf.value.getPage(0).getSize();

    size.width = Math.round(size.width * 100) / 100;
    size.height = Math.round(size.height * 100) / 100;

    return size;
});

const outputSrc = computed(() => {
    if (!pdf.value || thumbs.value.length === 0) {
        return "";
    }

    console.debug("computing output");

    const numCells = output.columns * output.rows;
    const outputWidth = PageSizes[output.format][0];
    const outputHeight = PageSizes[output.format][1];
    const outputRatio = outputWidth / outputHeight;

    console.log(`[output] ${outputWidth}x${outputHeight}, ratio=${outputRatio}`);

    // canvas must be inside a square of thumbSize width
    const canvasWidth  = Math.round(output.orientation === Orientation.Landscape ? thumbSize : thumbSize * outputRatio);
    const canvasHeight = Math.round(output.orientation === Orientation.Portrait ? thumbSize : thumbSize * outputRatio);

    console.log(`[output] canvas ${canvasWidth}x${canvasHeight}`);

    const cellWidth = canvasWidth / output.columns;
    const cellHeight = canvasHeight / output.rows;

    console.log(`[output] cell ${cellWidth}x${cellHeight}`);

    buildCanvas.width = canvasWidth;
    buildCanvas.height = canvasHeight;

    buildCtx.strokeStyle = "red";
    buildCtx.lineWidth = 1;

    let x = 0, y = 0;
    const max = Math.min(pdf.value.getPageCount(), numCells);

    console.debug(`drawing ${max} pages on canvas`);

    if (output.repeat) {
        let img = thumbs.value[pageNumber.value].canvas;
        const [itemWidth, itemHeight] = fitRectangle(img.width, img.height, cellWidth, cellHeight);

        for (let i = 0; i < numCells; ++i) {
            console.debug(`${i}: ${itemWidth}x${itemHeight} at ${x},${y}`);

            buildCtx.drawImage(img, x, y, itemWidth, itemHeight);
            // buildCtx.strokeRect(x, y, itemWidth, itemHeight);

            x += cellWidth;
            if (x >= canvasWidth) {
                x = 0;
                y += cellHeight;
            };
        }
    } else {
        for (let i = 0; i < max; ++i) {
            let img = thumbs.value[i].canvas;

            const [itemWidth, itemHeight] = fitRectangle(img.width, img.height, cellWidth, cellHeight);
            console.debug(`${i}: ${itemWidth}x${itemHeight} at ${x},${y}`);

            buildCtx.drawImage(img, x, y, itemWidth, itemHeight);
            // buildCtx.strokeRect(x, y, itemWidth, itemHeight);

            x += cellWidth;
            if (x >= canvasWidth) {
                x = 0;
                y += cellHeight;
            };
        }
    }

    return buildCanvas.toDataURL();
});

type Format = keyof typeof PageSizes;

const formats = Object.keys(PageSizes).map((key: Format) => {
    return {
        label: key,
        dim: formatNumber(pdfToCm(PageSizes[key][0])) + '×' + formatNumber(pdfToCm(PageSizes[key][1])),
        w: Math.round(PageSizes[key][0]),
        h: Math.round(PageSizes[key][1]),
    };
});

const pageFormat = computed<Format | "">(() => {
    let { width, height } = pageSize.value;
    width = Math.round(width);
    height = Math.round(height);

    let format = formats.find(item => {
        if (item.w == width && item.h == height) {
            return true;
        }

        if (item.w === height && item.h === width) {
            return true;
        }
    });

    if (undefined === format) {
        return "";
    }

    return format.label;
});

</script>

<template>
    <header>PDF n-up</header>
    <main :style="'--ratio:' + pageRatio">
        <div v-if="errorMessage !== ''" class="error-backdrop">
            <div class="error">
                <div>{{  errorMessage }}</div>
                <button @click="errorMessage=''">OK</button>
            </div>
        </div>

        <button @click="onOpenDocs">Ouvrir un fichier</button>
        <input type="file" style="display:none" ref="input" accept=".pdf,application/pdf" @change="readFile"/>

        <div class="preview" v-if="fileLoaded && pdf">
            <div>
                <div class="image-container">
                    <img :src="undefined !== thumbs[pageNumber] ? thumbs[pageNumber].src : ''" />
                </div>
                <div class="pager" v-if="pdf.getPageCount() > 1">
                    <button class="arrow" :disabled="pageNumber === 0" @click="pageNumber--">
                    ❬
                    </button>
                    <span>
                        {{  pageNumber + 1 }}/{{ pdf.getPageCount() }}
                    </span>
                    <button class="arrow" :disabled="pageNumber === (pdf.getPageCount() - 1)" @click="pageNumber++">
                    ❭
                    </button>
                </div>
            </div>
            <dl>
                <dt>Nom</dt><dd>{{ file.name }}</dd>
                <dt>Taille</dt><dd>{{ formatSize(file.size) }}</dd>
                <dt>Pages</dt><dd>{{ pdf.getPageCount() }}</dd>
                <dt>Titre</dt><dd>{{ pdf.getTitle() }}</dd>
                <dt>Auteur</dt><dd>{{ pdf.getAuthor() }}</dd>
                <dt>Dimensions</dt><dd>{{ formatNumber(pdfToCm(pageSize.width)) }}&times;{{  formatNumber(pdfToCm(pageSize.height)) }}</dd>
                <dt>Format</dt><dd>{{ pageFormat }}</dd>
                <dt>Orientation</dt><dd>{{  pageSize.width >= pageSize.height ? "Paysage" : "Portrait" }}</dd>
            </dl>
        </div>

        <div class="preview">
            <div class="config">
                <label>Format de sortie</label>
                <select v-model="output.format">
                    <option v-for="format in formats" :key="format.label" :value="format.label">
                        {{ format.label }}
                        ({{ format.dim }})
                    </option>
                </select>

                <label>Répétition de la page</label>
                <input type="checkbox" v-model="output.repeat" />

                <label>Orientation</label>
                <select v-model="output.orientation">
                    <option :value="0">Portrait</option>
                    <option :value="1">Paysage</option>
                </select>

                <label>Colonnes</label>
                <spin-button v-model="output.columns" :min="1" :max="5" />

                <label>Lignes</label>
                <spin-button v-model="output.rows" :min="1" :max="5" />

            </div>
            <!-- div class="placement" :class="{landscape: output.orientation}">
                <div v-for="(type, index) in types" :style="'--w:' + type.w" :key="index" @click="output.placement=index" :class="{selected: output.placement === index}">
                    <div class="thumb"><div class="cell" v-for="r in (type.rows * type.columns)"><img :src="getThumbSrc(r)" /></div></div>
                        <span>{{  type.label }}</span>
                        <div class="vis"></div>
                </div>
            </div-->

            <div class="image-container" v-if="fileLoaded">
                <img :src="outputSrc" />
            </div>
        </div>

        <button @click="processAndSave" :disabled="!pdf">Enregistrer le PDF</button>

        <a :href="url" ref="link" download="document.pdf" style="display:none">Download</a>
    </main>
    <footer>@</footer>
</template>

