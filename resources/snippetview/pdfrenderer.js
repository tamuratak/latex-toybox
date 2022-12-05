function isTrustedOrigin(origin) {
    const originUrl = new URL(origin);
    return (originUrl.protocol === document.location.protocol && originUrl.hostname === document.location.hostname)
        || originUrl.protocol === 'vscode-webview:'
        || originUrl.hostname.endsWith('.github.dev');
}

window.addEventListener('message', async (event) => {
    if (!isTrustedOrigin(event.origin)) {
        console.log('pdfrenderer.js received a message with invalid origin');
        return;
    }
    const message = event.data;
    if (message.type !== 'pdf') {
        return
    }
    try {
        const {canvas, pdf} = await renderPdfFile(message.uri, message.opts);
        vscodeApi.postMessage({
            type: 'png',
            uri: message.uri,
            data: canvas.toDataURL()
        })
        pdf.cleanup();
    } catch (e) {
        vscodeApi.postMessage({
            type: 'png',
            uri: message.uri,
            data: undefined
        })
        throw(e)
    }
})

// https://github.com/microsoft/vscode/issues/87282#issuecomment-919464403
const pdfWorkerJsBlob = new Promise(async resolve => {
    const result = await fetch(pdfjsDistUri + '/build/pdf.worker.js');
    const blob = await result.blob();
    resolve(blob);
})

async function createPdfWorker() {
    const blob = await pdfWorkerJsBlob;
    const blobUrl = URL.createObjectURL(blob);
    pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(blobUrl);
}

async function renderPdfFile(url, opts) {
    let loadingTask = pdfjsLib.getDocument({
        url,
        cMapUrl: pdfjsDistUri + '/cmaps/',
        cMapPacked: true,
        isOffscreenCanvasSupported: false
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(opts.pageNumber);
    let scale = 1;
    let viewport = page.getViewport({ scale });

    const height = Math.floor(viewport.height);
    const width = Math.floor(viewport.width);
    scale = Math.min(opts.height/height, opts.width/width);
    viewport = page.getViewport({ scale });

    //
    // Prepare canvas using PDF page dimensions
    //
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    //
    // Render PDF page into canvas context
    //
    const renderContext = {
        canvasContext: context,
        viewport: viewport,
        intent: 'print'
    };
    let renderTask = page.render(renderContext);
    setTimeout(() => {
        try {
            renderTask?.cancel();
            loadingTask?.destroy();
        } catch (e) {
            // ignore
        }
    }, 5000);
    await renderTask.promise;
    renderTask = undefined;
    await loadingTask.destroy();
    loadingTask = undefined;
    return {canvas, pdf};
}

await import(pdfjsDistUri + "/build/pdf.js");
createPdfWorker();
