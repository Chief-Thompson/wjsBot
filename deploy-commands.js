// deploy-commands.js
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TOKEN = process.env.TOKEN;

if (!CLIENT_ID || !GUILD_ID || !TOKEN) {
  throw new Error('CLIENT_ID, GUILD_ID, or TOKEN missing in .env');
}

// Load command files from commands folder
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

const commands = [];
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

// Register commands
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log(`🚀 Registering ${commands.length} commands to guild ${GUILD_ID}...`);
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Commands registered successfully!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
