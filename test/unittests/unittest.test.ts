import * as assert from 'node:assert'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as glob from 'glob'

import { runUnitTestWithFixture } from '../utils/ciutils.js'
import { getExtensionDevelopmentPath } from '../utils/runnerutils.js'

type EnvType = {
    name: string,
    snippet?: string,
    detail?: string,
    package?: string
}

type CmdType = {
    command: string,
    snippet?: string,
    documentation?: string,
    package?: string,
    detail?: string,
    postAction?: string,
    label?: string
}

function assertDictKeyNames(keys: string[], expectedKeys: string[], optKeys: string[] = [], message: string): void {
    assert.ok(
        keys.every(k => expectedKeys.includes(k) || optKeys.includes(k)) && expectedKeys.every(k => keys.includes(k)),
        message
    )
}

suite('unit test suite', () => {

    suiteSetup(() => {
        // noop
    })

    runUnitTestWithFixture('fixture001', 'test runnerutils', () => {
        const extensionRoot = getExtensionDevelopmentPath()
        assert.ok(fs.existsSync(path.join(extensionRoot, 'package.json')))
    })

    runUnitTestWithFixture('fixture001', 'check default environment .json completion file', () => {
        const extensionRoot = getExtensionDevelopmentPath()
        const file = `${extensionRoot}/data/environments.json`
        const envs = JSON.parse(fs.readFileSync(file, {encoding: 'utf8'})) as {[key: string]: EnvType}
        assert.notStrictEqual(Object.keys(envs).length, 0)
        Object.keys(envs).forEach(name => {
            assertDictKeyNames(
                Object.keys(envs[name]),
                ['name'],
                ['snippet', 'detail'],
                file + ': ' + JSON.stringify(envs[name])
            )
        })
    })

    runUnitTestWithFixture('fixture001', 'check environments from package .json completion files', () => {
        const extensionRoot = getExtensionDevelopmentPath()
        const files = glob.sync('data/packages/*_env.json', {cwd: extensionRoot})
        files.forEach(file => {
            const envs = JSON.parse(fs.readFileSync(path.join(extensionRoot, file), {encoding: 'utf8'})) as {[key: string]: EnvType}
            assert.notStrictEqual(Object.keys(envs).length, 0)
            Object.keys(envs).forEach(name => {
                assertDictKeyNames(
                    Object.keys(envs[name]),
                    ['name', 'snippet', 'detail', 'package'],
                    [],
                    file + ': ' + JSON.stringify(envs[name])
                )
            })
        })
    })

    runUnitTestWithFixture('fixture001', 'check default commands .json completion file', () => {
        const extensionRoot = getExtensionDevelopmentPath()
        const file = `${extensionRoot}/data/commands.json`
        const cmds = JSON.parse(fs.readFileSync(file, {encoding: 'utf8'})) as {[key: string]: CmdType}
        assert.notStrictEqual(Object.keys(cmds).length, 0)
        Object.keys(cmds).forEach(name => {
            assertDictKeyNames(
                Object.keys(cmds[name]),
                ['command'],
                ['snippet', 'documentation', 'detail', 'postAction', 'label'],
                file + ': ' + JSON.stringify(cmds[name])
            )
        })
    })

    runUnitTestWithFixture('fixture001', 'check commands from package .json completion files', () => {
        const extensionRoot = getExtensionDevelopmentPath()
        const files = glob.sync('data/packages/*_cmd.json', {cwd: extensionRoot})
        files.forEach(file => {
            const cmds = JSON.parse(fs.readFileSync(path.join(extensionRoot, file), {encoding: 'utf8'})) as {[key: string]: CmdType}
            assert.notStrictEqual(Object.keys(cmds).length, 0)
            Object.keys(cmds).forEach(name => {
                assertDictKeyNames(
                    Object.keys(cmds[name]),
                    ['command', 'snippet'],
                    ['documentation', 'detail', 'postAction', 'package', 'label'],
                    file + ': ' + JSON.stringify(cmds[name])
                )
            })
        })
    })


})
