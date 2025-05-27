
## Architecture of VS Code Remote

```mermaid
flowchart TB
    subgraph Local Machine
        MainProcess[Main Process]
        subgraph RendererProcess [Renderer Process]
            workbench.html
        end
        SharedProcess[Shared Process]
        SSHClient@{ label: "SSH Clinet<br/>(port forwarding)" }
    end
    subgraph Remote Machine
        SSHServer@{ label: "SSH Server" }
        VSCodeServer@{ label: "VS Code Server" }
        subgraph ExtensionHostProcess  [ExtensionHost Process]
            Extension@{ shape: procs }
        end
        PTYHostProcess@{ label: "PTY Host Process<br/>(node-pty)" }
        FileWatcherProcess@{ shape: procs, label: "File Watcher Process<br/>(parcel or Node.js watcher)" }
        TerminalProcess@{ shape: procs, label: "Terminal Process" }
        SearchProcess@{ shape: procs, label: "Search Process<br/>(ripgrep)" }
        LanguageServer@{ shape: procs, label: "Language Server" }
        Debugger@{ shape: procs }
    end
    MainProcess -- Electron IPC --- RendererProcess
    MainProcess -- Electron IPC --- SharedProcess
    RendererProcess -- MessagePort IPC --- SharedProcess
    RendererProcess -- multiple connections --- SSHClient
    SSHClient --- SSHServer
    SSHServer -- multiple connections --- VSCodeServer
    VSCodeServer --- ExtensionHostProcess
    VSCodeServer --- FileWatcherProcess
    VSCodeServer --- PTYHostProcess
    PTYHostProcess -- PTY IPC --- TerminalProcess
    ExtensionHostProcess -- Node.js IPC --- SearchProcess
    Extension -- (LSP) --- LanguageServer
    Extension -- (Varies) --- Debugger
```


## Links

- https://github.com/jeanp413/open-remote-ssh/tree/master

The role of the VS Code Remote extension is to establish a connection with the remote machine using SSH, download the VS Code Server on the remote, start the server, and establish port forwarding from the local machine. 

A connection from the renderer process to each process on the remote machine is established via SSH port forwarding and VS Code Server.
