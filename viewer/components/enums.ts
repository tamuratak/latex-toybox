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
