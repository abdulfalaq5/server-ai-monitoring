import dotenv from 'dotenv';
import { BotConfig } from './types/index.js';

// Load .env in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

function parseCsv(val?: string): string[] {
  if (!val) return [];
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

export const config: BotConfig = {
  nodeEnv: process.env.NODE_ENV || 'production',
  discordToken: process.env.DISCORD_BOT_TOKEN || '',
  alertChannelId: process.env.DISCORD_ALERT_CHANNEL_ID || '',
  adminUsers: parseCsv(process.env.DISCORD_ADMIN_USERS),
  openclawApiUrl: process.env.OPENCLAW_API_URL || 'http://openclaw:9001',
  openclawToken: process.env.OPENCLAW_GATEWAY_TOKEN || 'ccca5288d47247abee7fbaac3b08abe24134f2791948261c',
  emailWhitelist: parseCsv(process.env.EMAIL_WHITELIST),
};

// Validate required configurations
const missing: string[] = [];
if (!config.discordToken) missing.push('DISCORD_BOT_TOKEN');
if (!config.alertChannelId) missing.push('DISCORD_ALERT_CHANNEL_ID');
if (config.emailWhitelist.length === 0) missing.push('EMAIL_WHITELIST');

if (missing.length > 0) {
  console.error(`[ERROR] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
