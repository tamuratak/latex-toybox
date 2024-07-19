// Static HTML elements
export const viewerDom = document.getElementById('viewer') as HTMLElement
export const viewerContainer = document.getElementById('viewerContainer') as HTMLElement
export const trimSelectElement = document.getElementById('trimSelect') as HTMLSelectElement


export enum ScrollMode {
    UNKNOWN = -1,
    VERTICAL = 0, // Default value.
    HORIZONTAL = 1,
    WRAPPED = 2,
    PAGE = 3,
}

export enum SpreadMode {
    UNKNOWN = -1,
    NONE = 0, // Default value.
    ODD = 1,
    EVEN = 2,
}

export enum RenderingStates {
    INITIAL = 0,
    RUNNING = 1,
    PAUSED = 2,
    FINISHED = 3,
}

export enum ScaleMode {
    AUTO = 0,
    PAGE_ACTUAL = 1,
    PAGE_FIT = 2,
    PAGE_WIDTH = 3,
    CUSTOM = 4,
}
