# Architecture of PDF.js viewer

```mermaid
sequenceDiagram
    participant ViewerJS as viewer.js
    participant PDFJS as pdf.mjs
    participant WorkerJS as pdf.worker.mjs
    participant Wasm as wasm files

    ViewerJS->>PDFJS: getDocument({url, ...})
    PDFJS->>WorkerJS: Create PDFWorker
    PDFJS->>WorkerJS: Send PDF data
    WorkerJS-->>PDFJS: Return metadata

    Note right of WorkerJS: PDF parsing
    par WASM usage
        WorkerJS->>Wasm: Load wasm files
        Note right of Wasm: Used for<br> fast image <br>decoding/parsing
        Wasm-->>WorkerJS: Return processing result
    end

    WorkerJS-->>PDFJS: Return rendering commands
    PDFJS-->>ViewerJS: Return PDFDocumentProxy
    ViewerJS->>PDFJS: Request page rendering
    Note right of PDFJS: Rendering page on <br> canvas element
```
