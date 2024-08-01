import * as iconv from 'iconv-lite'
import { existsPath } from '../lib/lwfs/lwfs.js'
import * as xuserdefined from './xuserdefined.js'

// https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings
export const iconvLiteSupportedEncodings = [
    'utf8', 'utf16le', 'UTF-16BE', 'UTF-16',
    'Shift_JIS', 'Windows-31j', 'Windows932', 'EUC-JP',
    'GB2312', 'GBK', 'GB18030', 'Windows936', 'EUC-CN',
    'KS_C_5601', 'Windows949', 'EUC-KR',
    'Big5', 'Big5-HKSCS', 'Windows950',
    'windows-874', 'windows-1250', 'windows-1251', 'windows-1252',
    'windows-1253', 'windows-1254', 'windows-1255', 'windows-1256',
    'windows-1257', 'windows-1258',
    'ISO-8859-1', 'ISO-8859-2', 'ISO-8859-3', 'ISO-8859-4', 'ISO-8859-5',
    'ISO-8859-6', 'ISO-8859-7', 'ISO-8859-8', 'ISO-8859-9', 'ISO-8859-10',
    'ISO-8859-11', 'ISO-8859-13', 'ISO-8859-14', 'ISO-8859-15', 'ISO-8859-16',
    'CP437', 'CP737', 'CP775',
    'CP850', 'CP852', 'CP855', 'CP856', 'CP857', 'CP858',
    'CP860', 'CP861', 'CP862', 'CP863', 'CP864', 'CP865', 'CP866', 'CP869',
    'CP922', 'CP1046', 'CP1124', 'CP1125', 'CP1129', 'CP1133', 'CP1161', 'CP1162', 'CP1163',
    'koi8-r', 'koi8-u', 'koi8-ru', 'koi8-t'
] as const

export async function convertFilenameEncoding(filePath: string) {
    for (const fpath of new ConvertFilenameEncodingIterator(filePath)) {
        if (await existsPath(fpath)) {
            return fpath
        }
    }
    return undefined
}

export class ConvertFilenameEncodingIterator implements IterableIterator<string> {
    private readonly fileNameBuffer: Uint8Array
    private index = 0

    constructor(filePath: string) {
        this.fileNameBuffer = xuserdefined.encode(filePath)
    }

    private computeNext() {
        while (true) {
            try {
                const enc = iconvLiteSupportedEncodings[this.index]
                if (!enc) {
                    return
                }
                this.index += 1
                return iconv.decode(this.fileNameBuffer as Buffer, enc)
            } catch (_) { }
        }
    }

    next(): IteratorResult<string, undefined> {
        const value = this.computeNext()
        if (value === undefined) {
            return { value: undefined, done: true }
        } else {
            return { value, done: false }
        }
    }

    [Symbol.iterator]() {
        return this
    }

}
