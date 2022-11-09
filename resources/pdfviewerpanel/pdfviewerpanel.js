// When the tab gets focus again later, move the
// the focus to the iframe so that keyboard navigation works in the pdf.
const iframe = document.getElementById('preview-panel');
window.onfocus = function () {
    setTimeout(function () { // doesn't work immediately
        iframe.contentWindow.focus();
    }, 100);
}

// Prevent the whole iframe selected.
// See https://github.com/James-Yu/LaTeX-Workshop/issues/3408
window.addEventListener('selectstart', (e) => {
    e.preventDefault();
});

const vsStore = acquireVsCodeApi();
// To enable keyboard shortcuts of VS Code when the iframe is focused,
// we have to dispatch keyboard events in the parent window.
// See https://github.com/microsoft/vscode/issues/65452#issuecomment-586036474
window.addEventListener('message', (e) => {
    if (e.origin !== iframeSrcOrigin) {
        return;
    }
    switch (e.data.type) {
        case 'initialized': {
            const state = vsStore.getState();
            if (state) {
                state.type = 'restore_state';
                iframe.contentWindow.postMessage(state, iframeSrcOrigin);
            } else {
                iframe.contentWindow.postMessage({ type: 'restore_state', state: { kind: 'not_stored' } }, iframeSrcOrigin);
            }
            break;
        }
        case 'click_event': {
            if (!/^https?:/.exec(e.data.href)) {
                return;
            }
            const dom = document.createElement('a');
            dom.style.display = 'none';
            dom.href = e.data.href;
            document.body.appendChild(dom);
            dom.click();
            document.body.removeChild(dom);
            return;
        }
        case 'copy_event': {
            window.navigator.clipboard.writeText(e.data.text);
            return;
        }
        case 'keyboard_event': {
            if (rebroadcast) {
                window.dispatchEvent(new KeyboardEvent('keydown', e.data.event));
            }
            break;
        }
        case 'state': {
            vsStore.setState(e.data);
            break;
        }
        default:
            break;
    }
    vsStore.postMessage(e.data);
});

window.addEventListener('copy', (e) => {
    iframe.contentWindow.postMessage({ type: 'copy_event' }, iframeSrcOrigin);
});

window.addEventListener('paste', async (e) => {
    const text = await window.navigator.clipboard.readText();
    iframe.contentWindow.postMessage({ type: 'paste_event', text }, iframeSrcOrigin);
});
