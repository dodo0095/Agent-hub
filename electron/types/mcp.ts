/**
 * MCP inter-agent communication types.
 * Used by session-spawn-helpers.ts (T3) and send-message-server.ts (T2).
 */

/** Per-session config written to .maestro-prompts/ and passed to the MCP stdio server. */
export interface AgentMcpConfig {
  /** The agent ID that owns this session. */
  agentId: string;
  /** Agent IDs this session is allowed to message (manages ∪ reportsTo ∪ coordinatesWith). */
  allowedTargets: string[];
  /** Absolute path to the shared inbox directory. */
  inboxDir: string;
  /** Project context (nullable). */
  projectId: string | null;
  /** Max messages per session per hour (default 20). */
  rateLimit: number;
}

/** Claude CLI --mcp-config file format. */
export interface McpServerConfig {
  mcpServers: Record<
    string,
    {
      command: string;
      args: string[];
      type: 'stdio';
    }
  >;
}
