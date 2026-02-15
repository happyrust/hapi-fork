import { useCallback, useRef } from 'react'

const STORAGE_KEY = 'hapi:inputHistory'
const MAX_HISTORY = 50

function loadHistory(): string[] {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return []
}

function saveHistory(history: string[]) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    } catch { /* ignore */ }
}

/**
 * Manages input history with up/down arrow navigation.
 *
 * - `push(text)` — call on send to record a new entry.
 * - `up(currentText)` — returns the previous history entry (or null).
 * - `down()` — returns the next history entry, or the draft text, or null.
 * - `reset()` — resets navigation state (call when user types manually).
 */
export function useInputHistory() {
    // -1 means "not browsing history" (at the draft position)
    const indexRef = useRef(-1)
    // Stash the text the user was typing before they started browsing
    const draftRef = useRef('')

    const push = useCallback((text: string) => {
        const trimmed = text.trim()
        if (!trimmed) return
        const history = loadHistory()
        // Deduplicate: remove if already the most recent entry
        if (history.length > 0 && history[history.length - 1] === trimmed) {
            indexRef.current = -1
            draftRef.current = ''
            return
        }
        history.push(trimmed)
        if (history.length > MAX_HISTORY) {
            history.splice(0, history.length - MAX_HISTORY)
        }
        saveHistory(history)
        indexRef.current = -1
        draftRef.current = ''
    }, [])

    const up = useCallback((currentText: string): string | null => {
        const history = loadHistory()
        if (history.length === 0) return null

        if (indexRef.current === -1) {
            // Starting to browse — save current input as draft
            draftRef.current = currentText
            indexRef.current = history.length - 1
        } else if (indexRef.current > 0) {
            indexRef.current -= 1
        } else {
            // Already at the oldest entry
            return null
        }

        return history[indexRef.current] ?? null
    }, [])

    const down = useCallback((): string | null => {
        if (indexRef.current === -1) return null

        const history = loadHistory()
        if (indexRef.current < history.length - 1) {
            indexRef.current += 1
            return history[indexRef.current] ?? null
        }

        // Back to draft
        indexRef.current = -1
        return draftRef.current
    }, [])

    const reset = useCallback(() => {
        indexRef.current = -1
        draftRef.current = ''
    }, [])

    return { push, up, down, reset }
}
