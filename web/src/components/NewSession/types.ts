export type AgentType = 'claude' | 'codex' | 'gemini' | 'opencode'
export type SessionType = 'simple' | 'worktree'

export const DEFAULT_MODEL: Record<AgentType, string> = {
    claude: 'opus',
    codex: 'gpt-5.3-codex',
    gemini: 'auto',
    opencode: 'auto',
}

export const MODEL_OPTIONS: Record<AgentType, { value: string; label: string }[]> = {
    claude: [
        { value: 'opus', label: 'Opus' },
        { value: 'sonnet', label: 'Sonnet' },
        { value: 'auto', label: 'Auto' },
    ],
    codex: [
        { value: 'gpt-5.3-codex', label: 'GPT 5.3 Codex' },
        { value: 'gpt-5.3-codex-spark', label: 'GPT 5.3 Codex Spark' },
        { value: 'auto', label: 'Auto' },
    ],
    gemini: [
        { value: 'auto', label: 'Auto' },
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
    opencode: [],
}
