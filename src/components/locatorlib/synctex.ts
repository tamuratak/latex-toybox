import * as path from 'node:path'
import * as vscode from 'vscode'
import * as zlib from 'node:zlib'
import { PdfSyncObject, parseSyncTex, Block, SyncTexJsError } from '../../lib/synctexjs/synctexjs.js'
import { ConvertFilenameEncodingIterator } from '../../utils/convertfilename.js'
import { isSameRealPath } from '../../utils/pathnormalize.js'
import { existsPath, readFileAsUint8Array } from '../../lib/lwfs/lwfs.js'
import type { ILogger } from '../../interfaces.js'
import { inspectCompact } from '../../utils/inspect.js'
import { decodeXUserDefined } from '../../utils/xuserdefined.js'

class Rectangle {
    readonly top: number
    readonly bottom: number
    readonly left: number
    readonly right: number

    static coveringRectangle(blocks: Block[]) {
        let cTop = 2e16
        let cBottom = 0
        let cLeft = 2e16
        let cRight = 0

        for (const b of blocks) {
            // Skip a block if they have boxes inside, or their type is kern or rule.
            // See also https://github.com/jlaurens/synctex/blob/2017/synctex_parser.c#L4655 for types.
            if (b.elements !== undefined || b.type === 'k' || b.type === 'r') {
                continue
            }
            cBottom = Math.max(b.bottom, cBottom)
            const top = b.bottom - b.height
            cTop = Math.min(top, cTop)
            cLeft = Math.min(b.left, cLeft)
            if (b.width !== undefined) {
                const right = b.left + b.width
                cRight = Math.max(right, cRight)
            }
        }
        return new Rectangle({ top: cTop, bottom: cBottom, left: cLeft, right: cRight })
    }

    static fromBlock(block: Block): Rectangle {
        const top = block.bottom - block.height
        const bottom = block.bottom
        const left = block.left
        const right = block.width ? block.left + block.width : block.left
        return new Rectangle({top, bottom, left, right})
    }

    constructor( {top, bottom, left, right}: { top: number, bottom: number, left: number, right: number} ) {
        this.top = top
        this.bottom = bottom
        this.left = left
        this.right = right
    }

    include(rect: Rectangle): boolean {
        return this.left <= rect.left && this.right >= rect.right && this.bottom >= rect.bottom && this.top <= rect.top
    }

    distanceY(y: number): number {
        return Math.min( Math.abs(this.bottom - y), Math.abs(this.top - y) )
    }

    distanceXY(x: number, y: number): number {
        return Math.sqrt(Math.pow(Math.min( Math.abs(this.bottom - y), Math.abs(this.top - y) ), 2) + Math.pow(Math.min( Math.abs(this.left - x), Math.abs(this.right - x) ), 2))
    }

    distanceFromCenter(x: number, y: number): number {
        return Math.sqrt(Math.pow((this.left + this.right) / 2 - x, 2) + Math.pow((this.bottom + this.top) / 2 - y, 2))
    }
}

export class SyncTexJs {

    constructor(private readonly extension: {
        readonly logger: ILogger
    }) { }

    async parseSyncTexForPdf(pdfFile: string) {
        const filename = path.basename(pdfFile, path.extname(pdfFile))
        const dir = path.dirname(pdfFile)
        const synctexFile = path.resolve(dir, filename + '.synctex')
        const synctexFileGz = synctexFile + '.gz'

        try {
            const u8array = await readFileAsUint8Array(vscode.Uri.file(synctexFile))
            const s = decodeXUserDefined(u8array)
            return parseSyncTex(s)
        } catch (e) {
            if (await existsPath(synctexFile)) {
                this.extension.logger.error(`[SyncTexJs] parseSyncTex failed with: ${synctexFile}`)
                this.extension.logger.logError(e)
            }
        }

        try {
            const data = await readFileAsUint8Array(vscode.Uri.file(synctexFileGz))
            const b = zlib.gunzipSync(data)
            const s = decodeXUserDefined(b)
            return parseSyncTex(s)
        } catch (e) {
            if (await existsPath(synctexFileGz)) {
                this.extension.logger.error(`[SyncTexJs] parseSyncTex failed with: ${synctexFileGz}`)
                this.extension.logger.logError(e)
            }
        }

        if (!await existsPath(synctexFile) && !await existsPath(synctexFileGz)) {
            this.extension.logger.error(`[SyncTexJs] .synctex and .synctex.gz file not found: ${inspectCompact({synctexFile, synctexFileGz})}`)
        }

        throw new SyncTexJsError(`parseSyncTexForPdf failed with: ${pdfFile}`)
    }

    private async findInputFilePathForward(filePath: string, pdfSyncObject: PdfSyncObject): Promise<string | undefined> {
        for (const inputFilePath in pdfSyncObject.blockNumberLine) {
            try {
                if (await isSameRealPath(inputFilePath, filePath)) {
                    return inputFilePath
                }
            } catch { }
        }
        for (const inputFilePath in pdfSyncObject.blockNumberLine) {
            for (const convertedInputFilePath of new ConvertFilenameEncodingIterator(inputFilePath)) {
                if (await isSameRealPath(convertedInputFilePath, filePath)) {
                    return inputFilePath
                }
            }
        }
        return undefined
    }

