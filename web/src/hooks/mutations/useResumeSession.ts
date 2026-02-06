import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useResumeSession(
    api: ApiClient | null,
    sessionId: string | null
): {
    resumeSession: () => Promise<string>
    isPending: boolean
    error: Error | null
} {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.resumeSession(sessionId)
        },
        onSuccess: async (newSessionId) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
            if (newSessionId !== sessionId) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.session(newSessionId) })
            }
            if (sessionId) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
            }
        },
    })

    return {
        resumeSession: mutation.mutateAsync,
        isPending: mutation.isPending,
        error: mutation.error,
    }
}
