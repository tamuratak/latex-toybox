import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'

import type { IContexAwareProvider, IProvider } from './completionlib/interface.js'
import { Citation } from './completionlib/citation.js'
import { DocumentClass } from './completionlib/documentclass.js'
import { Command } from './completionlib/command.js'
import type { CmdItemEntry } from './completionlib/command.js'
import { Environment } from './completionlib/environment.js'
import type { EnvItemEntry } from './completionlib/environment.js'
import { LabelDefinition } from './completionlib/labeldefinition.js'
import { Package } from './completionlib/package.js'
import { Input, Import, SubImport } from './completionlib/input.js'
import { Glossary } from './completionlib/glossary.js'
import { readFilePath } from '../lib/lwfs/lwfs.js'
import { BracketReplacer } from './completionlib/bracketreplacer.js'
import { CommandRemover } from './completionlib/commandremover.js'
import { CommandReplacer } from './completionlib/commandreplacer.js'
import { EnvCloser } from './completionlib/envcloser.js'
import { EnvRename } from './completionlib/envrename.js'
import { CommandAdder } from './completionlib/commandadder.js'
import type { LatexAstManager } from '../components/astmanager.js'
import type { GraphicsPreview } from '../components/graphicspreview.js'
import type { MathPreview } from '../components/mathpreview.js'
import { FileKind, ReferenceKind } from './completionlib/completionkind.js'


type DataEnvsJsonType = typeof import('../../data/environments.json')
type DataCmdsJsonType = typeof import('../../data/commands.json')
type DataLatexMathSymbolsJsonType = typeof import('../../data/packages/latex-mathsymbols_cmd.json')

// Note that the order of the following array affects the result of completions.
// 'command' must be at the last because it matches any commands.
const CompletionType = ['citation', 'reference', 'environment', 'package', 'documentclass', 'input', 'subimport', 'import', 'includeonly', 'glossary', 'command'] as const
type CompletionType = typeof CompletionType[number]

export class Completer implements vscode.CompletionItemProvider {
    readonly citation: Citation
    readonly command: Command
    private readonly documentClass: DocumentClass
    private readonly environment: Environment
    readonly reference: LabelDefinition
    private readonly package: Package
    readonly input: Input
    private readonly import: Import
    private readonly subImport: SubImport
    readonly glossary: Glossary
    private readonly bracketReplacer: BracketReplacer
    private readonly commandAdder: CommandAdder
    private readonly commandRemover: CommandRemover
    private readonly commandReplacer: CommandReplacer
    private readonly envCloser: EnvCloser
    private readonly envRename: EnvRename
    readonly readyPromise: Promise<void>

    constructor(
        private readonly extension: {
            readonly latexAstManager: LatexAstManager,
            readonly graphicsPreview: GraphicsPreview,
            readonly mathPreview: MathPreview
        } & ConstructorParameters<typeof Citation>[0] &
            ConstructorParameters<typeof Environment>[0] &
            ConstructorParameters<typeof Command>[0] &
            ConstructorParameters<typeof DocumentClass>[0] &
            ConstructorParameters<typeof LabelDefinition>[0]
    ) {
        this.citation = new Citation(extension)
        this.environment = new Environment(extension) // Must be created before command
        this.command = new Command(extension, this.environment)
        this.documentClass = new DocumentClass(extension)
        this.reference = new LabelDefinition(extension)
        this.package = new Package(extension)
        this.input = new Input(extension)
        this.import = new Import(extension)
        this.subImport = new SubImport(extension)
        this.glossary = new Glossary(extension)
        this.bracketReplacer = new BracketReplacer()
        this.commandAdder = new CommandAdder(this.command)
        this.commandRemover = new CommandRemover()
        this.commandReplacer = new CommandReplacer()
        this.envCloser = new EnvCloser()
        this.envRename = new EnvRename(this.environment)
        const loadPromise = this.loadDefaultItems().catch((err) => this.extension.logger.error(`Error reading data: ${err}.`))
        this.readyPromise = new Promise((resolve) => Promise.allSettled([
            loadPromise,
            this.command.readyPromise,
            this.environment.readyPromise,
            this.package.readyPromise,
        ]).then(() => resolve()))
    }

    private async loadDefaultItems() {
        const defaultEnvs = await readFilePath(`${this.extension.extensionRoot}/data/environments.json`)
        const defaultCommands = await readFilePath(`${this.extension.extensionRoot}/data/commands.json`)
        const defaultLaTeXMathSymbols = await readFilePath(`${this.extension.extensionRoot}/data/packages/latex-mathsymbols_cmd.json`)
        const env: Record<string, EnvItemEntry> = JSON.parse(defaultEnvs) as DataEnvsJsonType
        const cmds = JSON.parse(defaultCommands) as DataCmdsJsonType
        const maths: Record<string, CmdItemEntry> = JSON.parse(defaultLaTeXMathSymbols) as DataLatexMathSymbolsJsonType
        for (const key of Object.keys(maths)) {
            if (key.match(/\{.*?\}/)) {
                const ent = maths[key]
                const newKey = key.replace(/\{.*?\}/, '')
                delete maths[key]
                maths[newKey] = ent
            }
        }
        Object.assign(maths, cmds)
        // Make sure to initialize environment first
        this.environment.initialize(env)
        this.command.initialize(maths)
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ) {
        const currentLine = document.lineAt(position).text
        if (position.character > 1 && currentLine.substring(position.character - 2, position.character) === '\\\\') {
            return
        }
        const line = currentLine.substring(0, position.character)
        const items = await this.provideContextAwareItems(document, position, token, context)
        for (const type of CompletionType) {
            const suggestions = await this.completion(type, line, {document, position, token, context})
            if (suggestions.length > 0) {
                if (items.length > 0 && suggestions.length > 10) {
                    return items
                } else {
                    return [...suggestions, ...items]
                }
            }
        }
        return items
    }

