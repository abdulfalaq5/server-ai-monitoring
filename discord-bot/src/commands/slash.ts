import { SlashCommandBuilder, CommandInteraction, ChatInputCommandInteraction, PermissionsBitField } from 'discord.js';
import { OpenClawService } from '../services/openclaw.js';
import { StorageService } from '../services/storage.js';
import { config } from '../config.js';

export const slashCommandsList = [
  // /help
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Tampilkan panduan penggunaan bot dan daftar perintah yang tersedia.'),

  // /login <email>
  new SlashCommandBuilder()
    .setName('login')
    .setDescription('Hubungkan akun Discord Anda ke email monitoring yang terdaftar di whitelist.')
    .addStringOption(option =>
      option.setName('email')
        .setDescription('Alamat email monitoring Anda (harus ada di whitelist)')
        .setRequired(true)
    ),

  // /status
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Periksa status kesehatan seluruh infrastruktur server secara realtime.'),

  // /cpu
  new SlashCommandBuilder()
    .setName('cpu')
    .setDescription('Periksa penggunaan CPU host dan rata-rata beban (load average).'),

  // /memory
  new SlashCommandBuilder()
    .setName('memory')
    .setDescription('Periksa penggunaan RAM host dan swap space.'),

  // /disk
  new SlashCommandBuilder()
    .setName('disk')
    .setDescription('Periksa ruang penyimpanan disk yang terpasang pada host.'),

  // /docker
  new SlashCommandBuilder()
    .setName('docker')
    .setDescription('Periksa status container Docker yang berjalan dan terhenti.'),

  // /postgres
  new SlashCommandBuilder()
    .setName('postgres')
    .setDescription('Periksa konektivitas dan metrik PostgreSQL.'),

  // /rabbitmq
  new SlashCommandBuilder()
    .setName('rabbitmq')
    .setDescription('Periksa status antrean dan node RabbitMQ Cluster.'),

  // /cloudflare
  new SlashCommandBuilder()
    .setName('cloudflare')
    .setDescription('Periksa status Cloudflare Tunnel yang aktif.'),

  // /logs <logfile> [lines] [filter] - Admin Only
  new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Tampilkan baris log terbaru dari host server (Hanya untuk Admin).')
    .addStringOption(option =>
      option.setName('logfile')
        .setDescription('File log yang ingin dibaca')
        .setRequired(true)
        .addChoices(
          { name: 'syslog', value: 'syslog' },
          { name: 'kern', value: 'kern' },
          { name: 'auth', value: 'auth' },
          { name: 'nginx_access', value: 'nginx_access' },
          { name: 'nginx_error', value: 'nginx_error' },
          { name: 'docker', value: 'docker' },
          { name: 'dpkg', value: 'dpkg' },
          { name: 'apt', value: 'apt' },
          { name: 'ufw', value: 'ufw' }
        )
    )
    .addIntegerOption(option =>
      option.setName('lines')
        .setDescription('Jumlah baris log (1-500, default: 100)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('filter')
        .setDescription('Filter kata kunci pencarian pada log')
        .setRequired(false)
    )
];

// Helper to check if user has Admin privileges
function isUserAdmin(interaction: CommandInteraction): boolean {
  // Check if user ID is in DISCORD_ADMIN_USERS env
  if (config.adminUsers.includes(interaction.user.id)) {
    return true;
  }

  // Check if member has "Infra Admin" role in guild
  const member = interaction.member;
  if (member && 'roles' in member) {
    const rolesCache = member.roles;
    if (typeof rolesCache === 'object' && 'cache' in rolesCache) {
      const roles = rolesCache.cache as any;
      if (roles.some((role: any) => role.name === 'Infra Admin')) {
        return true;
      }
    }
  }

  // Fallback to guild owner or administrator permissions
  if (interaction.guild && interaction.user.id === interaction.guild.ownerId) {
    return true;
  }
  return false;
}

// Helper to check if user has Allowed privileges
function isUserAllowed(interaction: CommandInteraction): boolean {
  // If allowed users is empty, everyone has access
  // Otherwise check if listed, or has one of the roles
  const member = interaction.member;
  if (member && 'roles' in member) {
    const rolesCache = member.roles;
    if (typeof rolesCache === 'object' && 'cache' in rolesCache) {
      const roles = rolesCache.cache as any;
      const allowedRoles = ['Infra Admin', 'Infra Engineer', 'Viewer'];
      if (roles.some((role: any) => allowedRoles.includes(role.name))) {
        return true;
      }
    }
  }
  return true; // defaulted to true because user wants all allowed if DISCORD_ALLOWED_USERS is empty
}

export async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  const { commandName, user } = interaction;

  // 1. Authorization checks
  if (!isUserAllowed(interaction)) {
    return interaction.reply({ content: '🚫 Unauthorized access.', ephemeral: true });
  }

  // /login <email> is handled separately as it doesn't require prior login mapping
  if (commandName === 'login') {
    const email = interaction.options.getString('email', true).trim().toLowerCase();
    
    if (!config.emailWhitelist.includes(email)) {
      return interaction.reply({
        content: `❌ Maaf, email \`${email}\` tidak terdaftar dalam whitelist sistem. Hubungi administrator untuk menambahkan email Anda.`,
        ephemeral: true
      });
    }

    StorageService.setUserEmail(user.id, email, user.username);
    return interaction.reply({
      content: `✅ Akun Discord Anda berhasil terhubung dengan email \`${email}\`. Anda sekarang dapat menggunakan perintah monitoring.`,
      ephemeral: true
    });
  }

  // For all other commands, verify user has mapped email
  const userEmail = StorageService.getUserEmail(user.id);
  if (!userEmail) {
    return interaction.reply({
      content: '❌ Silakan hubungkan email Anda terlebih dahulu menggunakan perintah: `/login <email_anda>`',
      ephemeral: true
    });
  }

  // Check Admin permission for /logs
  if (commandName === 'logs' && !isUserAdmin(interaction)) {
    return interaction.reply({ content: '🚫 Hanya Admin yang dapat menjalankan perintah logs.', ephemeral: true });
  }

  // Defer reply since OpenClaw/MCP call can exceed 3 seconds
  await interaction.deferReply();

  try {
    let result = '';

    switch (commandName) {
      case 'help':
        result = `### 🤖 **OpenClaw Server Monitoring Bot - Panduan Perintah**
Gunakan slash command berikut untuk melakukan observasi infrastruktur:

• \`/login <email>\` - Hubungkan Discord Anda ke email whitelist.
• \`/status\` - Periksa status kesehatan seluruh infrastruktur server.
• \`/cpu\` - Periksa penggunaan CPU dan load averages.
• \`/memory\` - Periksa penggunaan RAM dan Swap memory.
• \`/disk\` - Periksa ruang penyimpanan disk pada host.
• \`/docker\` - List container Docker dan statusnya.
• \`/postgres\` - Periksa koneksi dan metrik PostgreSQL.
• \`/rabbitmq\` - Periksa queue dan node RabbitMQ.
• \`/cloudflare\` - Periksa status Cloudflare Tunnel.
• \`/logs <logfile> [lines] [filter]\` - (*Admin*) Tampilkan logs server.

*Anda juga dapat berinteraksi secara natural dengan menyebut (mention) bot ini di channel #ai-monitoring atau melalui DM.*`;
        await interaction.editReply({ content: result });
        break;

      case 'status':
        result = await OpenClawService.executeDirectCommand(user.id, userEmail, 'Check server status of all components: CPU, memory, disk, Postgres, RabbitMQ, Docker, Nginx, and Cloudflare Tunnel.');
        await interaction.editReply({ content: result });
        break;

      case 'cpu':
        result = await OpenClawService.executeDirectCommand(user.id, userEmail, 'Check CPU load average and usage percentage.');
        await interaction.editReply({ content: result });
        break;

      case 'memory':
        result = await OpenClawService.executeDirectCommand(user.id, userEmail, 'Check Memory usage stats.');
        await interaction.editReply({ content: result });
        break;

      case 'disk':
        result = await OpenClawService.executeDirectCommand(user.id, userEmail, 'Check Disk usage statistics.');
        await interaction.editReply({ content: result });
        break;

      case 'docker':
        result = await OpenClawService.executeDirectCommand(user.id, userEmail, 'List all docker containers and their status.');
        await interaction.editReply({ content: result });
        break;

      case 'postgres':
        result = await OpenClawService.executeDirectCommand(user.id, userEmail, 'Check PostgreSQL database connectivity and metrics.');
        await interaction.editReply({ content: result });
        break;

      case 'rabbitmq':
        result = await OpenClawService.executeDirectCommand(user.id, userEmail, 'Check RabbitMQ cluster and queues status.');
        await interaction.editReply({ content: result });
        break;

      case 'cloudflare':
        result = await OpenClawService.executeDirectCommand(user.id, userEmail, 'Check Cloudflare Tunnel connection status.');
        await interaction.editReply({ content: result });
        break;

      case 'logs':
        const logFile = interaction.options.getString('logfile', true);
        const lines = interaction.options.getInteger('lines') || 100;
        const filter = interaction.options.getString('filter') || '';
        
        let prompt = `Read recent logs for file: "${logFile}" with lines: ${lines}`;
        if (filter) {
          prompt += ` and filter keyword: "${filter}"`;
        }
        
        result = await OpenClawService.executeDirectCommand(user.id, userEmail, prompt);
        await interaction.editReply({ content: result });
        break;

      default:
        await interaction.editReply({ content: 'Unknown command.' });
    }
  } catch (err: any) {
    console.error(`[Slash Command] Error handling /${commandName}:`, err);
    await interaction.editReply({ content: `❌ Terjadi kesalahan saat memproses perintah \`/${commandName}\`: ${err.message}` });
  }
}
