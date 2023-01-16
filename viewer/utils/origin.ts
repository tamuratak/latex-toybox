export function isTrustedOrigin(origin: string): boolean {
    const originUrl = new URL(origin)
    return (originUrl.protocol === document.location.protocol && originUrl.hostname === document.location.hostname)
        || originUrl.protocol === 'vscode-webview:'
        || originUrl.hostname.endsWith('.github.dev')
}
