export function useIpc() {
  const maestro = window.maestro;

  // System
  async function getHealth() {
    return maestro.system.getHealth();
  }

  // Sessions
  async function spawnSession(params: {
    agentId: string;
    task: string;
    model?: string;
    maxTurns?: number;
    projectId?: string | null;
    taskId?: string | null;
    interactive?: boolean;
    resumeSessionId?: string;
    resumeConversationId?: string;
    projectPath?: string;
  }) {
    return maestro.sessions.spawn(params);
  }

  async function stopSession(sessionId: string, force?: boolean) {
    return maestro.sessions.stop(sessionId, force);
  }

  async function listSessions(limit?: number) {
    return maestro.sessions.list(limit);
  }

  async function listSessionsByTask(taskId: string) {
    return maestro.sessions.listByTask(taskId);
  }

  async function listSessionsByProject(projectId: string) {
    return maestro.sessions.listByProject(projectId);
  }

  async function getActiveSessions() {
    return maestro.sessions.getActive();
  }

  async function getOutputBuffer(ptyId: string) {
    return maestro.sessions.getOutputBuffer(ptyId);
  }

  async function getSessionLog(sessionId: string) {
    return maestro.sessions.getLog(sessionId);
  }

  async function previewPrompt(agentId: string, projectId?: string) {
    return maestro.sessions.previewPrompt(agentId, projectId);
  }

  async function assignTaskToSession(params: {
    sessionId: string;
    taskId: string;
    taskTitle: string;
    taskDescription: string;
  }) {
    return maestro.sessions.assignTask(params);
  }

  async function sendDelegation(params: {
    sourceSessionId: string;
    targetSessionId: string;
    instruction: string;
  }) {
    return maestro.sessions.sendDelegation(params);
  }

  async function listDelegations() {
    return maestro.sessions.listDelegations();
  }

  async function requestSummary(sessionId: string) {
    return maestro.sessions.requestSummary(sessionId);
  }

  async function getSessionSummaries(sessionId: string) {
    return maestro.sessions.getSummaries(sessionId);
  }

  async function scanResumableSessions(limit?: number) {
    return maestro.sessions.scanResumable(limit);
  }

  async function getCostStats(filters?: { projectId?: string; days?: number }) {
    return maestro.sessions.getCostStats(filters);
  }

  // Agents
  async function listAgents(filters?: { department?: string; level?: string; search?: string }) {
    return maestro.agents.list(filters);
  }

  async function getAgent(id: string) {
    return maestro.agents.get(id);
  }

  async function getDepartments() {
    return maestro.agents.getDepartments();
  }

  // Tasks
  async function createTask(params: unknown) {
    return maestro.tasks.create(params);
  }

  async function listTasks(filters?: unknown) {
    return maestro.tasks.list(filters);
  }

  async function getTask(projectId: string, id: string) {
    return maestro.tasks.get(projectId, id);
  }

  async function updateTask(projectId: string, id: string, params: unknown) {
    return maestro.tasks.update(projectId, id, params);
  }

  async function deleteTask(projectId: string, id: string) {
    return maestro.tasks.delete(projectId, id);
  }

  async function transitionTask(projectId: string, taskId: string, toStatus: string) {
    return maestro.tasks.transition({ projectId, taskId, toStatus });
  }

  async function addTaskDependency(projectId: string, taskId: string, dependsOnId: string) {
    return maestro.tasks.addDependency(projectId, taskId, dependsOnId);
  }

  async function removeTaskDependency(projectId: string, taskId: string, dependsOnId: string) {
    return maestro.tasks.removeDependency(projectId, taskId, dependsOnId);
  }

  async function getReadyTasks(projectId: string) {
    return maestro.tasks.getReady(projectId);
  }

  async function getTaskSessionCounts(taskIds: string[]) {
    return maestro.tasks.getSessionCounts(taskIds);
  }

  // Sprints
  async function createSprint(params: { projectId: string; name: string; goal?: string; sprintType?: string }) {
    return maestro.sprints.create(params);
  }

  async function listSprints(projectId: string) {
    return maestro.sprints.list(projectId);
  }

  async function getSprint(id: string) {
    return maestro.sprints.get(id);
  }

  async function startSprint(id: string) {
    return maestro.sprints.start(id);
  }

  async function enterSprintReview(id: string) {
    return maestro.sprints.enterReview(id);
  }

  async function completeSprint(id: string) {
    return maestro.sprints.complete(id);
  }

  async function getSprintStatus(id: string) {
    return maestro.sprints.getStatus(id);
  }

  // Projects
  async function createProject(params: { name: string; description?: string; template?: string; workDir?: string }) {
    return maestro.projects.create(params);
  }

  async function selectFolder() {
    return maestro.system.selectFolder();
  }

  async function listProjects() {
    return maestro.projects.list();
  }

  async function getProject(id: string) {
    return maestro.projects.get(id);
  }

  async function updateProject(id: string, params: unknown) {
    return maestro.projects.update(id, params);
  }

  async function deleteProject(id: string) {
    return maestro.projects.delete(id);
  }

  async function getProjectBudget(projectId: string) {
    return maestro.projects.getBudget(projectId);
  }

  async function getProjectStats(projectId: string) {
    return maestro.projects.getStats(projectId);
  }

  async function initClaudeDir(projectId: string) {
    return maestro.projects.initClaudeDir(projectId);
  }

  async function getClaudeDir(projectId: string) {
    return maestro.projects.getClaudeDir(projectId);
  }

  // Knowledge
  async function knowledgeListTree() {
    return maestro.knowledge.listTree();
  }

  async function knowledgeReadFile(path: string) {
    return maestro.knowledge.readFile(path);
  }

  async function knowledgeSearch(query: string) {
    return maestro.knowledge.search(query);
  }

  // Gates
  async function createGate(params: {
    projectId: string;
    sprintId?: string | null;
    gateType: string;
  }) {
    return maestro.gates.create(params);
  }

  async function listGates(filters?: unknown) {
    return maestro.gates.list(filters);
  }

  async function getGate(id: string) {
    return maestro.gates.get(id);
  }

  async function submitGate(params: {
    gateId: string;
    submittedBy: string;
    checklist: Record<string, boolean>;
  }) {
    return maestro.gates.submit(params);
  }

  async function reviewGate(params: {
    gateId: string;
    reviewer: string;
    decision: 'approved' | 'rejected';
    comment?: string;
    checklist?: Record<string, boolean>;
    itemReasons?: Record<string, string>;
  }) {
    return maestro.gates.review(params);
  }

  async function getGateChecklists() {
    return maestro.gates.getChecklists();
  }

  async function initGatePipeline(projectId: string, sprintId: string) {
    return maestro.gates.initPipeline({ projectId, sprintId });
  }

  // Settings
  async function getSetting(key: string) {
    return maestro.settings.get(key);
  }

  async function updateSetting(params: { key: string; value: string; category?: string }) {
    return maestro.settings.update(params);
  }

  async function getAllSettings() {
    return maestro.settings.getAll();
  }

  // Git
  async function gitGetStatus(cwd: string) {
    return maestro.git.getStatus(cwd);
  }

  async function gitGetDiff(cwd: string) {
    return maestro.git.getDiff(cwd);
  }

  async function gitGetFileDiff(cwd: string, filePath: string) {
    return maestro.git.getFileDiff(cwd, filePath);
  }

  async function gitGetLog(cwd: string, limit?: number) {
    return maestro.git.getLog(cwd, limit);
  }

  async function gitGetBranches(cwd: string) {
    return maestro.git.getBranches(cwd);
  }

  async function gitCreateWorktree(cwd: string, branch: string, path: string) {
    return maestro.git.createWorktree(cwd, branch, path);
  }

  async function gitRemoveWorktree(cwd: string, path: string) {
    return maestro.git.removeWorktree(cwd, path);
  }

  async function gitListWorktrees(cwd: string) {
    return maestro.git.listWorktrees(cwd);
  }

  async function gitStage(cwd: string, files?: string[]) {
    return maestro.git.stage(cwd, files);
  }

  async function gitCommit(cwd: string, message: string, files?: string[]) {
    return maestro.git.commit(cwd, message, files);
  }

  async function gitPush(cwd: string, remote?: string, branch?: string, setUpstream?: boolean) {
    return maestro.git.push(cwd, remote, branch, setUpstream);
  }

  async function gitPull(cwd: string, remote?: string, branch?: string) {
    return maestro.git.pull(cwd, remote, branch);
  }

  async function gitCreateBranch(cwd: string, branchName: string, checkout?: boolean) {
    return maestro.git.createBranch(cwd, branchName, checkout);
  }

  async function gitCheckout(cwd: string, branchName: string) {
    return maestro.git.checkout(cwd, branchName);
  }

  async function gitDeleteBranch(cwd: string, branchName: string, force?: boolean) {
    return maestro.git.deleteBranch(cwd, branchName, force);
  }

  // Audit
  async function queryAuditLogs(params?: unknown) {
    return maestro.audit.query(params);
  }

  // Hooks
  async function getHookConfig(workDir: string) {
    return maestro.hooks.getConfig(workDir);
  }

  async function updateHookConfig(params: { workDir: string; autoInject?: boolean; stopValidatorEnabled?: boolean }) {
    return maestro.hooks.updateConfig(params);
  }

  async function listHooks(params?: { projectPath?: string }) {
    return maestro.hooks.list(params);
  }

  async function getHook(params: { name: string; scope?: string; projectPath?: string }) {
    return maestro.hooks.get(params);
  }

  async function createHook(params: { name: string; type: string; matcher: string; script: string; scope?: string; projectPath?: string }) {
    return maestro.hooks.create(params);
  }

  async function updateHook(params: { name: string; type: string; matcher: string; script: string; scope?: string; projectPath?: string }) {
    return maestro.hooks.update(params);
  }

  async function deleteHook(params: { name: string; scope?: string; projectPath?: string }) {
    return maestro.hooks.delete(params);
  }

  async function toggleHook(params: { name: string; enabled: boolean; scope?: string; projectPath?: string }) {
    return maestro.hooks.toggle(params);
  }

  async function getHookLogs(filters?: { hookName?: string; result?: string; limit?: number; offset?: number; projectPath?: string; dateRange?: 'today' | '7d' | '30d' | 'all' }) {
    return maestro.hooks.getLogs(filters);
  }

  async function getHookStats(projectPath?: string) {
    return maestro.hooks.getStats(projectPath);
  }

  // Skills
  async function listSkills(projectPath?: string) {
    return maestro.skills.list(projectPath ? { projectPath } : undefined);
  }

  async function getSkill(name: string, scope?: string, projectPath?: string) {
    return maestro.skills.get({ name, scope, projectPath });
  }

  async function createSkill(params: { name: string; content: string; scope?: string; projectPath?: string }) {
    return maestro.skills.create(params);
  }

  async function updateSkill(params: { name: string; content: string; scope?: string; projectPath?: string }) {
    return maestro.skills.update(params);
  }

  async function deleteSkill(name: string, scope?: string, projectPath?: string) {
    return maestro.skills.delete({ name, scope, projectPath });
  }

  async function deploySkill(name: string, projects: string[]) {
    return maestro.skills.deploy({ name, projects });
  }

  async function toggleSkill(name: string, enabled: boolean, scope?: string, projectPath?: string) {
    return maestro.skills.toggle({ name, enabled, scope, projectPath });
  }

  async function exportSkills(names: string[]) {
    return maestro.skills.export({ names });
  }

  async function importSkills(bundle: unknown, onConflict: 'skip' | 'overwrite') {
    return maestro.skills.import({ bundle: bundle as any, onConflict });
  }

  // Messages
  async function sendMessage(params: {
    fromAgent: string;
    toAgent: string;
    content: string;
    projectId?: string | null;
    replyTo?: string | null;
  }) {
    return maestro.messages.send(params);
  }

  async function listMessages(filters?: {
    agent?: string;
    toAgent?: string;
    fromAgent?: string;
    projectId?: string;
    status?: 'pending' | 'delivered' | 'read';
    limit?: number;
  }) {
    return maestro.messages.list(filters);
  }

  async function getMessage(id: string) {
    return maestro.messages.get(id);
  }

  async function markMessageRead(id: string) {
    return maestro.messages.markRead(id);
  }

  async function getMessageUnreadCount(agentId: string, projectId?: string | null) {
    return maestro.messages.getUnreadCount(agentId, projectId);
  }

  // Agent Memory
  async function listAgentMemory(agentId: string, projectId?: string | null) {
    return maestro.memory.list(agentId, projectId);
  }

  async function saveAgentMemory(params: { agentId: string; projectId?: string | null; key: string; value: string }) {
    return maestro.memory.save(params);
  }

  async function deleteAgentMemory(params: { agentId: string; key: string; projectId?: string | null }) {
    return maestro.memory.delete(params);
  }

  // Pitfall
  async function getPitfallOverdue() {
    return maestro.pitfall.getOverdue();
  }

  // PTY
  function ptyInput(ptyId: string, data: string) {
    maestro.pty.input(ptyId, data);
  }

  function ptyResize(ptyId: string, cols: number, rows: number) {
    maestro.pty.resize(ptyId, cols, rows);
  }

  // Clipboard (native Electron clipboard via main process)
  async function readClipboard() {
    return maestro.clipboard.read();
  }

  async function writeClipboard(text: string) {
    return maestro.clipboard.write(text);
  }

  // Event listeners
  function onSessionEvent(callback: (data: unknown) => void) {
    maestro.on.sessionEvent(callback);
  }

  function onSessionStatus(callback: (data: unknown) => void) {
    maestro.on.sessionStatus(callback);
  }

  function onPtyData(callback: (data: { ptyId: string; data: string }) => void) {
    maestro.on.ptyData(callback);
  }

  function onNotification(callback: (data: unknown) => void) {
    maestro.on.notification(callback);
  }

  function onAgentsReloaded(callback: (data: unknown) => void) {
    maestro.on.agentsReloaded(callback);
  }

  function onDelegationReport(callback: (data: unknown) => void) {
    maestro.on.delegationReport(callback);
  }

  // Message events
  function onMessageCreated(callback: (data: unknown) => void) {
    maestro.on.messageCreated(callback);
  }

  function onMessageDelivered(callback: (data: unknown) => void) {
    maestro.on.messageDelivered(callback);
  }

  function onMessageRead(callback: (data: unknown) => void) {
    maestro.on.messageRead(callback);
  }

  // Task events
  function onTaskUpdated(callback: (data: { projectId: string; taskId: string; fromStatus: string; toStatus: string }) => void) {
    maestro.on.taskUpdated(callback);
  }

  // Cost backfill events (fired once per app boot after startup backfill completes)
  function onCostBackfillCompleted(callback: (data: {
    scanned: number;
    candidates: number;
    matched: number;
    written: number;
    totalUsdRecovered: number;
    durationMs: number;
  }) => void) {
    maestro.on.costBackfillCompleted(callback);
  }

  // Project Sync
  async function startProjectSync(projectId: string, workDir: string) {
    return maestro.projectSync.start({ projectId, workDir });
  }

  async function stopProjectSync(projectId: string) {
    return maestro.projectSync.stop({ projectId });
  }

  async function fullProjectSync(projectId: string, workDir: string) {
    return maestro.projectSync.fullSync({ projectId, workDir });
  }

  function onProjectSynced(callback: (data: { projectId: string; type: string; filePath?: string }) => void) {
    maestro.on.projectSynced(callback);
  }

  return {
    // System
    getHealth,
    // Sessions
    spawnSession,
    stopSession,
    listSessions,
    listSessionsByTask,
    listSessionsByProject,
    getActiveSessions,
    getOutputBuffer,
    getSessionLog,
    previewPrompt,
    assignTaskToSession,
    sendDelegation,
    listDelegations,
    requestSummary,
    getSessionSummaries,
    scanResumableSessions,
    getCostStats,
    // Agents
    listAgents,
    getAgent,
    getDepartments,
    // Tasks
    createTask,
    listTasks,
    getTask,
    updateTask,
    deleteTask,
    transitionTask,
    addTaskDependency,
    removeTaskDependency,
    getReadyTasks,
    getTaskSessionCounts,
    // Sprints
    createSprint,
    listSprints,
    getSprint,
    startSprint,
    enterSprintReview,
    completeSprint,
    getSprintStatus,
    // Projects
    createProject,
    listProjects,
    selectFolder,
    getProject,
    updateProject,
    deleteProject,
    getProjectBudget,
    getProjectStats,
    initClaudeDir,
    getClaudeDir,
    // Knowledge
    knowledgeListTree,
    knowledgeReadFile,
    knowledgeSearch,
    // PTY
    ptyInput,
    ptyResize,
    readClipboard,
    writeClipboard,
    // Gates
    createGate,
    listGates,
    getGate,
    submitGate,
    reviewGate,
    getGateChecklists,
    initGatePipeline,
    // Settings
    getSetting,
    updateSetting,
    getAllSettings,
    // Git
    gitGetStatus,
    gitGetDiff,
    gitGetFileDiff,
    gitGetLog,
    gitGetBranches,
    gitCreateWorktree,
    gitRemoveWorktree,
    gitListWorktrees,
    gitStage,
    gitCommit,
    gitPush,
    gitPull,
    gitCreateBranch,
    gitCheckout,
    gitDeleteBranch,
    // Audit
    queryAuditLogs,
    // Hooks
    getHookConfig,
    updateHookConfig,
    listHooks,
    getHook,
    createHook,
    updateHook,
    deleteHook,
    toggleHook,
    getHookLogs,
    getHookStats,
    // Skills
    listSkills,
    getSkill,
    createSkill,
    updateSkill,
    deleteSkill,
    deploySkill,
    toggleSkill,
    exportSkills,
    importSkills,
    // Messages
    sendMessage,
    listMessages,
    getMessage,
    markMessageRead,
    getMessageUnreadCount,
    // Agent Memory
    listAgentMemory,
    saveAgentMemory,
    deleteAgentMemory,
    // Pitfall
    getPitfallOverdue,
    // Events
    onSessionEvent,
    onSessionStatus,
    onPtyData,
    onNotification,
    onAgentsReloaded,
    onDelegationReport,
    // Message events
    onMessageCreated,
    onMessageDelivered,
    onMessageRead,
    // Task events
    onTaskUpdated,
    // Cost backfill events
    onCostBackfillCompleted,
    // Project Sync
    startProjectSync,
    stopProjectSync,
    fullProjectSync,
    onProjectSynced,
  };
}
