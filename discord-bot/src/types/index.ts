// =============================================================================
// TS Types - Discord Bot
// =============================================================================

export interface BotConfig {
  nodeEnv: string;
  discordToken: string;
  alertChannelId: string;
  adminUsers: string[];
  openclawApiUrl: string;
  openclawToken: string;
  emailWhitelist: string[];
}

export interface UserEmailMap {
  discordId: string;
  email: string;
  username: string;
  createdAt: string;
}

export interface ConversationSession {
  discordId: string; // userId or channelId depending on context
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  lastActive: string;
}

export interface ActiveAlert {
  firstSeen: string;
  lastNotified: string;
  errorDetails: string;
}

export interface AlertState {
  activeAlerts: Record<string, ActiveAlert>;
  cpuHighConsecutiveCount: number;
}

// System Metrics parsed from OpenClaw/MCP tools
export interface CpuMetrics {
  usagePercent: number;
  loadAverage1Min: number;
}

export interface MemoryMetrics {
  usagePercent: number;
}

export interface DiskMetrics {
  usagePercent: number;
}

export interface ServiceStatus {
  status: 'OK' | 'ERROR';
  error?: string;
}

export interface DockerContainerInfo {
  name: string;
  status: string;
  healthy: boolean;
}

export interface DockerMetrics {
  unhealthyContainersCount: number;
  containers: DockerContainerInfo[];
}

export interface ServerMetrics {
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  postgres: ServiceStatus;
  rabbitmq: ServiceStatus;
  cloudflared: ServiceStatus;
  docker: DockerMetrics;
  nginx: ServiceStatus;
}
