function isTrustedOrigin(origin) {
    const originUrl = new URL(origin);
    return (originUrl.protocol === document.location.protocol && originUrl.hostname === document.location.hostname)
        || originUrl.protocol === 'vscode-webview:'
        || originUrl.hostname.endsWith('.github.dev');
}

const vscode = acquireVsCodeApi();
const img = document.getElementById('math');
window.addEventListener('message', event => {
    if (!isTrustedOrigin(event.origin)) {
        console.log('mathpreview.js received a message with invalid origin');
        return;
    }
    const message = event.data;
    switch (message.type) {
        case "mathImage": {
            img.src = message.src;
            break;
        }
        default: {
            break;
        }
    }
});
vscode.postMessage({ type: 'initialized' });
