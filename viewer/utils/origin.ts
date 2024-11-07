export function isTrustedOrigin(origin: string): boolean {
    const originUrl = new URL(origin)
    return (originUrl.protocol === window.location.protocol && originUrl.hostname === window.location.hostname)
        || originUrl.protocol === 'vscode-webview:'
        || originUrl.hostname.endsWith('.github.dev')
}
