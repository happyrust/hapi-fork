import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'
import type { GitCommandResponse } from '@/types/api'
import { FileIcon } from '@/components/FileIcon'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { queryKeys } from '@/lib/query-keys'
import { langAlias, useShikiHighlighter } from '@/lib/shiki'
import { decodeBase64 } from '@/lib/utils'

function decodePath(value: string): string {
    if (!value) return ''
    const decoded = decodeBase64(value)
    return decoded.ok ? decoded.text : value
}

function BackIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function DiffDisplay(props: { diffContent: string }) {
    const lines = props.diffContent.split('\n')

    return (
        <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-bg)]">
            {lines.map((line, index) => {
                const isAdd = line.startsWith('+') && !line.startsWith('+++')
                const isRemove = line.startsWith('-') && !line.startsWith('---')
                const isHunk = line.startsWith('@@')
                const isHeader = line.startsWith('+++') || line.startsWith('---')

                const className = [
                    'whitespace-pre-wrap px-3 py-0.5 text-xs font-mono',
                    isAdd ? 'bg-[var(--app-diff-added-bg)] text-[var(--app-diff-added-text)]' : '',
                    isRemove ? 'bg-[var(--app-diff-removed-bg)] text-[var(--app-diff-removed-text)]' : '',
                    isHunk ? 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)] font-semibold' : '',
                    isHeader ? 'text-[var(--app-hint)] font-semibold' : ''
                ].filter(Boolean).join(' ')

                const style = isAdd
                    ? { borderLeft: '2px solid var(--app-git-staged-color)' }
                    : isRemove
                        ? { borderLeft: '2px solid var(--app-git-deleted-color)' }
                        : undefined

                return (
                    <div key={`${index}-${line}`} className={className} style={style}>
                        {line || ' '}
                    </div>
                )
            })}
        </div>
    )
}

function FileContentSkeleton() {
    const widths = ['w-full', 'w-11/12', 'w-5/6', 'w-3/4', 'w-2/3', 'w-4/5']

    return (
        <div role="status" aria-live="polite">
            <span className="sr-only">Loading file…</span>
            <div className="animate-pulse space-y-2 rounded-md border border-[var(--app-border)] bg-[var(--app-code-bg)] p-3">
                {Array.from({ length: 12 }).map((_, index) => (
                    <div key={`file-skeleton-${index}`} className={`h-3 ${widths[index % widths.length]} rounded bg-[var(--app-subtle-bg)]`} />
                ))}
            </div>
        </div>
    )
}

function resolveLanguage(path: string): string | undefined {
    const parts = path.split('.')
    if (parts.length <= 1) return undefined
    const ext = parts[parts.length - 1]?.toLowerCase()
    if (!ext) return undefined
    return langAlias[ext] ?? ext
}

function getFileExtension(path: string): string {
    const trimmed = path.trim()
    if (trimmed.startsWith('.') && trimmed.indexOf('.', 1) === -1) {
        return trimmed.slice(1).toLowerCase()
    }
    const parts = trimmed.split('.')
    if (parts.length <= 1) return ''
    return parts[parts.length - 1]?.toLowerCase() ?? ''
}

function getImageMimeType(path: string): string | null {
    const ext = getFileExtension(path)
    // Keep this list small and boring: common raster formats + SVG.
    // We only use this to render a preview in <img>.
    switch (ext) {
        case 'png': return 'image/png'
        case 'jpg':
        case 'jpeg': return 'image/jpeg'
        case 'gif': return 'image/gif'
        case 'webp': return 'image/webp'
        case 'bmp': return 'image/bmp'
        case 'avif': return 'image/avif'
        case 'ico': return 'image/x-icon'
        case 'svg': return 'image/svg+xml'
        default: return null
    }
}

function isBinaryContent(content: string): boolean {
    if (!content) return false
    if (content.includes('\0')) return true
    const nonPrintable = content.split('').filter((char) => {
        const code = char.charCodeAt(0)
        return code < 32 && code !== 9 && code !== 10 && code !== 13
    }).length
    return nonPrintable / content.length > 0.1
}

