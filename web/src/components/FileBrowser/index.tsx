import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ApiClient } from '@/api/client'
import type { DirectoryEntry } from '@/types/api'
import { Spinner } from '@/components/Spinner'
import { useTranslation } from '@/lib/use-translation'
import { FolderIcon, FileIcon, ChevronUpIcon, HomeIcon, RefreshIcon, EyeIcon, EyeOffIcon } from './icons'

interface FileBrowserProps {
    api: ApiClient
    machineId: string
    initialPath?: string
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelect: (path: string) => void
}

export function FileBrowser(props: FileBrowserProps) {
    const { api, machineId, initialPath, open, onOpenChange, onSelect } = props
    const { t } = useTranslation()

    const [currentPath, setCurrentPath] = useState(initialPath ?? '')
    const [entries, setEntries] = useState<DirectoryEntry[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showHidden, setShowHidden] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(-1)
    const listRef = useRef<HTMLDivElement>(null)

    const loadDirectory = useCallback(async (path: string) => {
        setIsLoading(true)
        setError(null)
        setSelectedIndex(-1)
        try {
            const result = await api.browseDirectory(machineId, path)
            if (result.success && result.entries) {
                setEntries(result.entries)
                setCurrentPath(result.currentPath ?? path)
            } else {
                setError(result.error ?? t('fileBrowser.error.loadFailed'))
                setEntries([])
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : t('fileBrowser.error.loadFailed'))
            setEntries([])
        } finally {
            setIsLoading(false)
        }
    }, [api, machineId, t])

    useEffect(() => {
        if (open) {
            loadDirectory(initialPath ?? '')
        }
    }, [open, initialPath, loadDirectory])

    // Filter hidden files
    const filteredEntries = useMemo(() => {
        if (showHidden) return entries
        return entries.filter(entry => !entry.name.startsWith('.'))
    }, [entries, showHidden])

    // Only show directories for selection
    const directories = useMemo(() =>
        filteredEntries.filter(e => e.type === 'directory'),
        [filteredEntries]
    )

    const handleEntryClick = useCallback((entry: DirectoryEntry) => {
        if (entry.type === 'directory') {
            const separator = currentPath.includes('\\') ? '\\' : '/'
            const newPath = currentPath
                ? `${currentPath}${separator}${entry.name}`
                : entry.name
            loadDirectory(newPath)
        }
    }, [currentPath, loadDirectory])

    const handleEntryDoubleClick = useCallback((entry: DirectoryEntry) => {
        if (entry.type === 'directory') {
            const separator = currentPath.includes('\\') ? '\\' : '/'
            const newPath = currentPath
                ? `${currentPath}${separator}${entry.name}`
                : entry.name
            onSelect(newPath)
            onOpenChange(false)
        }
    }, [currentPath, onSelect, onOpenChange])

    const handleGoUp = useCallback(() => {
        if (!currentPath) return
        const normalized = currentPath.replace(/\\/g, '/')
        const parts = normalized.split('/').filter(Boolean)

        if (parts.length <= 1) {
            if (normalized.startsWith('/')) {
                loadDirectory('/')
            } else {
                // Windows root like C:
                loadDirectory(parts[0] + '/')
            }
        } else {
            parts.pop()
            const parentPath = normalized.startsWith('/')
                ? '/' + parts.join('/')
                : parts.join('/')
            loadDirectory(parentPath)
        }
    }, [currentPath, loadDirectory])

    const handleGoHome = useCallback(() => {
        loadDirectory('')
    }, [loadDirectory])

    const handleRefresh = useCallback(() => {
        loadDirectory(currentPath)
    }, [currentPath, loadDirectory])

    const handleSelectCurrent = useCallback(() => {
        if (currentPath) {
            onSelect(currentPath)
            onOpenChange(false)
        }
    }, [currentPath, onSelect, onOpenChange])

    const handleBreadcrumbClick = useCallback((index: number) => {
        const normalized = currentPath.replace(/\\/g, '/')
        const parts = normalized.split('/').filter(Boolean)
        const isWindows = !normalized.startsWith('/')

        if (index === -1) {
            // Root clicked
            loadDirectory(isWindows ? parts[0] + '/' : '/')
            return
        }

        const targetParts = parts.slice(0, index + 1)
        const targetPath = isWindows
            ? targetParts.join('/')
            : '/' + targetParts.join('/')
        loadDirectory(targetPath)
    }, [currentPath, loadDirectory])

    // Keyboard navigation
    const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (isLoading) return

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault()
                setSelectedIndex(prev =>
                    prev < filteredEntries.length - 1 ? prev + 1 : prev
                )
                break
            case 'ArrowUp':
                event.preventDefault()
                setSelectedIndex(prev => prev > 0 ? prev - 1 : 0)
                break
            case 'Enter':
                event.preventDefault()
                if (selectedIndex >= 0 && selectedIndex < filteredEntries.length) {
                    const entry = filteredEntries[selectedIndex]
                    if (entry) {
                        handleEntryClick(entry)
                    }
                }
                break
            case 'Backspace':
                event.preventDefault()
                handleGoUp()
                break
            case 'Escape':
                event.preventDefault()
                onOpenChange(false)
                break
        }
    }, [isLoading, filteredEntries, selectedIndex, handleEntryClick, handleGoUp, onOpenChange])

    // Scroll selected item into view
    useEffect(() => {
        if (selectedIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll('[data-entry]')
            const selectedItem = items[selectedIndex]
            if (selectedItem) {
                selectedItem.scrollIntoView({ block: 'nearest' })
            }
        }
    }, [selectedIndex])

    const formatSize = (size?: number) => {
        if (size === undefined) return ''
        if (size < 1024) return `${size} B`
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
        if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
        return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
    }

    // Parse path into breadcrumb parts
    const breadcrumbs = useMemo(() => {
        if (!currentPath) return []
        const normalized = currentPath.replace(/\\/g, '/')
        return normalized.split('/').filter(Boolean)
    }, [currentPath])

    const isWindowsPath = currentPath && !currentPath.startsWith('/')

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t('fileBrowser.title')}</DialogTitle>
                </DialogHeader>

                {/* Toolbar */}
                <div
                    className="flex items-center gap-2 px-1 py-2 border-b border-[var(--app-border)]"
                    onKeyDown={handleKeyDown}
                    tabIndex={0}
                >
                    <button
                        type="button"
                        onClick={handleGoUp}
                        className="p-1.5 rounded hover:bg-[var(--app-subtle-bg)] transition-colors"
                        title={t('fileBrowser.goUp')}
                    >
                        <ChevronUpIcon className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={handleGoHome}
                        className="p-1.5 rounded hover:bg-[var(--app-subtle-bg)] transition-colors"
                        title={t('fileBrowser.goHome')}
                    >
                        <HomeIcon className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={handleRefresh}
                        className="p-1.5 rounded hover:bg-[var(--app-subtle-bg)] transition-colors"
                        title={t('fileBrowser.refresh')}
                    >
                        <RefreshIcon className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowHidden(!showHidden)}
                        className={`p-1.5 rounded transition-colors ${showHidden ? 'bg-[var(--app-subtle-bg)]' : 'hover:bg-[var(--app-subtle-bg)]'}`}
                        title={showHidden ? t('fileBrowser.hideHidden') : t('fileBrowser.showHidden')}
                    >
                        {showHidden ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
                    </button>

                    {/* Breadcrumb navigation */}
                    <div className="flex-1 flex items-center gap-1 px-2 py-1 text-sm bg-[var(--app-bg)] rounded border border-[var(--app-border)] overflow-x-auto">
                        <button
                            type="button"
                            onClick={() => handleBreadcrumbClick(-1)}
                            className="hover:text-[var(--app-link)] transition-colors flex-shrink-0"
                        >
                            {isWindowsPath ? breadcrumbs[0] : '/'}
                        </button>
                        {breadcrumbs.slice(isWindowsPath ? 1 : 0).map((part, index) => (
                            <span key={index} className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-[var(--app-hint)]">/</span>
                                <button
                                    type="button"
                                    onClick={() => handleBreadcrumbClick(isWindowsPath ? index + 1 : index)}
                                    className="hover:text-[var(--app-link)] transition-colors"
                                >
                                    {part}
                                </button>
                            </span>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div
                    ref={listRef}
                    className="flex-1 overflow-y-auto min-h-[300px]"
                    onKeyDown={handleKeyDown}
                    tabIndex={0}
                >
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <Spinner />
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-full text-sm text-red-500">
                            {error}
                        </div>
                    ) : filteredEntries.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-sm text-[var(--app-hint)]">
                            {t('fileBrowser.empty')}
                        </div>
                    ) : (
                        <div className="divide-y divide-[var(--app-divider)]">
                            {filteredEntries.map((entry, index) => (
                                <button
                                    key={entry.name}
                                    type="button"
                                    data-entry
                                    onClick={() => {
                                        setSelectedIndex(index)
                                        handleEntryClick(entry)
                                    }}
                                    onDoubleClick={() => handleEntryDoubleClick(entry)}
                                    className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-left ${
                                        index === selectedIndex
                                            ? 'bg-[var(--app-subtle-bg)]'
                                            : 'hover:bg-[var(--app-subtle-bg)]'
                                    }`}
                                    disabled={entry.type === 'other'}
                                >
                                    <span className="flex-shrink-0">
                                        {entry.type === 'directory' ? (
                                            <FolderIcon className="h-5 w-5 text-amber-500" />
                                        ) : (
                                            <FileIcon className="h-5 w-5 text-[var(--app-hint)]" />
                                        )}
                                    </span>
                                    <span className="flex-1 truncate text-sm">
                                        {entry.name}
                                    </span>
                                    {entry.type === 'file' && entry.size !== undefined && (
                                        <span className="text-xs text-[var(--app-hint)]">
                                            {formatSize(entry.size)}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--app-border)]">
                    <div className="text-xs text-[var(--app-hint)]">
                        {t('fileBrowser.stats', {
                            folders: directories.length,
                            files: filteredEntries.filter(e => e.type === 'file').length
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="px-3 py-1.5 text-sm rounded-md hover:bg-[var(--app-subtle-bg)] transition-colors"
                        >
                            {t('fileBrowser.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleSelectCurrent}
                            disabled={!currentPath}
                            className="px-3 py-1.5 text-sm rounded-md bg-[var(--app-link)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {t('fileBrowser.select')}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
