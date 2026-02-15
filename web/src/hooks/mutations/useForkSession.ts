import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useForkSession(
    api: ApiClient | null,
    sessionId: string | null
): {
    forkSession: () => Promise<string>
    isPending: boolean
    error: Error | null
} {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.forkSession(sessionId)
        },
        onSuccess: async (newSessionId) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
            await queryClient.invalidateQueries({ queryKey: queryKeys.session(newSessionId) })
        },
    })

    return {
        forkSession: mutation.mutateAsync,
        isPending: mutation.isPending,
        error: mutation.error,
    }
}
