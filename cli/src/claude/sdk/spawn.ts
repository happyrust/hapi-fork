import { execSync } from 'node:child_process'

export type ResolvedClaudeSpawn = {
    command: string
    args: string[]
    shell: boolean
}

let cachedJsRunner: 'bun' | 'node' | null = null

function canRun(cmd: string): boolean {
    try {
        execSync(cmd, { stdio: 'ignore', timeout: 1000 } as any)
        return true
    } catch {
        return false
    }
}

function pickJsRunner(): 'bun' | 'node' {
    if (cachedJsRunner) {
        return cachedJsRunner
    }

    // Prefer bun (per project policy); fallback to node.
    if (canRun('bun --version')) {
        cachedJsRunner = 'bun'
        return cachedJsRunner
    }

    cachedJsRunner = 'node'
    return cachedJsRunner
}

function isWinExecutable(value: string): boolean {
    return value.toLowerCase().endsWith('.exe')
}

function isWinCmdWrapper(value: string): boolean {
    const v = value.toLowerCase()
    return v.endsWith('.cmd') || v.endsWith('.bat')
}

export function resolveClaudeSpawn(pathToClaudeCodeExecutable: string, args: string[]): ResolvedClaudeSpawn {
    let command = pathToClaudeCodeExecutable
    const nextArgs = [...args]

    // Default behavior: use shell on Windows for command resolution.
    // We'll disable it for direct executable/script runs where it's not needed.
    let shell = process.platform === 'win32'

    if (command.endsWith('.js')) {
        // For JS entrypoints (global npm install), run via bun/node directly.
        const runner = pickJsRunner()
        nextArgs.unshift(command)
        command = runner
        shell = false
        return { command, args: nextArgs, shell }
    }

    if (process.platform === 'win32') {
        if (isWinExecutable(command)) {
            shell = false
        } else if (isWinCmdWrapper(command)) {
            shell = true
        } else {
            // Keep shell=true for bare commands (e.g. "claude") and unknown wrappers.
            shell = true
        }
    }

    return { command, args: nextArgs, shell }
}

