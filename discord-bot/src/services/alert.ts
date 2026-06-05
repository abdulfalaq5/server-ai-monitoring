import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { OpenClawService } from './openclaw.js';
import { StorageService } from './storage.js';
import { config } from '../config.js';
import { ServerMetrics, AlertState, ActiveAlert } from '../types/index.js';

export class AlertService {
  private static intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the background alert checker loop (runs every 5 minutes).
   */
  static start(client: Client) {
    if (this.intervalId) return;

    console.log('[AlertService] Starting metrics monitoring loop (every 5 minutes)...');

    // Run first check after 10 seconds to allow bot to initialize and settle
    setTimeout(() => this.checkMetrics(client), 10000);

    // Schedule recurring check every 5 minutes
    this.intervalId = setInterval(() => this.checkMetrics(client), 5 * 60 * 1000);
  }

  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private static async checkMetrics(client: Client) {
    console.log('[AlertService] Running background metrics threshold evaluation...');
    
    // Alerting requires a whitelisted email to authenticate the MCP session.
    // We use the first email in the whitelist as the admin service account.
    const adminEmail = config.emailWhitelist[0];
    if (!adminEmail) {
      console.warn('[AlertService] Warning: No email whitelist entries configured. Skipping metrics check.');
      return;
    }

    try {
      // Fetch current metrics from OpenClaw
      const metrics = await OpenClawService.getMetrics(adminEmail);
      const state = StorageService.getAlertState();
      
      const currentAlerts: Record<string, string> = {}; // key: error details

      // 1. Evaluate CPU: usage > 90% for 5 minutes (2 consecutive checks)
      if (metrics.cpu.usagePercent > 90) {
        state.cpuHighConsecutiveCount += 1;
      } else {
        state.cpuHighConsecutiveCount = 0;
      }

      if (state.cpuHighConsecutiveCount >= 2) {
        currentAlerts['cpu_usage_high'] = `CPU usage is ${metrics.cpu.usagePercent.toFixed(1)}% (Limit: 90%) for the last 5 minutes. Load average: ${metrics.cpu.loadAverage1Min}.`;
      }

      // 2. Evaluate Memory: usage > 90%
      if (metrics.memory.usagePercent > 90) {
        currentAlerts['memory_usage_high'] = `RAM usage is ${metrics.memory.usagePercent.toFixed(1)}% (Limit: 90%).`;
      }

      // 3. Evaluate Disk: usage > 90%
      if (metrics.disk.usagePercent > 90) {
        currentAlerts['disk_usage_high'] = `Disk usage is ${metrics.disk.usagePercent.toFixed(1)}% (Limit: 90%).`;
      }

      // 4. Evaluate PostgreSQL
      if (metrics.postgres.status === 'ERROR') {
        currentAlerts['postgres_down'] = metrics.postgres.error || 'Connection timeout or unreachable.';
      }

      // 5. Evaluate RabbitMQ
      if (metrics.rabbitmq.status === 'ERROR') {
        currentAlerts['rabbitmq_down'] = metrics.rabbitmq.error || 'Unreachable or Management API failure.';
      }

      // 6. Evaluate Cloudflare Tunnel
      if (metrics.cloudflared.status === 'ERROR') {
        currentAlerts['cloudflare_disconnected'] = metrics.cloudflared.error || 'Tunnel disconnected or zone unreachable.';
      }

      // 7. Evaluate Nginx
      if (metrics.nginx.status === 'ERROR') {
        currentAlerts['nginx_down'] = metrics.nginx.error || 'Nginx service process not running.';
      }

      // 8. Evaluate Docker Unhealthy Containers
      if (metrics.docker.unhealthyContainersCount > 0) {
        const unhealthyList = metrics.docker.containers
          .filter(c => !c.healthy)
          .map(c => `${c.name} (${c.status})`)
          .join(', ');
        currentAlerts['docker_unhealthy'] = `Found ${metrics.docker.unhealthyContainersCount} unhealthy Docker container(s): ${unhealthyList}`;
      }

      // Process Alerts State
      const now = new Date().toISOString();
      const updatedActiveAlerts: Record<string, ActiveAlert> = { ...state.activeAlerts };
      const alertKeys = [
        'cpu_usage_high',
        'memory_usage_high',
        'disk_usage_high',
        'postgres_down',
        'rabbitmq_down',
        'cloudflare_disconnected',
        'nginx_down',
        'docker_unhealthy',
      ];

      for (const key of alertKeys) {
        const hasAlert = key in currentAlerts;
        const wasActive = key in state.activeAlerts;

        if (hasAlert) {
          const errorMsg = currentAlerts[key];
          if (!wasActive) {
            // New Alert
            console.log(`[AlertService] Alert TRIGGERED: ${key} -> ${errorMsg}`);
            updatedActiveAlerts[key] = {
              firstSeen: now,
              lastNotified: now,
              errorDetails: errorMsg,
            };
            await this.sendAlertNotification(client, key, errorMsg, false);
          } else {
            // Existing Alert - check cooldown (15 minutes = 900,000 ms)
            const active = state.activeAlerts[key];
            const lastNotifiedMs = new Date(active.lastNotified).getTime();
            const nowMs = new Date(now).getTime();

            if (nowMs - lastNotifiedMs >= 15 * 60 * 1000) {
              console.log(`[AlertService] Alert RENEWED (15m Cooldown expired): ${key}`);
              updatedActiveAlerts[key] = {
                ...active,
                lastNotified: now,
                errorDetails: errorMsg,
              };
              await this.sendAlertNotification(client, key, errorMsg, false);
            }
          }
        } else if (wasActive) {
          // Alert Recovered
          console.log(`[AlertService] Alert RECOVERED: ${key}`);
          delete updatedActiveAlerts[key];
          await this.sendAlertNotification(client, key, '', true);
        }
      }

      // Save states
      state.activeAlerts = updatedActiveAlerts;
      StorageService.saveAlertState(state);

    } catch (err: any) {
      console.error('[AlertService] Error in metric checking tick:', err.message);
    }
  }

