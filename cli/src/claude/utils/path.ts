import { homedir } from "node:os";
import { join, resolve, posix as pathPosix } from "node:path";

export function getProjectPath(workingDirectory: string) {
    // On Windows, path.resolve('/Users/...') injects the current drive (e.g. 'D:\\Users\\...'),
    // which changes the derived projectId and breaks cross-platform determinism.
    // Treat POSIX-style absolute paths as already-absolute and normalize them using posix rules.
    const resolvedWorkingDir = workingDirectory.startsWith('/')
        ? pathPosix.normalize(workingDirectory)
        : resolve(workingDirectory);

    const projectId = resolvedWorkingDir.replace(/[^a-zA-Z0-9]/g, '-');
    const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    return join(claudeConfigDir, 'projects', projectId);
}
