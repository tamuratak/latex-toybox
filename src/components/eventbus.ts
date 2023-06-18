import type * as vscode from 'vscode'
import type {PdfViewerState} from '../../types/latex-workshop-protocol-types/index'
import type { IEventBus, LoggerLocator } from '../interfaces'
import { AwaitableEventEmitter } from '../utils/awaitableeventemitter'

export type EventName = 'buildfinished' | 'pdfviewerpagesloaded' | 'pdfviewerstatuschanged' | 'rootfilechanged' | 'findrootfileend' | 'completionupdated'

interface IExtension extends
    LoggerLocator { }

export class EventBus implements IEventBus {
    /**
     * This event is triggered when the build process is complete,
     * and it includes the name of the root file that was used for the build.
     * If the `subfiles` package is used, it can be one of the subfiles.
     */
    readonly buildFinished = new AwaitableEventEmitter<string, 'buildfinished'>('buildfinished')
    readonly pdfViewerStatusChanged = new AwaitableEventEmitter<PdfViewerState, 'pdfviewerstatuschanged'>('pdfviewerstatuschanged')
    readonly pdfViewerPagesLoaded = new AwaitableEventEmitter<vscode.Uri, 'pdfviewerpagesloaded'>('pdfviewerpagesloaded')
    readonly rootFileChanged = new AwaitableEventEmitter<string, 'rootfilechanged'>('rootfilechanged')
    readonly findRootFileEnd = new AwaitableEventEmitter<string | undefined, 'findrootfileend'>('findrootfileend')
    readonly completionUpdated = new AwaitableEventEmitter<string, 'completionupdated'>('completionupdated')

    constructor(extension: IExtension) {
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
