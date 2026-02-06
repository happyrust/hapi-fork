/**
 * Utility functions for Claude Code SDK integration
 * Provides helper functions for path resolution and logging
 */

import { spawn, execSync, type ChildProcess, type ExecSyncOptionsWithStringEncoding } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { logger } from '@/ui/logger'
import type { Writable } from 'node:stream'

/**
 * Find Claude executable path on Windows.
 * Returns absolute path to claude.exe for use with shell: false
 */
function findWindowsClaudePath(): string | null {
    const homeDir = homedir()
    const path = require('node:path')

    // Known installation paths for Claude on Windows
    const candidates = [
        path.join(homeDir, '.local', 'bin', 'claude.exe'),
        path.join(homeDir, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
        path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'Anthropic.claude-code_Microsoft.Winget.Source_8wekyb3d8bbwe', 'claude.exe'),
    ]

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            logger.debug(`[Claude SDK] Found Windows claude.exe at: ${candidate}`)
            return candidate
        }
    }

    // Try 'where claude' to find in PATH
    try {
        const result = execSync('where claude.exe', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: homeDir
        }).trim().split('\n')[0].trim()
        if (result && existsSync(result)) {
            logger.debug(`[Claude SDK] Found Windows claude.exe via where: ${result}`)
            return result
        }
    } catch {
        // where didn't find it
    }

    return null
}

/**
 * Try to find globally installed Claude CLI
 * On Windows: Returns absolute path to claude.exe (for shell: false)
 * On Unix: Returns 'claude' if command works, or actual path via which
 * Runs from home directory to avoid local cwd side effects
 */
function findGlobalClaudePath(): string | null {
    const homeDir = homedir()

    // Windows: Always return absolute path for shell: false compatibility
    if (process.platform === 'win32') {
        return findWindowsClaudePath()
    }

    // Unix: Check if 'claude' command works directly from home dir
    try {
        execSync('claude --version', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: homeDir
        })
        logger.debug('[Claude SDK] Global claude command available')
        return 'claude'
    } catch (e) {
        // Ignore
    }

    // FALLBACK for Unix: try which to get actual path
    try {
        const result = execSync('which claude', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: homeDir
        }).trim()
        if (result && existsSync(result)) {
            logger.debug(`[Claude SDK] Found global claude path via which: ${result}`)
            return result
        }
    } catch {
        // which didn't find it
    }

    return null
}

/**
 * Try to find Claude Code JS entrypoint in global npm modules
 */
function findNpmGlobalClaudeJs(): string | null {
    // 1. Direct check in common Windows global npm path
    if (process.platform === 'win32' && process.env.APPDATA) {
        const commonPath = join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
        if (existsSync(commonPath)) return commonPath;
    }

    // 2. Try npm root -g
    try {
        const npmRoot = execSync('npm root -g', { encoding: 'utf-8', timeout: 1000 } as any).trim().replace(/[\r\n]/g, '');
        if (npmRoot) {
            const jsPath = join(npmRoot, '@anthropic-ai', 'claude-code', 'cli.js');
            if (existsSync(jsPath)) return jsPath;
        }
    } catch (e) {}

    return null;
}

/**
 * Resolve any claude command/path to the actual JS file if possible
 */
function resolveToJs(inputPath: string): string {
    if (process.platform !== 'win32') return inputPath;

    let target = inputPath;

    // If it's just 'claude', find where it is
    if (target === 'claude') {
        try {
            const where = execSync('where claude', { encoding: 'utf-8' } as any).trim().split(/[\r\n]+/)[0];
            if (where) target = where;
        } catch (e) {}
    }

    // Try to find neighbor JS (for NPM wrapper .cmd)
    if (target.toLowerCase().endsWith('.cmd')) {
        try {
            const potentialJs = join(dirname(target), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
            if (existsSync(potentialJs)) return potentialJs;
        } catch (e) {}
    }

    // If no JS found, return the original (likely the native .exe or wrapper)
    return target;
}

/**
 * Get default path to Claude Code executable.
 */
export function getDefaultClaudeCodePath(): string {
    // 1. User override
    if (process.env.HAPI_CLAUDE_PATH) {
        return resolveToJs(process.env.HAPI_CLAUDE_PATH);
    }

    // 2. Try NPM JS first (most stable for HAPI if installed)
    const npmJs = findNpmGlobalClaudeJs();
    if (npmJs) return npmJs;

    // 3. Fallback to global command (Native exe/cmd)
    const globalPath = findGlobalClaudePath();
    if (globalPath) {
        return resolveToJs(globalPath);
    }
    return resolveToJs('claude');
}

/**
 * Log debug message
 */
export function logDebug(message: string): void {
    if (process.env.DEBUG) {
        logger.debug(message)
        console.log(message)
    }
}

/**
 * Stream async messages to stdin
 */
export async function streamToStdin(
    stream: AsyncIterable<unknown>,
    stdin: NodeJS.WritableStream,
    abort?: AbortSignal
): Promise<void> {
    for await (const message of stream) {
        if (abort?.aborted) break
        stdin.write(JSON.stringify(message) + '\n')
    }
    stdin.end()
}
