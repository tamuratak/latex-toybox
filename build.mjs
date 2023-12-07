import * as esbuild from 'esbuild'
import { polyfillNode } from "esbuild-plugin-polyfill-node";

await esbuild.build({
    entryPoints: ['./src/web/web.ts'],
    external: ['vscode', 'child_process', 'process', 'worker_threads'],
    bundle: true,
    minify: false,
    outfile: './dist/web.js',
    platform: 'browser',
    plugins: [
		polyfillNode({
            globals: {
                buffer: false,
                process: false                
            },
            polyfills:{
                child_process: false,
                worker_threads: false,
                process: false
            }
		})
	],
})

await esbuild.build({
    entryPoints: ['./src/components/mathpreviewlib/mathjaxpool_worker.ts'],
    external: ['vscode', 'child_process', 'process', 'worker_threads'],
    bundle: true,
    minify: false,
    outfile: './dist/mathjaxpool_worker.js',
    platform: 'browser',
    plugins: [
		polyfillNode({
            globals: {
                buffer: false,
                process: false
            },
            polyfills:{
                child_process: false,
                worker_threads: false,
                process: false
            }
		}),
	],
  })

await esbuild.build({
    entryPoints: ['./src/components/utensilsparserlib/utensilsparser_worker.ts'],
    external: ['vscode', 'child_process', 'process', 'worker_threads'],
    bundle: true,
    minify: false,
    outfile: './dist/utensilsparser_worker.js',
    platform: 'browser',
    plugins: [
		polyfillNode({
            globals: {
                buffer: false,
                process: false
            },
            polyfills:{
                child_process: false,
                worker_threads: false,
                process: false
            }
		}),
	],
})
