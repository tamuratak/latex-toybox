import * as esbuild from 'esbuild'

await esbuild.build({
    entryPoints: ['./out/src/main.js'],
    external: ['vscode'],
    bundle: true,
    outfile: './dist/main.js',
    platform: 'node'
})

await esbuild.build({
    entryPoints: ['./src/components/mathpreviewlib/mathjaxpool_worker.ts'],
    bundle: true,
    outfile: './dist/mathjaxpool_worker.js',
    platform: 'node'
  })

await esbuild.build({
    entryPoints: ['./src/components/utensilsparserlib/utensilsparser_worker.ts'],
    bundle: true,
    outfile: './dist/utensilsparserlib/utensilsparser_worker.js',
    platform: 'node'
})
