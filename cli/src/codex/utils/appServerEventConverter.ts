import { logger } from '@/ui/logger';

type ConvertedEvent = {
    type: string;
    [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extractItemId(params: Record<string, unknown>): string | null {
    const direct = asString(params.itemId ?? params.item_id ?? params.id);
    if (direct) return direct;

    const item = asRecord(params.item);
    if (item) {
        return asString(item.id ?? item.itemId ?? item.item_id);
    }

    return null;
}

function extractItem(params: Record<string, unknown>): Record<string, unknown> | null {
    const item = asRecord(params.item);
    return item ?? params;
}

function normalizeItemType(value: unknown): string | null {
    const raw = asString(value);
    if (!raw) return null;
    return raw.toLowerCase().replace(/[\s_-]/g, '');
}

function extractCommand(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        const parts = value.filter((part): part is string => typeof part === 'string');
        return parts.length > 0 ? parts.join(' ') : null;
    }
    return null;
}

function extractChanges(value: unknown): Record<string, unknown> | null {
    const record = asRecord(value);
    if (record) return record;

    if (Array.isArray(value)) {
        const changes: Record<string, unknown> = {};
        for (const entry of value) {
            const entryRecord = asRecord(entry);
            if (!entryRecord) continue;
            const path = asString(entryRecord.path ?? entryRecord.file ?? entryRecord.filePath ?? entryRecord.file_path);
            if (path) {
                changes[path] = entryRecord;
            }
        }
        return Object.keys(changes).length > 0 ? changes : null;
    }

    return null;
}

export class AppServerEventConverter {
    private readonly agentMessageBuffers = new Map<string, string>();
    private readonly reasoningBuffers = new Map<string, string>();
    private readonly commandOutputBuffers = new Map<string, string>();
    private readonly commandMeta = new Map<string, Record<string, unknown>>();
    private readonly fileChangeMeta = new Map<string, Record<string, unknown>>();

    handleNotification(method: string, params: unknown): ConvertedEvent[] {
        const events: ConvertedEvent[] = [];
        const paramsRecord = asRecord(params) ?? {};

        // Handle codex/event/* prefixed notifications by unwrapping the inner msg
        if (method.startsWith('codex/event/')) {
            const msg = asRecord(paramsRecord.msg);
            if (!msg) {
                logger.debug('[AppServerEventConverter] codex/event/* notification without msg', { method, params });
                return events;
            }

            const msgType = asString(msg.type);
            if (!msgType) {
                return events;
            }

            // Map codex/event/* inner msg types to standard events
            if (msgType === 'thread_started') {
                const threadId = asString(msg.thread_id ?? msg.threadId);
                if (threadId) {
                    events.push({ type: 'thread_started', thread_id: threadId });
                }
                return events;
            }

            if (msgType === 'task_started') {
                const turnId = asString(msg.turn_id ?? msg.turnId);
                const contextWindow = asNumber(msg.model_context_window ?? msg.modelContextWindow);
                const collabMode = asString(msg.collaboration_mode_kind ?? msg.collaborationModeKind);
                events.push({
                    type: 'task_started',
                    ...(turnId ? { turn_id: turnId } : {}),
                    ...(contextWindow ? { model_context_window: contextWindow } : {}),
                    ...(collabMode ? { collaboration_mode_kind: collabMode } : {})
                });
                return events;
            }

            if (msgType === 'task_complete') {
                const turnId = asString(msg.turn_id ?? msg.turnId);
                events.push({ type: 'task_complete', ...(turnId ? { turn_id: turnId } : {}) });
                return events;
            }

            if (msgType === 'task_failed') {
                const turnId = asString(msg.turn_id ?? msg.turnId);
                const error = asString(msg.error ?? msg.message);
                events.push({ type: 'task_failed', ...(turnId ? { turn_id: turnId } : {}), ...(error ? { error } : {}) });
                return events;
            }

            if (msgType === 'turn_aborted') {
                const turnId = asString(msg.turn_id ?? msg.turnId);
                events.push({ type: 'turn_aborted', ...(turnId ? { turn_id: turnId } : {}) });
                return events;
            }

            if (msgType === 'error') {
                const rawMessage = asString(msg.message);
                let errorMessage = rawMessage;
                // The error message may be a JSON string with a "detail" field
                if (rawMessage) {
                    try {
                        const parsed = JSON.parse(rawMessage);
                        if (parsed && typeof parsed === 'object' && typeof parsed.detail === 'string') {
                            errorMessage = parsed.detail;
                        }
                    } catch {
                        // Not JSON, use as-is
                    }
                }
                const errorInfo = asString(msg.codex_error_info ?? msg.codexErrorInfo);
                if (errorMessage) {
                    events.push({
                        type: 'task_failed',
                        error: errorMessage,
                        ...(errorInfo ? { codex_error_info: errorInfo } : {})
                    });
                }
                return events;
            }

            if (msgType === 'agent_message') {
                const message = asString(msg.message);
                if (message) {
                    events.push({ type: 'agent_message', message });
                }
                return events;
            }

            if (msgType === 'agent_reasoning') {
                const text = asString(msg.text);
                if (text) {
                    events.push({ type: 'agent_reasoning', text });
                }
                return events;
            }

            if (msgType === 'agent_reasoning_delta') {
                const delta = asString(msg.delta);
                if (delta) {
                    events.push({ type: 'agent_reasoning_delta', delta });
                }
                return events;
            }

            if (msgType === 'agent_reasoning_section_break') {
                events.push({ type: 'agent_reasoning_section_break' });
                return events;
            }

            if (msgType === 'user_message') {
                // User message echo, no action needed
                return events;
            }

            if (msgType === 'exec_command_begin') {
                const callId = asString(msg.call_id ?? msg.callId);
                if (callId) {
                    const command = extractCommand(msg.command ?? msg.cmd);
                    const cwd = asString(msg.cwd);
                    const autoApproved = asBoolean(msg.auto_approved ?? msg.autoApproved);
                    const meta: Record<string, unknown> = {};
                    if (command) meta.command = command;
                    if (cwd) meta.cwd = cwd;
                    if (autoApproved !== null) meta.auto_approved = autoApproved;
                    this.commandMeta.set(callId, meta);
                    events.push({ type: 'exec_command_begin', call_id: callId, ...meta });
                }
                return events;
            }

            if (msgType === 'exec_command_end') {
                const callId = asString(msg.call_id ?? msg.callId);
                if (callId) {
                    const meta = this.commandMeta.get(callId) ?? {};
                    const output = asString(msg.output ?? msg.stdout);
                    const stderr = asString(msg.stderr);
                    const error = asString(msg.error);
                    const exitCode = asNumber(msg.exit_code ?? msg.exitCode);
                    events.push({
                        type: 'exec_command_end',
                        call_id: callId,
                        ...meta,
                        ...(output ? { output } : {}),
                        ...(stderr ? { stderr } : {}),
                        ...(error ? { error } : {}),
                        ...(exitCode !== null ? { exit_code: exitCode } : {})
                    });
                    this.commandMeta.delete(callId);
                    this.commandOutputBuffers.delete(callId);
                }
                return events;
            }

            if (msgType === 'exec_approval_request') {
                const callId = asString(msg.call_id ?? msg.callId);
                if (callId) {
                    events.push({ type: 'exec_approval_request', call_id: callId, ...msg });
                }
                return events;
            }

            if (msgType === 'patch_apply_begin') {
                const callId = asString(msg.call_id ?? msg.callId);
                if (callId) {
                    const changes = extractChanges(msg.changes);
                    const autoApproved = asBoolean(msg.auto_approved ?? msg.autoApproved);
                    const meta: Record<string, unknown> = {};
                    if (changes) meta.changes = changes;
                    if (autoApproved !== null) meta.auto_approved = autoApproved;
                    this.fileChangeMeta.set(callId, meta);
                    events.push({ type: 'patch_apply_begin', call_id: callId, ...meta });
                }
                return events;
            }

            if (msgType === 'patch_apply_end') {
                const callId = asString(msg.call_id ?? msg.callId);
                if (callId) {
                    const meta = this.fileChangeMeta.get(callId) ?? {};
                    const stdout = asString(msg.stdout ?? msg.output);
                    const stderr = asString(msg.stderr);
                    const success = asBoolean(msg.success ?? msg.ok ?? msg.applied);
                    events.push({
                        type: 'patch_apply_end',
                        call_id: callId,
                        ...meta,
                        ...(stdout ? { stdout } : {}),
                        ...(stderr ? { stderr } : {}),
                        success: success ?? false
                    });
                    this.fileChangeMeta.delete(callId);
                }
                return events;
            }

            if (msgType === 'turn_diff') {
                const diff = asString(msg.unified_diff ?? msg.unifiedDiff ?? msg.diff);
                if (diff) {
                    events.push({ type: 'turn_diff', unified_diff: diff });
                }
                return events;
            }

            if (msgType === 'token_count') {
                events.push({ type: 'token_count', ...msg });
                return events;
            }

            // Known informational events that don't need conversion
            if (msgType === 'mcp_startup_update' || msgType === 'mcp_startup_complete' ||
                msgType === 'item_started' || msgType === 'item_completed') {
                return events;
            }

            logger.debug('[AppServerEventConverter] Unhandled codex/event/* msg type', { msgType, method });
            return events;
        }

        if (method === 'thread/started' || method === 'thread/resumed') {
            const thread = asRecord(paramsRecord.thread) ?? paramsRecord;
            const threadId = asString(thread.threadId ?? thread.thread_id ?? thread.id);
            if (threadId) {
                events.push({ type: 'thread_started', thread_id: threadId });
            }
            return events;
        }

        if (method === 'turn/started') {
            const turn = asRecord(paramsRecord.turn) ?? paramsRecord;
            const turnId = asString(turn.turnId ?? turn.turn_id ?? turn.id);
            events.push({ type: 'task_started', ...(turnId ? { turn_id: turnId } : {}) });
            return events;
        }

        if (method === 'turn/completed') {
            const turn = asRecord(paramsRecord.turn) ?? paramsRecord;
            const statusRaw = asString(paramsRecord.status ?? turn.status);
            const status = statusRaw?.toLowerCase();
            const turnId = asString(turn.turnId ?? turn.turn_id ?? turn.id);
            const errorMessage = asString(paramsRecord.error ?? paramsRecord.message ?? paramsRecord.reason);

            if (status === 'interrupted' || status === 'cancelled' || status === 'canceled') {
                events.push({ type: 'turn_aborted', ...(turnId ? { turn_id: turnId } : {}) });
                return events;
            }

            if (status === 'failed' || status === 'error') {
                events.push({ type: 'task_failed', ...(turnId ? { turn_id: turnId } : {}), ...(errorMessage ? { error: errorMessage } : {}) });
                return events;
            }

            events.push({ type: 'task_complete', ...(turnId ? { turn_id: turnId } : {}) });
            return events;
        }

        if (method === 'turn/diff/updated') {
            const diff = asString(paramsRecord.diff ?? paramsRecord.unified_diff ?? paramsRecord.unifiedDiff);
            if (diff) {
                events.push({ type: 'turn_diff', unified_diff: diff });
            }
            return events;
        }

        if (method === 'thread/tokenUsage/updated') {
            const info = asRecord(paramsRecord.tokenUsage ?? paramsRecord.token_usage ?? paramsRecord) ?? {};
            events.push({ type: 'token_count', info });
            return events;
        }

        if (method === 'error') {
            const willRetry = asBoolean(paramsRecord.will_retry ?? paramsRecord.willRetry) ?? false;
            if (willRetry) return events;
            const message = asString(paramsRecord.message) ?? asString(asRecord(paramsRecord.error)?.message);
            if (message) {
                events.push({ type: 'task_failed', error: message });
            }
            return events;
        }

        if (method === 'item/agentMessage/delta') {
            const itemId = extractItemId(paramsRecord);
            const delta = asString(paramsRecord.delta ?? paramsRecord.text ?? paramsRecord.message);
            if (itemId && delta) {
                const prev = this.agentMessageBuffers.get(itemId) ?? '';
                this.agentMessageBuffers.set(itemId, prev + delta);
            }
            return events;
        }

        if (method === 'item/reasoning/textDelta') {
            const itemId = extractItemId(paramsRecord) ?? 'reasoning';
            const delta = asString(paramsRecord.delta ?? paramsRecord.text ?? paramsRecord.message);
            if (delta) {
                const prev = this.reasoningBuffers.get(itemId) ?? '';
                this.reasoningBuffers.set(itemId, prev + delta);
                events.push({ type: 'agent_reasoning_delta', delta });
            }
            return events;
        }

        if (method === 'item/reasoning/summaryPartAdded') {
            events.push({ type: 'agent_reasoning_section_break' });
            return events;
        }

        if (method === 'item/commandExecution/outputDelta') {
            const itemId = extractItemId(paramsRecord);
            const delta = asString(paramsRecord.delta ?? paramsRecord.text ?? paramsRecord.output ?? paramsRecord.stdout);
            if (itemId && delta) {
                const prev = this.commandOutputBuffers.get(itemId) ?? '';
                this.commandOutputBuffers.set(itemId, prev + delta);
            }
            return events;
        }

        if (method === 'item/started' || method === 'item/completed') {
            const item = extractItem(paramsRecord);
            if (!item) return events;

            const itemType = normalizeItemType(item.type ?? item.itemType ?? item.kind);
            const itemId = extractItemId(paramsRecord) ?? asString(item.id ?? item.itemId ?? item.item_id);

            if (!itemType || !itemId) {
                return events;
            }

            if (itemType === 'agentmessage') {
                if (method === 'item/completed') {
                    const text = asString(item.text ?? item.message ?? item.content) ?? this.agentMessageBuffers.get(itemId);
                    if (text) {
                        events.push({ type: 'agent_message', message: text });
                    }
                    this.agentMessageBuffers.delete(itemId);
                }
                return events;
            }

            if (itemType === 'reasoning') {
                if (method === 'item/completed') {
                    const text = asString(item.text ?? item.message ?? item.content) ?? this.reasoningBuffers.get(itemId);
                    if (text) {
                        events.push({ type: 'agent_reasoning', text });
                    }
                    this.reasoningBuffers.delete(itemId);
                }
                return events;
            }

            if (itemType === 'commandexecution') {
                if (method === 'item/started') {
                    const command = extractCommand(item.command ?? item.cmd ?? item.args);
                    const cwd = asString(item.cwd ?? item.workingDirectory ?? item.working_directory);
                    const autoApproved = asBoolean(item.autoApproved ?? item.auto_approved);
                    const meta: Record<string, unknown> = {};
                    if (command) meta.command = command;
                    if (cwd) meta.cwd = cwd;
                    if (autoApproved !== null) meta.auto_approved = autoApproved;
                    this.commandMeta.set(itemId, meta);

                    events.push({
                        type: 'exec_command_begin',
                        call_id: itemId,
                        ...meta
                    });
                }

                if (method === 'item/completed') {
                    const meta = this.commandMeta.get(itemId) ?? {};
                    const output = asString(item.output ?? item.result ?? item.stdout) ?? this.commandOutputBuffers.get(itemId);
                    const stderr = asString(item.stderr);
                    const error = asString(item.error);
                    const exitCode = asNumber(item.exitCode ?? item.exit_code ?? item.exitcode);
                    const status = asString(item.status);

                    events.push({
                        type: 'exec_command_end',
                        call_id: itemId,
                        ...meta,
                        ...(output ? { output } : {}),
                        ...(stderr ? { stderr } : {}),
                        ...(error ? { error } : {}),
                        ...(exitCode !== null ? { exit_code: exitCode } : {}),
                        ...(status ? { status } : {})
                    });

                    this.commandMeta.delete(itemId);
                    this.commandOutputBuffers.delete(itemId);
                }

                return events;
            }

            if (itemType === 'filechange') {
                if (method === 'item/started') {
                    const changes = extractChanges(item.changes ?? item.change ?? item.diff);
                    const autoApproved = asBoolean(item.autoApproved ?? item.auto_approved);
                    const meta: Record<string, unknown> = {};
                    if (changes) meta.changes = changes;
                    if (autoApproved !== null) meta.auto_approved = autoApproved;
                    this.fileChangeMeta.set(itemId, meta);

                    events.push({
                        type: 'patch_apply_begin',
                        call_id: itemId,
                        ...meta
                    });
                }

                if (method === 'item/completed') {
                    const meta = this.fileChangeMeta.get(itemId) ?? {};
                    const stdout = asString(item.stdout ?? item.output);
                    const stderr = asString(item.stderr);
                    const success = asBoolean(item.success ?? item.ok ?? item.applied ?? item.status === 'completed');

                    events.push({
                        type: 'patch_apply_end',
                        call_id: itemId,
                        ...meta,
                        ...(stdout ? { stdout } : {}),
                        ...(stderr ? { stderr } : {}),
                        success: success ?? false
                    });

                    this.fileChangeMeta.delete(itemId);
                }

                return events;
            }
        }

        logger.debug('[AppServerEventConverter] Unhandled notification', { method, params });
        return events;
    }

    reset(): void {
        this.agentMessageBuffers.clear();
        this.reasoningBuffers.clear();
        this.commandOutputBuffers.clear();
        this.commandMeta.clear();
        this.fileChangeMeta.clear();
    }
}
