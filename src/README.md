# Overview

[Providers](https://code.visualstudio.com/api/language-extensions/programmatic-language-features#language-features-listing) are defined under `providers/` and are registered in `main.ts`. All other components of the extension are defined under `components/`. These components are properties of the `Extension` class, which is defined in `main.ts` and can be accessed when needed. The `Extension` class is a type of [service locator](https://martinfowler.com/articles/injection.html#UsingAServiceLocator), which is a design pattern that helps manage dependencies in an application.

## Root file

LaTeX Workshop is different from other VS Code extensions in how it treats the root file. Typically, programming language extensions have only one compilation target per workspace. However, LaTeX Workshop dynamically detects the root file and target based on the currently edited document. For more details, see the [wiki](https://github.com/James-Yu/LaTeX-Workshop/wiki/Compile#the-root-file). The `Manager.findRoot()` function handles this process, which works well with multi-root workspaces.

## AST cache

The AST (Abstract Syntax Tree) for LaTeX files is managed by `components/astmanager.ts`. The `AstManager` also handles the parse call.
As long as you access the AST through `AstManager`, the same file won't be parsed multiple times unnecessarily.

## Application Log

When something goes wrong, we always add to log messages what went wrong with `Extension.logger`. It is much beneficial for debugging.

## VS Code filesystem and virtual workspaces

See [#2669](https://github.com/James-Yu/LaTeX-Workshop/pull/2669).

## EventBus

See [#3193](https://github.com/James-Yu/LaTeX-Workshop/pull/3193).

## workerpool

To avoid blocking the main loop of the extension host process, we execute some heavy tasks in child processes using [workerpool](https://github.com/josdejong/workerpool). `workerpool` is a library that allows us to create a pool of worker threads that can execute tasks in parallel. By using `workerpool`, we can offload CPU-intensive tasks to separate processes and keep the main thread responsive.


See:

- https://github.com/tamuratak/LaTeX-Workshop/blob/main/src/components/utensilsparser.ts
- https://github.com/tamuratak/LaTeX-Workshop/blob/main/src/components/mathpreviewlib/mathjaxpool.ts


## Architecture

```mermaid
flowchart LR
  subgraph VSCode["VS Code"]
    PDFViewer["PDF viewer\n viewer/latexworkshop.ts"]
    SnippetView["Snippet View\n snippetview.js"] --- PDFRenderer["PDF thumbnail renderer\n pdfrenderer.js"]
    MathPreview["Math Preview Panel\n mathpreview.js"]
  end
  subgraph ExtensionHost["VS Code Extension Host"]
    LW["LaTeX Workshop\n main.ts"]
    LW --- Server["Server for PDF viewer \n(Files and WebSocket)\n server.ts "];
    LW --- ParserPool["Parser pool\n syntax.ts"]
    LW --- MathJaxPool["MathJax pool\n mathjaxpool.ts"]
  end
  PDFViewer <--> Server
  Server <--> Browser
  subgraph Browser
    PDFViewerB["PDF viewer\n viewer/latexworkshop.ts"]
  end
  ParserPool --> ParserWorkers["parser workers\n syntax_worker.ts"]
  MathJaxPool --> MathJaxWorkers["MathJax workers\n mathjaxpool_worker.ts "]
  click PDFViewer "https://github.com/James-Yu/LaTeX-Workshop/blob/master/viewer/latexworkshop.ts"
  click PDFViewerB "https://github.com/James-Yu/LaTeX-Workshop/blob/master/viewer/latexworkshop.ts"
  click SnippetView "https://github.com/James-Yu/LaTeX-Workshop/blob/master/resources/snippetview/snippetview.js"
  click PDFRenderer "https://github.com/James-Yu/LaTeX-Workshop/blob/master/resources/snippetview/pdfrenderer.js"
  click MathPreview "https://github.com/James-Yu/LaTeX-Workshop/blob/master/resources/mathpreviewpanel/mathpreview.js"
  click LW "https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/main.ts"
  click Server "https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/components/server.ts"
  click ParserPool "https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/components/parser/syntax.ts"
  click MathJaxPool "https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/providers/preview/mathjaxpool.ts"
  click ParserWorkers "https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/components/parser/syntax_worker.ts"
  click MathJaxWorkers "https://github.com/James-Yu/LaTeX-Workshop/blob/master/src/providers/preview/mathjaxpool_worker.ts"
```

## flowchart

```mermaid
flowchart LR
  ActivationEvents{{Activation Events}}
  Activate["activate"]
  Ready((Ready))
  FindRootFile["Find root file"]
  ActivationEvents --> Activate --> FindRootFile
  ActiveDocumentOpened{{New document opened}}
  Ready --> ActiveDocumentOpened
  ActiveDocumentOpened --> FindRootFile
  ActiveDocumentChanged{{The active tab changed}}
  Ready --> ActiveDocumentChanged
  ActiveDocumentChanged --> FindRootFile
  FindRootFile --> Parse --> Ready
  ActiveDocumentSaved{{The active document saved}}
  Ready --> ActiveDocumentSaved
  ActiveDocumentSaved --> Build
  Build["Build the root file"]
  Parse["Parse files"]
  BuildCommand{{build command invoked}}
  Ready --> BuildCommand
  BuildCommand --> Build
  Build --> Parse
  ActiveTextChanged{{The active document edited}}
  Ready --> ActiveTextChanged
  ActiveTextChanged --> Parse
```