    async provideContextAwareItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _: vscode.CancellationToken,
        context: vscode.CompletionContext
    ) {
        const providers: IContexAwareProvider[] = [
            this.bracketReplacer,
            this.commandAdder,
            this.commandRemover,
            this.commandReplacer,
            this.envCloser,
            this.envRename
        ].filter(p => p.test(document, position, context))
        let items: vscode.CompletionItem[] = []
        if (providers.length === 0) {
            return []
        }
        let ast: latexParser.LatexAst | undefined
        const needsAst = providers.find((p) => p.needsAst)
        if (needsAst) {
            ast = await this.extension.latexAstManager.getDocAst(document)
        }
        for (const provider of providers) {
            items = [...items, ...provider.provide(document, position, context, ast)]
        }
        return items
    }

    async resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken): Promise<vscode.CompletionItem> {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        if (item.kind === ReferenceKind) {
            if (typeof item.label !== 'string') {
                return item
            }
            const data = this.extension.completer.reference.getLabelDef(item.label)
            if (data === undefined) {
                return item
            }
            if (!configuration.get('hover.ref.enabled')) {
                item.documentation = data.documentation
                return item
            }
            const tex = await this.extension.mathPreview.findHoverOnRef(data, item.label)
            if (tex) {
                const svgDataUrl = await this.extension.mathPreview.renderSvgOnRef(tex, data, token)
                item.documentation = new vscode.MarkdownString(`![equation](${svgDataUrl})`)
                return item
            } else {
                item.documentation = data.documentation
                return item
            }
        } else if (item.kind === FileKind) {
            const preview = configuration.get('intellisense.includegraphics.preview.enabled') as boolean
            if (!preview) {
                return item
            }
            const filePath = item.documentation
            if (typeof filePath !== 'string') {
                return item
            }
            const md = await this.extension.graphicsPreview.renderGraphicsAsMarkdownString(filePath, { height: 190, width: 300 })
            if (md === undefined) {
                return item
            }
            const ret = new vscode.CompletionItem(item.label, FileKind)
            ret.documentation = md
            return ret
        } else {
            return item
        }
    }

    private async completion(
        type: CompletionType,
        line: string,
        args: {
            document: vscode.TextDocument,
            position: vscode.Position,
            token: vscode.CancellationToken,
            context: vscode.CompletionContext
        }
    ) {
        let reg: RegExp | undefined
        let provider: IProvider | undefined
        switch (type) {
            case 'citation':
                reg = /(?:\\[a-zA-Z]*[Cc]ite[a-zA-Z]*\*?(?:\([^[)]*\)){0,2}(?:<[^<>]*>|\[[^[\]]*\]|{[^{}]*})*{([^}]*)$)|(?:\\bibentry{([^}]*)$)/
                provider = this.citation
                break
            case 'reference':
                reg = /(?:\\hyperref\[([^\]]*)(?!\])$)|(?:(?:\\(?!hyper)[a-zA-Z]*ref[a-zA-Z]*\*?(?:\[[^[\]]*\])?){([^}]*)$)|(?:\\[Cc][a-z]*refrange\*?{[^{}]*}{([^}]*)$)/
                provider = this.reference
                break
            case 'environment':
                reg = /(?:\\begin(?:\[[^[\]]*\])?){([^}]*)$/
                provider = this.environment
                break
            case 'command':
                reg = args.document.languageId === 'latex-expl3' ? /\\([a-zA-Z_@]*(?::[a-zA-Z]*)?)$/ : /\\([a-zA-Z]*|(?:left|[Bb]ig{1,2}l)?[({[]?)$/
                provider = this.command
                break
            case 'package':
                reg = /(?:\\usepackage(?:\[[^[\]]*\])*){([^}]*)$/
                provider = this.package
                break
            case 'documentclass':
                reg = /(?:\\documentclass(?:\[[^[\]]*\])*){([^}]*)$/
                provider = this.documentClass
                break
            case 'input':
                reg = /\\(input|include|subfile|includegraphics|includesvg|lstinputlisting|verbatiminput|loadglsentries)\*?(?:\[[^[\]]*\])*{([^}]*)$/
                provider = this.input
                break
            case 'includeonly':
                reg = /\\(includeonly|excludeonly){(?:{[^}]*},)*(?:[^,]*,)*{?([^},]*)$/
                provider = this.input
                break
            case 'import':
                reg = /\\(import|includefrom|inputfrom)\*?(?:{([^}]*)})?{([^}]*)$/
                provider = this.import
                break
            case 'subimport':
                reg = /\\(sub(?:import|includefrom|inputfrom))\*?(?:{([^}]*)})?{([^}]*)$/
                provider = this.subImport
                break
            case 'glossary':
                reg = /\\(gls(?:pl|text|first|fmt(?:text|short|long)|plural|firstplural|name|symbol|desc|disp|user(?:i|ii|iii|iv|v|vi))?|Acr(?:long|full|short)?(?:pl)?|ac[slf]?p?)(?:\[[^[\]]*\])?{([^}]*)$/i
                provider = this.glossary
                break
            default:
                // This shouldn't be possible, so mark as error case in log.
                this.extension.logger.error(`Error - trying to complete unknown type ${type}`)
                return []
        }
        const result = line.match(reg)
        let suggestions: vscode.CompletionItem[] = []
        if (result) {
            suggestions = await provider.provideFrom(result, args)
        }
        return suggestions
    }
}


