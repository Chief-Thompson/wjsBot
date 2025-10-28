require('dotenv').config();
const { Client, Collection, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// --- Load commands ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
  }
}

// --- Ticket system ---
const CATEGORY_ID = '1080201545909543034';
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const ADMIN_ROLE_ID = '1075191567528251542'; // Only this role sees staff reports
const tickets = new Map();
const MAX_TICKETS = 15;

// --- Interaction handler ---
client.on(Events.InteractionCreate, async interaction => {

  // --- Slash Command Handling ---
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '❌ There was an error executing this command.', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ There was an error executing this command.', ephemeral: true });
      }
    }
    return; // Don't fall through to button handling
  }

  // --- Button Handling ---
  if (!interaction.isButton()) return;

  const { customId } = interaction;

  if (customId === 'report_player') {
    await createTicket(interaction, 'player', STAFF_ROLE_ID);
  }

  if (customId === 'report_staff') {
    await createTicket(interaction, 'staff', ADMIN_ROLE_ID);
  }

  if (customId === 'close_ticket') {
    const userId = [...tickets.entries()].find(([_, chId]) => chId === interaction.channel.id)?.[0];
    if (!userId)
      return interaction.reply({ content: '❌ Cannot find this ticket.', ephemeral: true });

    if (!interaction.member.roles.cache.has(STAFF_ROLE_ID) && !interaction.member.roles.cache.has(ADMIN_ROLE_ID))
      return interaction.reply({ content: '❌ You don’t have permission to close this.', ephemeral: true });

    await interaction.channel.permissionOverwrites.edit(userId, { SendMessages: false });
    await interaction.reply({ content: '🔒 Ticket closed. User can no longer send messages.', ephemeral: true });
  }

  if (customId === 'delete_ticket') {
    const userId = [...tickets.entries()].find(([_, chId]) => chId === interaction.channel.id)?.[0];
    if (!userId)
      return interaction.reply({ content: '❌ Cannot find this ticket.', ephemeral: true });

    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID))
      return interaction.reply({ content: '❌ Only Admins can delete tickets.', ephemeral: true });

    tickets.delete(userId);
    await interaction.channel.delete();
  }
});

// --- Create ticket function ---
async function createTicket(interaction, type, visibleRoleId) {
  await interaction.deferReply({ ephemeral: true });

  if (tickets.has(interaction.user.id))
    return interaction.editReply({ content: '❌ You already have an open ticket.' });

  if (tickets.size >= MAX_TICKETS)
    return interaction.editReply({ content: '❌ Ticket queue is full right now.' });

  const ticketChannel = await interaction.guild.channels.create({
    name: `${type}-report-${interaction.user.username}`,
    type: 0,
    parent: CATEGORY_ID,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
      { id: visibleRoleId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }
    ]
  });

  tickets.set(interaction.user.id, ticketChannel.id);

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('delete_ticket').setLabel('🗑 Delete Ticket').setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({
    content: `Hello ${interaction.user}, thank you for your ${type === 'staff' ? 'staff misconduct' : 'player'} report.\nA team member will review it shortly.`,
    components: [controlRow]
  });

  await interaction.editReply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
}

// --- Ready event and ticket recovery ---
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  const category = guild.channels.cache.get(CATEGORY_ID);

  if (category) {
    const childChannels = guild.channels.cache.filter(c => c.parentId === category.id);
    for (const [, channel] of childChannels) {
      if (channel.name.startsWith('player-report') || channel.name.startsWith('staff-report')) {
        const userOverwrite = channel.permissionOverwrites.cache.find(po => po.type === 1 && po.allow.has('ViewChannel'));
        if (userOverwrite) tickets.set(userOverwrite.id, channel.id);
      }
    }
  }

  console.log(`Recovered ${tickets.size} tickets after restart ✅`);
});

// --- Login ---
client.login(process.env.TOKEN);
