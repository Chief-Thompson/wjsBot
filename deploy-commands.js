const { REST, Routes } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

<<<<<<< HEAD
console.log('🔧 Starting command deployment...');
console.log('Current directory:', __dirname);

// Check if commands folder exists
const commandsPath = path.join(__dirname, 'commands');
console.log('Commands path:', commandsPath);

if (!fs.existsSync(commandsPath)) {
    console.error('❌ Commands folder does not exist!');
    process.exit(1);
}

// Read command files
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
console.log('Found command files:', commandFiles);

const commands = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    console.log(`Loading command: ${file}`);
    
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`✅ Loaded: ${file}`);
        } else {
            console.log(`❌ Skipping ${file}: missing data or execute property`);
        }
    } catch (error) {
        console.log(`❌ Error loading ${file}:`, error.message);
    }
}

console.log(`Total commands to deploy: ${commands.length}`);
console.log('Command names:', commands.map(cmd => cmd.name));

// Check environment variables
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is missing from .env');
    process.exit(1);
}
if (!process.env.CLIENT_ID) {
    console.error('❌ CLIENT_ID is missing from .env');
    process.exit(1);
}
if (!process.env.GUILD_ID) {
    console.error('❌ GUILD_ID is missing from .env');
    process.exit(1);
}

console.log('✅ Environment variables found');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);
=======
console.log('🔧 Debug: Checking environment variables...');
console.log('DISCORD_TOKEN exists:', !!process.env.TOKEN);
console.log('DISCORD_TOKEN length:', process.env.TOKEN ? process.env.TOKEN.length : 0);
console.log('CLIENT_ID exists:', !!process.env.CLIENT_ID);
console.log('GUILD_ID exists:', !!process.env.GUILD_ID);

// Check if commands folder exists
const commandsPath = path.join(__dirname, 'commands');
console.log('Commands folder exists:', fs.existsSync(commandsPath));

if (!fs.existsSync(commandsPath)) {
    console.error('❌ Commands folder does not exist!');
    process.exit(1);
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
console.log('Command files found:', commandFiles);

const commands = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    console.log(`Loading: ${file}`);
    
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`✅ Loaded: ${command.data.name}`);
        } else {
            console.log(`❌ Skipped ${file}: missing data/execute`);
        }
    } catch (error) {
        console.log(`❌ Error loading ${file}:`, error.message);
    }
}

console.log(`Total commands to deploy: ${commands.length}`);

// Check if token exists before proceeding
if (!process.env.TOKEN) {
    console.error('❌ CRITICAL: DISCORD_TOKEN is empty or not set!');
    console.log('Please check your .env file and make sure it contains:');
    console.log('DISCORD_TOKEN=your_actual_bot_token_here');
    process.exit(1);
}

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
    try {
        console.log(`🔄 Starting deployment of ${commands.length} commands...`);
>>>>>>> d9056d1 (Updated banhistory command and fixes)
        
        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

<<<<<<< HEAD
        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
        console.log('📋 Commands deployed:', data.map(cmd => cmd.name).join(', '));
        
        if (data.length === 0) {
            console.log('⚠️  No commands were deployed. Check if your command files are valid.');
        }
=======
        console.log(`✅ Success! Deployed ${data.length} commands:`);
        data.forEach(cmd => console.log(`   - /${cmd.name}`));
>>>>>>> d9056d1 (Updated banhistory command and fixes)
        
    } catch (error) {
        console.error('❌ Deployment failed:');
        if (error.code === 50001) {
<<<<<<< HEAD
            console.error('Missing Access - Check if the bot is in the server and has permissions');
=======
            console.error('Missing Access - Check bot permissions');
>>>>>>> d9056d1 (Updated banhistory command and fixes)
        } else if (error.code === 10002) {
            console.error('Unknown Application - Check CLIENT_ID');
        } else if (error.code === 10004) {
            console.error('Unknown Guild - Check GUILD_ID');
        } else {
            console.error(error);
        }
    }
<<<<<<< HEAD
})();
=======
})();
>>>>>>> d9056d1 (Updated banhistory command and fixes)
