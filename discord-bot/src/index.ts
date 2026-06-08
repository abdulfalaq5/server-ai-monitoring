import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  Message
} from 'discord.js';
import { config } from './config.js';
import { slashCommandsList, handleSlashCommand } from './commands/slash.js';
import { StorageService } from './services/storage.js';
import { OpenClawService } from './services/openclaw.js';
import { AlertService } from './services/alert.js';

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel, // Required to receive DMs
    Partials.Message,
  ],
});

// Deploy Slash Commands to Discord API
async function deploySlashCommands() {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  try {
    console.log('[Discord] Started refreshing application (/) commands...');

    // Register commands globally
    await rest.put(
      Routes.applicationCommands(client.user!.id),
      { body: slashCommandsList.map(cmd => cmd.toJSON()) }
    );

    console.log('[Discord] Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('[Discord] Error deploying slash commands:', error);
  }
}

client.once('ready', async () => {
  console.log(`[Discord] Bot is logged in as ${client.user?.tag}!`);

  // Register Slash Commands
  await deploySlashCommands();

  // Start background alert loop
  AlertService.start(client);
});

// Handle Slash Command Interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await handleSlashCommand(interaction);
  } catch (error: any) {
    console.error('[Discord] Error handling interaction:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `❌ Error: ${error.message}` });
    } else {
      await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
    }
  }
});

// Helper to check role-based permissions in message events
function hasGuildAccessRole(message: Message): boolean {
  const member = message.member;
  if (member && 'roles' in member) {
    const rolesCache = member.roles;
    if (typeof rolesCache === 'object' && 'cache' in rolesCache) {
      const roles = rolesCache.cache as any;
      const allowedRoles = ['Infra Admin', 'Infra Engineer', 'Viewer'];
      return roles.some((role: any) => allowedRoles.includes(role.name));
    }
  }
  return true; // default to true if role checks are not active (e.g. DM)
}

// Split long messages to fit Discord's 2000 character limit
function sendSplitMessage(message: Message, content: string) {
  if (content.length <= 2000) {
    return message.reply(content);
  }

  const chunks: string[] = [];
  let currentChunk = '';

  const paragraphs = content.split('\n');
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 1 > 2000) {
      chunks.push(currentChunk);
      currentChunk = paragraph;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n${paragraph}` : paragraph;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  // Send sequentially
  (async () => {
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  })();
}

// Handle Natural Language Mentions / DMs
client.on('messageCreate', async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  const isDM = !message.guild;

  // Check if message is intended for the bot:
  // 1. Direct Message (DM)
  // 2. Mention of the bot in any channel
  // 3. Any message in a channel named 'ai-monitoring'
  const isMentioned = message.mentions.has(client.user!);
  const isAiChannel = message.channel && 'name' in message.channel && message.channel.name === 'ai-monitoring';

  if (!isDM && !isMentioned && !isAiChannel) {
    return;
  }

  console.log(`[Discord] Inbound chat message from ${message.author.tag} in ${isDM ? 'DM' : 'Guild Channel'}`);

  // 1. Verification checks
  if (!hasGuildAccessRole(message)) {
    return message.reply('🚫 Unauthorized access.');
  }

  // Handle in-chat text /login <email> in case they do not use slash command
  const cleanContent = message.content.replace(`<@${client.user!.id}>`, '').trim();
  if (cleanContent.startsWith('/login')) {
    const parts = cleanContent.split(/\s+/);
    const email = parts[1]?.trim().toLowerCase();

    if (!email) {
      return message.reply('❌ Format salah. Silakan ketik: `/login <email_anda>`');
    }

    if (!config.emailWhitelist.includes(email)) {
      return message.reply(`❌ Maaf, email \`${email}\` tidak terdaftar dalam whitelist sistem.`);
    }

    StorageService.setUserEmail(message.author.id, email, message.author.username);
    return message.reply(`✅ Akun Discord Anda berhasil terhubung dengan email \`${email}\`. Anda sekarang dapat melakukan chat monitoring.`);
  }

  // Check if email mapping exists
  const userEmail = StorageService.getUserEmail(message.author.id);
  if (!userEmail) {
    return message.reply('❌ Silakan hubungkan email Anda terlebih dahulu menggunakan perintah: `/login <email_anda>`');
  }

  // Clear session if they type "reset" or "clear"
  if (cleanContent.toLowerCase() === 'reset' || cleanContent.toLowerCase() === 'clear') {
    StorageService.clearConversation(message.author.id);
    return message.reply('🧹 Sesi percakapan Anda telah dibersihkan.');
  }

  // Send typing indicator to show thinking state
  await message.channel.sendTyping();

  // Load active conversation
  const session = StorageService.getConversation(message.author.id);

  try {
    // Forward to OpenClaw
    const reply = await OpenClawService.chat(
      message.author.id,
      userEmail,
      cleanContent,
      session.messages
    );

    // Save history (limited to last 20 messages to prevent token bloat)
    session.messages.push({ role: 'user', content: cleanContent });
    session.messages.push({ role: 'assistant', content: reply });
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }
    StorageService.saveConversation(session);

    // Send formatted reply
    sendSplitMessage(message, reply);

  } catch (error: any) {
    console.error('[Discord] Chat handling error:', error.message);
    await message.reply(`❌ Terjadi kesalahan saat memproses chat Anda: ${error.message}`);
  }
});

// Global rejection handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Discord] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Discord] Uncaught Exception:', err);
});

// Log bot in
client.login(config.discordToken);