  private static async sendAlertNotification(client: Client, key: string, details: string, isRecovery: boolean) {
    try {
      const channel = await client.channels.fetch(config.alertChannelId) as TextChannel;
      if (!channel) {
        console.error(`[AlertService] Alert channel with ID ${config.alertChannelId} not found.`);
        return;
      }

      const titleMap: Record<string, string> = {
        cpu_usage_high: 'System CPU Load High',
        memory_usage_high: 'System RAM Usage High',
        disk_usage_high: 'System Disk space Low',
        postgres_down: 'PostgreSQL DOWN',
        rabbitmq_down: 'RabbitMQ DOWN',
        cloudflare_disconnected: 'Cloudflare Tunnel DISCONNECTED',
        nginx_down: 'Nginx DOWN',
        docker_unhealthy: 'Docker Container UNHEALTHY',
      };

      const componentName = titleMap[key] || key;
      const embed = new EmbedBuilder();
      
      // Setup time formatted to YYYY-MM-DD HH:mm WIB/UTC
      const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 16) + ' UTC';

      if (isRecovery) {
        embed
          .setTitle(`✅ ${componentName} RECOVERED`)
          .setColor('#00FF00') // Green
          .setDescription(`Layanan **${componentName}** telah kembali normal dan terhubung.\n\n**Waktu Pemulihan:** ${timeStr}`)
          .setTimestamp();
      } else {
        embed
          .setTitle(`🚨 ${componentName}`)
          .setColor('#FF0000') // Red
          .setDescription(`**Detail Masalah:**\n\`\`\`\n${details}\n\`\`\`\n**Waktu Kejadian:** ${timeStr}`)
          .setTimestamp();
      }

      await channel.send({ embeds: [embed] });
    } catch (error: any) {
      console.error('[AlertService] Failed to send alert message to Discord:', error.message);
    }
  }
}