function extractCommandError(result: GitCommandResponse | undefined): string | null {
    if (!result) return null
    if (result.success) return null
    return result.error ?? result.stderr ?? 'Failed to load diff'
}

export default function FilePage() {
    const { api } = useAppContext()
    const { copied, copy } = useCopyToClipboard()
    const goBack = useAppGoBack()
    const { sessionId } = useParams({ from: '/sessions/$sessionId/file' })
    const search = useSearch({ from: '/sessions/$sessionId/file' })
    const encodedPath = typeof search.path === 'string' ? search.path : ''
    const staged = search.staged
    const [showDiff, setShowDiff] = useState<boolean>(() => {
        return localStorage.getItem('hapi-files-show-diff') !== 'false'
    })

    useEffect(() => {
        localStorage.setItem('hapi-files-show-diff', showDiff ? 'true' : 'false')
    }, [showDiff])

    const filePath = useMemo(() => decodePath(encodedPath), [encodedPath])
    const fileName = filePath.split('/').pop() || filePath || 'File'

    const diffQuery = useQuery({
        queryKey: queryKeys.gitFileDiff(sessionId, filePath, staged),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }
            return await api.getGitDiffFile(sessionId, filePath, staged)
        },
        enabled: showDiff && Boolean(api && sessionId && filePath)
    })

    const fileQuery = useQuery({
        queryKey: queryKeys.sessionFile(sessionId, filePath),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }
            return await api.readSessionFile(sessionId, filePath)
        },
        enabled: Boolean(api && sessionId && filePath)
    })

    const diffContent = diffQuery.data?.success ? (diffQuery.data.stdout ?? '') : ''
    const diffError = extractCommandError(diffQuery.data)
    const diffSuccess = diffQuery.data?.success === true
    const diffFailed = diffQuery.data?.success === false

    const fileContentResult = fileQuery.data
    const decodedContentResult = fileContentResult?.success && fileContentResult.content
        ? decodeBase64(fileContentResult.content)
        : { text: '', ok: true }
    const decodedContent = decodedContentResult.text
    const binaryFile = fileContentResult?.success
        ? !decodedContentResult.ok || isBinaryContent(decodedContent)
        : false

    const imageMimeType = useMemo(() => getImageMimeType(filePath), [filePath])
    const imageDataUrl = useMemo(() => {
        if (!imageMimeType) return null
        if (!fileContentResult?.success || !fileContentResult.content) return null
        return `data:${imageMimeType};base64,${fileContentResult.content}`
    }, [fileContentResult, imageMimeType])

    const language = useMemo(() => resolveLanguage(filePath), [filePath])
    const highlighted = useShikiHighlighter(decodedContent, language)

    const [displayMode, setDisplayMode] = useState<'diff' | 'file'>(() => (showDiff ? 'diff' : 'file'))
    const [hasUserSelectedDisplayMode, setHasUserSelectedDisplayMode] = useState(false)

    const setDisplayModeUser = (mode: 'diff' | 'file') => {
        setHasUserSelectedDisplayMode(true)
        setDisplayMode(mode)
    }

    useEffect(() => {
        if (!showDiff) {
            setDisplayMode('file')
            return
        }

        if (hasUserSelectedDisplayMode) return

        // Prefer preview for images.
        if (imageDataUrl) {
            setDisplayMode('file')
            return
        }
        if (diffSuccess && !diffContent) {
            setDisplayMode('file')
            return
        }
        if (diffFailed) {
            setDisplayMode('file')
        }
    }, [diffSuccess, diffFailed, diffContent, hasUserSelectedDisplayMode, imageDataUrl, showDiff])

    const loading = diffQuery.isLoading || fileQuery.isLoading
    const fileError = fileContentResult && !fileContentResult.success
        ? (fileContentResult.error ?? 'Failed to read file')
        : null
    const missingPath = !filePath
    const diffErrorMessage = showDiff && diffError ? `Diff unavailable: ${diffError}` : null

    return (
        <div className="flex h-full flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3 border-b border-[var(--app-border)]">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{fileName}</div>
                        <div className="truncate text-xs text-[var(--app-hint)]">{filePath || 'Unknown path'}</div>
                    </div>
                </div>
            </div>

            <div className="bg-[var(--app-bg)]">
                <div className="mx-auto w-full max-w-content px-3 py-2 flex items-center gap-2 border-b border-[var(--app-divider)]">
                    <FileIcon fileName={fileName} size={20} />
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--app-hint)]">{filePath}</span>
                    <button
                        type="button"
                        onClick={() => setShowDiff((v) => !v)}
                        className={`shrink-0 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${showDiff
                            ? 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)] hover:text-[var(--app-fg)]'
                            : 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80'
                        }`}
                        title="Toggle diff display"
                    >
                        Diff
                    </button>
                    <button
                        type="button"
                        onClick={() => copy(filePath)}
                        className="shrink-0 rounded p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] transition-colors"
                        title="Copy path"
                    >
                        {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>

            {showDiff && diffContent ? (
                <div className="bg-[var(--app-bg)]">
                    <div className="mx-auto w-full max-w-content px-3 py-2 flex items-center gap-2 border-b border-[var(--app-divider)]">
                        <button
                            type="button"
                            onClick={() => setDisplayModeUser('diff')}
                            className={`rounded px-3 py-1 text-xs font-semibold ${displayMode === 'diff' ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}
                        >
                            Diff
                        </button>
                        <button
                            type="button"
                            onClick={() => setDisplayModeUser('file')}
                            className={`rounded px-3 py-1 text-xs font-semibold ${displayMode === 'file' ? 'bg-[var(--app-button)] text-[var(--app-button-text)] opacity-80' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}
                        >
                            File
                        </button>
                    </div>
                </div>
            ) : null}

            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-content p-4">
                    {diffErrorMessage ? (
                        <div className="mb-3 rounded-md bg-amber-500/10 p-2 text-xs text-[var(--app-hint)]">
                            {diffErrorMessage}
                        </div>
                    ) : null}
                    {missingPath ? (
                        <div className="text-sm text-[var(--app-hint)]">No file path provided.</div>
                    ) : loading ? (
                        <FileContentSkeleton />
                    ) : fileError ? (
                        <div className="text-sm text-[var(--app-hint)]">{fileError}</div>
                    ) : showDiff && displayMode === 'diff' && diffContent ? (
                        <DiffDisplay diffContent={diffContent} />
                    ) : showDiff && displayMode === 'diff' && diffError ? (
                        <div className="text-sm text-[var(--app-hint)]">{diffError}</div>
                    ) : displayMode === 'file' ? (
                        imageDataUrl ? (
                            <div className="overflow-auto rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2">
                                <a
                                    href={imageDataUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mb-2 inline-block text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)] underline"
                                >
                                    Open image in new tab
                                </a>
                                <img
                                    src={imageDataUrl}
                                    alt={fileName}
                                    className="h-auto max-w-full rounded-md"
                                />
                            </div>
                        ) : binaryFile ? (
                            <div className="text-sm text-[var(--app-hint)]">
                                This looks like a binary file. It cannot be displayed.
                            </div>
                        ) : decodedContent ? (
                            <pre className="shiki overflow-auto rounded-md bg-[var(--app-code-bg)] p-3 text-xs font-mono">
                                <code>{highlighted ?? decodedContent}</code>
                            </pre>
                        ) : (
                            <div className="text-sm text-[var(--app-hint)]">File is empty.</div>
                        )
                    ) : (
                        <div className="text-sm text-[var(--app-hint)]">No changes to display.</div>
                    )}
                </div>
            </div>
        </div>
    )
}
