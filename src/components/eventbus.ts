import type * as vscode from 'vscode'
import type {PdfViewerState} from '../../types/latex-toybox-protocol-types/index'
import { AwaitableEventEmitter } from './eventbuslib/awaitableeventemitter'
import type { Logger } from './logger'

export type EventName =
    'auxupdated' |
    'buildfinished' |
    'completionupdated' |
    'findrootfileend' |
    'pdfviewerpagesloaded' |
    'pdfviewerstatuschanged' |
    'rootfilechanged'

/**
 * EventBus is a component that provides an API for registering callbacks
 * for events and firing events. It acts as a communication channel or message bus
 * within an application, allowing different components or modules to interact
 * with each other through events.
 *
 * Since neither Node.js's EventEmitter nor VS Code's EventEmitter are being used,
 * there is no need to dispose of them during deactivation.
 *
 */
export class EventBus {
    readonly auxUpdated = new AwaitableEventEmitter<string, 'auxupdated'>('auxupdated')
    /**
     * This event is triggered when the build process is complete,
     * and it includes the name of the root file that was used for the build.
     * If the `subfiles` package is used, it can be one of the subfiles.
     */
    readonly buildFinished = new AwaitableEventEmitter<string | undefined, 'buildfinished'>('buildfinished')
    readonly completionUpdated = new AwaitableEventEmitter<string, 'completionupdated'>('completionupdated')
    readonly findRootFileEnd = new AwaitableEventEmitter<string | undefined, 'findrootfileend'>('findrootfileend')
    readonly pdfViewerStatusChanged = new AwaitableEventEmitter<PdfViewerState, 'pdfviewerstatuschanged'>('pdfviewerstatuschanged')
    readonly pdfViewerPagesLoaded = new AwaitableEventEmitter<vscode.Uri, 'pdfviewerpagesloaded'>('pdfviewerpagesloaded')
    readonly rootFileChanged = new AwaitableEventEmitter<string, 'rootfilechanged'>('rootfilechanged')

    constructor(extension: {
        readonly logger: Logger
    }) {
        this.allEmitters.forEach((emitter) => {
            emitter.event((arg) => {
                extension.logger.debug(`Event ${emitter.eventName} triggered. Payload: ${JSON.stringify(arg)}`)
            })
        })
    }

    get allEmitters() {
        return [
            this.buildFinished,
            this.pdfViewerStatusChanged,
            this.pdfViewerPagesLoaded,
            this.rootFileChanged,
            this.findRootFileEnd,
            this.completionUpdated
        ]
    }

    on(event: EventName, cb: (eventname: string, arg: unknown) => unknown) {
        for (const emitter of this.allEmitters) {
            if (emitter.eventName === event) {
                return emitter.event((arg) => {
                    cb(event, arg)
                })
            }
        }
        throw new Error(`Unknown event name: ${event}`)
    }

}