    async syncTexJsForward(line: number, filePath: string, pdfFile: string) {
        this.extension.logger.info(`[SyncTexJs] Execute syncTexJsForward: ${inspectCompact({pdfFile, filePath, line})}`)
        const pdfSyncObject = await this.parseSyncTexForPdf(pdfFile)
        const inputFilePath = await this.findInputFilePathForward(filePath, pdfSyncObject)
        if (inputFilePath === undefined) {
            const inputFiles = Object.keys(pdfSyncObject.blockNumberLine)
            throw new SyncTexJsError(`[SyncTexJs] No relevant entry of the tex file found in the synctex file: ${inspectCompact({filePath, pdfFile, line, inputFiles})}`)
        }

        const linePageBlocks = pdfSyncObject.blockNumberLine[inputFilePath]
        const lineNums = Object.keys(linePageBlocks).map(x => Number(x)).sort( (a, b) => { return (a - b) } )
        const i = lineNums.findIndex( x => x >= line )
        if (i === 0 || lineNums[i] === line) {
            const l = lineNums[i]
            const blocks = this.getBlocks(linePageBlocks, l)
            const c = Rectangle.coveringRectangle(blocks)
            return { page: blocks[0].page, x: c.left + pdfSyncObject.offset.x, y: c.bottom + pdfSyncObject.offset.y }
        }
        const line0 = lineNums[i - 1]
        const blocks0 = this.getBlocks(linePageBlocks, line0)
        const c0 = Rectangle.coveringRectangle(blocks0)
        const line1 = lineNums[i]
        const blocks1 = this.getBlocks(linePageBlocks, line1)
        const c1 = Rectangle.coveringRectangle(blocks1)
        let bottom: number
        if (c0.bottom < c1.bottom) {
            bottom = c0.bottom * (line1 - line) / (line1 - line0) + c1.bottom * (line - line0) / (line1 - line0)
        } else {
            bottom = c1.bottom
        }
        return { page: blocks1[0].page, x: c1.left + pdfSyncObject.offset.x, y: bottom + pdfSyncObject.offset.y }
    }

    private getBlocks(linePageBlocks: Record<number, Record<number, Block[]>>, lineNum: number ): Block[] {
        const pageBlocks = linePageBlocks[lineNum]
        const pageNums = Object.keys(pageBlocks)
        if (pageNums.length === 0) {
            throw new SyncTexJsError('No page number found in the synctex file.')
        }
        const page = pageNums[0]
        return pageBlocks[Number(page)]
    }

    async syncTexJsBackward(page: number, x: number, y: number, pdfPath: string) {
        this.extension.logger.info(`[SyncTexJs] Execute syncTexJsBackward: ${inspectCompact({pdfPath, page, x, y})}`)
        const pdfSyncObject = await this.parseSyncTexForPdf(pdfPath)
        const y0 = y - pdfSyncObject.offset.y
        const x0 = x - pdfSyncObject.offset.x
        const fileNames = Object.keys(pdfSyncObject.blockNumberLine)

        if (fileNames.length === 0) {
            throw new SyncTexJsError(`No entry of the tex file found in the synctex file. Entries: ${inspectCompact(fileNames)}`)
        }

        const record = {
            input: '',
            line: 0,
            distanceXY: 2e16,
            distanceFromCenter: 2e16,
            rect: new Rectangle({top: 0, bottom: 2e16, left: 0, right: 2e16})
        }

        for (const fileName of fileNames) {
            const linePageBlocks = pdfSyncObject.blockNumberLine[fileName]
            for (const lineNum in linePageBlocks) {
                const pageBlocks = linePageBlocks[Number(lineNum)]
                for (const pageNum in pageBlocks) {
                    if (page !== Number(pageNum)) {
                        continue
                    }
                    const blocks = pageBlocks[Number(pageNum)]
                    for (const block of blocks) {
                        // Skip a block if they have boxes inside, or their type is kern or rule.
                        // See also https://github.com/jlaurens/synctex/blob/c11fe00dbdc6423a0e54d4e531563be645f78679/synctex_parser.c#L4706-L4727 for types.
                        if (block.elements !== undefined || block.type === 'k' || block.type === 'r') {
                            continue
                        }
                        const rect = Rectangle.fromBlock(block)
                        const distFromCenter = rect.distanceFromCenter(x0, y0)
                        if ( record.rect.include(rect) || (distFromCenter < record.distanceFromCenter && !rect.include(record.rect)) ) {
                            record.input = fileName
                            record.line = Number(lineNum)
                            record.distanceFromCenter = distFromCenter
                            record.rect = rect
                        }
                    }
                }
            }
        }

        if (record.input === '') {
            throw new SyncTexJsError('Cannot find any line to jump to.')
        }

        return { input: await this.convInputFilePath(record.input), line: record.line, column: 0 }
    }

    private async convInputFilePath(inputFilePath: string) {
        if (await existsPath(inputFilePath)) {
            return inputFilePath
        }
        for (const convertedFilePath of new ConvertFilenameEncodingIterator(inputFilePath)) {
            if (await existsPath(convertedFilePath)) {
                return convertedFilePath
            }
        }

        throw new SyncTexJsError(`Input file to jump to does not exist in the file system: ${inputFilePath}`)
    }
}
