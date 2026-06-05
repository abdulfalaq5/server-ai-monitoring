import fs from 'fs';
import path from 'path';
import { UserEmailMap, ConversationSession, AlertState } from '../types/index.js';

const STORAGE_DIR = '/app/storage';
const DISCORD_DIR = path.join(STORAGE_DIR, 'discord');
const ALERTS_DIR = path.join(STORAGE_DIR, 'alerts');

const PATHS = {
  users: path.join(DISCORD_DIR, 'users.json'),
  channels: path.join(DISCORD_DIR, 'channels.json'),
  conversations: path.join(DISCORD_DIR, 'conversations.json'),
  alertState: path.join(ALERTS_DIR, 'alert-state.json'),
};

// Ensure directories exist
function initStorage() {
  if (!fs.existsSync(DISCORD_DIR)) {
    fs.mkdirSync(DISCORD_DIR, { recursive: true });
  }
  if (!fs.existsSync(ALERTS_DIR)) {
    fs.mkdirSync(ALERTS_DIR, { recursive: true });
  }
}

initStorage();

export class StorageService {
  // --- Users ---
  static getUsers(): UserEmailMap[] {
    try {
      if (fs.existsSync(PATHS.users)) {
        const data = fs.readFileSync(PATHS.users, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('[Storage] Error reading users.json:', err);
    }
    return [];
  }

  static saveUsers(users: UserEmailMap[]) {
    try {
      fs.writeFileSync(PATHS.users, JSON.stringify(users, null, 2), 'utf8');
    } catch (err) {
      console.error('[Storage] Error writing users.json:', err);
    }
  }

  static getUserEmail(discordId: string): string | undefined {
    const users = this.getUsers();
    return users.find(u => u.discordId === discordId)?.email;
  }

  static setUserEmail(discordId: string, email: string, username: string) {
    const users = this.getUsers();
    const existingIndex = users.findIndex(u => u.discordId === discordId);
    const newEntry: UserEmailMap = {
      discordId,
      email,
      username,
      createdAt: new Date().toISOString(),
    };

    if (existingIndex > -1) {
      users[existingIndex] = newEntry;
    } else {
      users.push(newEntry);
    }
    this.saveUsers(users);
  }

  // --- Conversations ---
  static getConversations(): ConversationSession[] {
    try {
      if (fs.existsSync(PATHS.conversations)) {
        const data = fs.readFileSync(PATHS.conversations, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('[Storage] Error reading conversations.json:', err);
    }
    return [];
  }

  static saveConversations(sessions: ConversationSession[]) {
    try {
      fs.writeFileSync(PATHS.conversations, JSON.stringify(sessions, null, 2), 'utf8');
    } catch (err) {
      console.error('[Storage] Error writing conversations.json:', err);
    }
  }

  static getConversation(discordId: string): ConversationSession {
    const sessions = this.getConversations();
    let session = sessions.find(s => s.discordId === discordId);
    if (!session) {
      session = {
        discordId,
        messages: [],
        lastActive: new Date().toISOString(),
      };
    }
    return session;
  }

  static saveConversation(session: ConversationSession) {
    const sessions = this.getConversations();
    const existingIndex = sessions.findIndex(s => s.discordId === session.discordId);
    session.lastActive = new Date().toISOString();

    if (existingIndex > -1) {
      sessions[existingIndex] = session;
    } else {
      sessions.push(session);
    }
    this.saveConversations(sessions);
  }

  static clearConversation(discordId: string) {
    const sessions = this.getConversations().filter(s => s.discordId !== discordId);
    this.saveConversations(sessions);
  }

  // --- Alert State ---
  static getAlertState(): AlertState {
    try {
      if (fs.existsSync(PATHS.alertState)) {
        const data = fs.readFileSync(PATHS.alertState, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('[Storage] Error reading alert-state.json:', err);
    }
    return {
      activeAlerts: {},
      cpuHighConsecutiveCount: 0,
    };
  }

  static saveAlertState(state: AlertState) {
    try {
      fs.writeFileSync(PATHS.alertState, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      console.error('[Storage] Error writing alert-state.json:', err);
    }
  }

  // --- Channels ---
  static getChannels(): string[] {
    try {
      if (fs.existsSync(PATHS.channels)) {
        const data = fs.readFileSync(PATHS.channels, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('[Storage] Error reading channels.json:', err);
    }
    return [];
  }

  static saveChannels(channels: string[]) {
    try {
      fs.writeFileSync(PATHS.channels, JSON.stringify(channels, null, 2), 'utf8');
    } catch (err) {
      console.error('[Storage] Error writing channels.json:', err);
    }
  }
}
