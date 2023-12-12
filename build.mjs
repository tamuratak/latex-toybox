import * as esbuild from 'esbuild'
import { polyfillNode } from "esbuild-plugin-polyfill-node";
import { resolve } from "path";


const watch = process.argv.includes('--watch') || process.argv.includes('-w')

/**
 * @type {import('esbuild').BuildOptions}
 */
const config = {
    entryPoints: ['./src/web/mainonweb.ts'],
    external: ['vscode', 'child_process', 'worker_threads'],
    bundle: true,
    minify: false,
    outfile: './dist/main.js',
    platform: 'browser',
    format: 'cjs',
    plugins: [
		polyfillNode({
            globals: {
                buffer: false,
                process: true                
            },
            polyfills:{
                child_process: false,
                worker_threads: false
            }
		}),
        PluginInlineWorker()
	],
    sourcemap:'linked',
    logLevel: watch ? 'info' : 'debug'
}

if (watch) {
    const context = await esbuild.context(config)
    await context.watch()
} else {
    await esbuild.build(config)
}

/**
 * https://gist.github.com/manzt/689e4937f5ae998c56af72efc9217ef0
 *
 * @param {Pick<import('esbuild').BuildOptions, 'minify' | 'format' | 'plugins'>} opt
 * @return {import('esbuild').Plugin}
 */
function PluginInlineWorker(opt) {
	const namespace = "inline-worker";
	const prefix = `${namespace}:`;
	return {
		name: namespace,
		setup(build) {
			build.onResolve({ filter: new RegExp(`^${prefix}`) }, (args) => {
				return {
					path: resolve(args.resolveDir, args.path.slice(prefix.length)),
					namespace,
				};
			});
			build.onLoad({ filter: /.*/, namespace }, async (args) => {
				const { outputFiles } = await esbuild.build({
					entryPoints: [args.path],
					bundle: true,
                    write: false,
                    external: ['vscode', 'child_process', 'process', 'worker_threads'],
                    minify: false,
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
                    ]
				});
				if (outputFiles.length !== 1) {
					throw new Error("Too many files built for worker bundle.");
				}
				const { contents } = outputFiles[0];
				const base64 = Buffer.from(contents).toString("base64");
				return {
					loader: "js",
					contents: `module.exports = "data:application/javascript;base64,${base64}";`,
				};
			});
		},
	};
};
