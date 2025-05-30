import * as path from 'node:path'
import * as process from 'node:process'
import * as glob from 'glob'
import * as tmpFile from 'tmp'
import { runTests } from '@vscode/test-electron'
import { getExtensionDevelopmentPath } from './utils/runnerutils.js'


async function runTestsOnEachFixture(targetName: 'build' | 'rootfile' | 'viewer' | 'completion' | 'multiroot-ws' | 'unittest') {
    const extensionDevelopmentPath = getExtensionDevelopmentPath()
    const extensionTestsPath = path.resolve(__dirname, `./${targetName}.index`)
    const tmpdir = tmpFile.dirSync({ unsafeCleanup: true })
    const extTmpdir = tmpFile.dirSync({ unsafeCleanup: true })
    const fixtures = glob.sync(`test/fixtures/${targetName}/*`, { cwd: extensionDevelopmentPath })

    let testBuildWorkspaces: string[] = []
    const fixturePatterns = process.argv.slice(2).filter(s => !/^-/.exec(s))
    if (fixturePatterns.length === 0) {
        testBuildWorkspaces = fixtures
    } else {
        testBuildWorkspaces = fixtures.filter( fixture => {
            return fixturePatterns.some( pat => fixture.includes(pat) )
        })
    }

    for (let testWorkspace of testBuildWorkspaces) {
        if (testWorkspace.includes('multiroot-ws')) {
            testWorkspace += '/resource.code-workspace'
        }
        const nodejsTimeout = setTimeout(() => {
            console.log('runTestsOnEachFixture: Time out')
            process.exit(1)
        }, process.env['CI'] ? 600000 : 60000)
        await runTests({
            version: '1.99.1',
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                testWorkspace,
                '--user-data-dir=' + tmpdir.name,
                '--extensions-dir=' + extTmpdir.name,
                '--lang=C',
                '--log=tamuratak.latex-toybox:debug',
                '--disable-keytar',
                '--disable-telemetry',
                '--disable-gpu'
            ],
            extensionTestsEnv: {
                LATEXTOYBOX_CI: '1'
            }
        })
        clearTimeout(nodejsTimeout)
    }
}

async function main() {
    try {
        await runTestsOnEachFixture('rootfile')
        await runTestsOnEachFixture('build')
        await runTestsOnEachFixture('viewer')
        await runTestsOnEachFixture('completion')
        await runTestsOnEachFixture('multiroot-ws')
        await runTestsOnEachFixture('unittest')
    } catch (_) {
        console.error('Failed to run tests')
        process.exit(1)
    }
}

void main()
