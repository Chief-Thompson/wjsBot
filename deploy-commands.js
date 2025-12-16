const { REST, Routes } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('🔧 Starting command deployment...');
console.log('Current directory:', __dirname);

// Debug: Check environment variables
console.log('🔧 Debug: Checking environment variables...');
console.log('TOKEN exists:', !!process.env.TOKEN);
console.log('TOKEN length:', process.env.TOKEN ? process.env.TOKEN.length : 0);
console.log('CLIENT_ID exists:', !!process.env.CLIENT_ID);
console.log('GUILD_ID exists:', !!process.env.GUILD_ID);

// Check if commands folder exists
const commandsPath = path.join(__dirname, 'commands');
console.log('Commands path:', commandsPath);
console.log('Commands folder exists:', fs.existsSync(commandsPath));

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
    console.log(`Loading: ${file}`);
    
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`✅ Loaded: ${command.data.name}`);
        } else {
            console.log(`❌ Skipped ${file}: missing data or execute property`);
        }
    } catch (error) {
        console.log(`❌ Error loading ${file}:`, error.message);
    }
}

console.log(`Total commands to deploy: ${commands.length}`);
if (commands.length > 0) {
    console.log('Command names:', commands.map(cmd => cmd.name));
}

// Check environment variables
if (!process.env.TOKEN) { // Changed from DISCORD_TOKEN to TOKEN
    console.error('❌ TOKEN is missing from .env');
    console.log('Please check your .env file and make sure it contains:');
    console.log('TOKEN=your_actual_bot_token_here');
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

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log(`🔄 Starting deployment of ${commands.length} commands...`);
        
        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log(`✅ Successfully deployed ${data.length} application (/) commands.`);
        
        if (data.length === 0) {
            console.log('⚠️  No commands were deployed. Check if your command files are valid.');
        } else {
            console.log('📋 Commands deployed:');
            data.forEach(cmd => console.log(`   - /${cmd.name}`));
        }
        
    } catch (error) {
        console.error('❌ Deployment failed:');
        
        // Enhanced error handling
        if (error.code === 50001) {
            console.error('Missing Access - Check if the bot is in the server and has permissions');
        } else if (error.code === 10002) {
            console.error('Unknown Application - Check CLIENT_ID');
        } else if (error.code === 10004) {
            console.error('Unknown Guild - Check GUILD_ID');
        } else if (error.code === 40001) {
            console.error('Unauthorized - Check if TOKEN is valid');
        } else if (error.status === 401) {
            console.error('Authentication Failed - Invalid token');
        } else if (error.status === 403) {
            console.error('Forbidden - Bot may not have required permissions');
        } else {
            console.error('Error details:');
            console.error('Code:', error.code);
            console.error('Status:', error.status);
            console.error('Message:', error.message);
        }
    }
})();