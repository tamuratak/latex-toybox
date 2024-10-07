
function editViewerHtml() {
    createForwardBackwardButtons()
    createCheckBoxes()
    createTrimOption()
    createTrimSelect()
    createSynctexIndicator()
}

function createForwardBackwardButtons() {
    const elements = html`
    <button class="toolbarButton findPrevious" title="Back" id="historyBack">
      <span>Back</span>
    </button>
    <button class="toolbarButton findNext" title="Forward" id="historyForward">
      <span>Forward</span>
    </button>
    `
    insertAfterEnd('sidebarToggleButton', elements)
}

function createCheckBoxes() {
    const elements = html`
    <div class="horizontalToolbarSeparator"></div>
    <button id="synctexOffButton" type="button" class="toolbarButton labeled" title="Disable forward SyncTeX" tabindex="71">
        <input id="synctexOff" type="checkbox"> Stop SyncTeX
    </button>
    <button id="autoReloadOffButton" type="button" class="toolbarButton labeled" title="Disable auto reload" tabindex="72">
        <input id="autoReloadOff" type="checkbox"> Stop Auto Reload
    </button>
    `
    insertAfterEnd('spreadModeButtons', elements)
}

function createTrimOption() {
    const elements = html`
    <option id="trimOption" title="" disabled="disabled" hidden="true"> Trimming </option>
    `
    appendChild('scaleSelect', elements)
}

function createTrimSelect() {
    const elements = html`
    <span id="trimSelectContainer" class="dropdownToolbarButton">
        <select id="trimSelect" title="Trim" tabindex="23" >
            <option selected="selected" >No trim</option>
            <option>Trim 5%</option>
            <option>Trim 10%</option>
            <option>Trim 15%</option>
        </select>
    </span>
    `
    insertAfterEnd('scaleSelectContainer', elements)
}

function createSynctexIndicator() {
    const elements = html`
    <div id="synctex-indicator">
    `
    insertAfterEnd('viewer', elements)
}

function insertAfterEnd(targetId: string, elements: Iterable<Element>) {
    const target = document.getElementById(targetId)
    if (!target) {
        throw new Error(`${targetId} not found`)
    }
    for (const element of Array.from(elements).reverse()) {
        target.insertAdjacentElement('afterend', element)
    }
}

function appendChild(targetId: string, elements: Iterable<Element>) {
    const target = document.getElementById(targetId)
    if (!target) {
        throw new Error(`${targetId} not found`)
    }
    for (const element of elements) {
        target.appendChild(element)
    }
}

function html(strings: TemplateStringsArray, ...values: unknown[]) {
    if (strings.length > 1 || values.length > 0) {
        throw new Error('html() does not support template literals')
    }
    const htmlString = strings[0]
    if (htmlString === undefined) {
        return []
    }
    const div = document.createElement('div')
    div.innerHTML = htmlString
    const ret = div.children
    div.remove()
    return ret
}

editViewerHtml()
