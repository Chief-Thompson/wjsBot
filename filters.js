// filters.js - Content filtering for ban reasons
const bannedWords = [
  'assfuck', 'cuntfucker', 'niggers', 'niggerhole', 'nigger', 'balllicker', 'nlgger',
  'porchmonkey', 'Porch-monkey', 'cunt', 'asswhore', 'fuck', 'assjockey', 'Dothead',
  'blacks', 'cumqueen', 'fatfucker', 'Jigaboo', 'jiggabo', 'nlggor', 'snownigger',
  'Spearchucker', 'Timber-nigger', 'shitnigger', 'asslick', 'shithead', 'asshole',
  'asshole', 'cuntlicker', 'kunt', 'spaghettinigger', 'Towel-head', 'Chernozhopy',
  'asslicker', 'Bluegum', 'twat', 'ABCD', 'bitchslap', 'bulldyke', 'choad', 'cumshot',
  'fatass', 'jigger', 'kyke', 'cumskin', 'asian', 'asscowboy', 'assmuncher', 'banging',
  'Burrhead', 'Camel-Jockey', 'coon', 'crotchrot', 'cumfest', 'dicklicker', 'fag',
  'fagot', 'felatio', 'fatfuck', 'goldenshower', 'hore', 'jackoff', 'jigg', 'jigga',
  'jizjuice', 'jizm', 'jiz', 'jigger', 'jizzim', 'kumming', 'kunilingus', 'Moolinyan',
  'motherfucking', 'motherfuckings', 'phuk', 'Sheboon', 'shitforbrains', 'slanteye',
  'spick', 'fuuck', 'antinigger', 'aperest', 'Americoon', 'ABC', 'Aunt-Jemima',
  'queer', 'anal', 'asspirate', 'addict', 'bitch', 'ass', 'Buddhahead', 'chode',
  'phuking', 'phukking', 'bastard', 'bulldike', 'dripdick', 'assassination', 'A-rab',
  'Buckra', 'bootycall', 'assholes', 'assbagger', 'cheesedick', 'cooter', 'cum',
  'cumquat', 'cunnilingus', 'datnigga', 'deepthroat', 'dick', 'dickforbrains', 
  'dickbrain', 'dickless', 'dike', 'diddle', 'dixiedyke', 'Eskimo', 'fannyfucker',
  'fatso', 'fckcum', 'Golliwog', 'Goyim', 'homobangers', 'hooters', 'Indognesial',
  'Indonesial', 'jew', 'jijjiboo', 'knockers', 'kummer', 'mothafucka', 'mooncricket',
  'Moon-Cricket', 'Oven-Dodger', 'Peckerwood', 'phuked', 'piccaninny', 'picaninny',
  'phuq', 'Polock', 'poorwhitetrash', 'prick', 'pu55y', 'Pshek', 'slut', 'jizzum',
  'cunteyed', 'Spic', 'Swamp-Guinea', 'stupidfucker', 'stupidfuck', 'titfuck', 
  'Twinkie', 'cock', 'Abeed', 'analannie', 'asshore', 'Beaner', 'Bootlip', 'Burr-head',
  'buttfucker', 'butt-fucker', 'Uncle-Tom', 'cocksmoker', 'Africoon', 'AmeriKKKunt',
  'antifaggot', 'assklown', 'asspuppies', 'blackman', 'jism', 'blumpkin', 'retard',
  'Gringo', 'douchebag', 'Piefke', 'areola', 'backdoorman', 'Abbie', 'bigbutt', 
  'buttface', 'cumbubble', 'cumming', 'Dego', 'dong', 'doggystyle', 'doggiestyle',
  'erection', 'feces', 'goddamned', 'gonzagas', 'Greaser', 'Greaseball', 'handjob',
  'Half-breed', 'horney', 'jihad', 'kumquat', 'Lebo', 'Moskal', 'Mountain-Turk',
  'nofuckingway', 'orgies', 'orgy', 'pecker', 'poontang', 'poon', 'Polentone', 
  'pu55i', 'shitfuck', 'shiteater', 'shitdick', 'sluts', 'slutt', 'Mangal', 'Hymie',
  'stiffy', 'titfucker', 'twink', 'asspacker', 'barelylegal', 'beaner', 'Bozgor',
  'bumfuck', 'shit for brains', 'butchdyke', 'butt-fuckers', 'buttpirate', 'cameljockey',
  'Carcamano', 'Chankoro', 'Choc-ice', 'Chug', 'Ciapaty-or-ciapak', 'Cina', 
  'cocksucer', 'crackwhore', 'Bougnoule', 'unfuckable', 'Africoon-Americoon', 
  'Africoonia', 'Americunt', 'apesault', 'Assburgers', 'fucktardedness', 'sheepfucker',
  'Wuhan-virus', 'Wetback', 'Aseng', 'bumblefuck', 'fastfuck', 'itch', 'nizzle',
  'Oriental', 'cisgender', 'ballsack', 'penis', 'zigabo', 'Bule', 'breastman',
  'bountybar', 'Bounty-bar', 'bondage', 'bombing', 'bullshit', 'asses', 'cancer',
  'cunilingus', 'cummer', 'dicklick', 'ejaculation', 'faeces', 'fairy', 'hoes', 
  'idiot', 'Laowai', 'Leb', 'muff', 'muffdive', 'Oreo', 'orgasm', 'orgasim', 'osama',
  'peepshow', 'Petrol-sniffer', 'perv', 'prickhead', 'shitfit', 'spermbag', 'suckmytit',
  'suckmydick', 'suckmyass', 'suckme', 'suckdick', 'Yuon', 'motherfucker', 'groe',
  'Ali Baba', 'retarded', 'assfucker', 'assmunch', 'assranger', 'Ayrab', 'assclown',
  'buttfuck', 'butt-fuck', 'buttman', 'Chink', 'cocksucker', 'cooly', 'Coon-ass',
  'crotchmonkey', 'Bohunk', 'cockcowboy', 'cocksmith', 'catfucker', 'fucktardedly',
  'trans-testicle', 'Wigger', 'whiskeydick', 'aboriginal', 'asskisser', 'whitelist',
  'Latinx', 'yambag', 'boob', 'beef curtains', 'clunge', 'af', 'wokeness', 'bitchez',
  'Iceberg Fuckers', 'Zhyd', 'bellend', 'arsehole', 'tatas', 'assassinate', 'boonga',
  'booby', 'bullcrap', 'defecate', 'Dhoti', 'dope', 'hobo', 'bigass', 'hussy', 
  'illegal', 'ky', 'moneyshot', 'molestor', 'nooner', 'nookie', 'nookey', 'Paleface',
  'pansy', 'peehole', 'phonesex', 'period', 'pornking', 'pornflick', 'porn', 'pooper',
  'sexwhore', 'shitface', 'shit', 'slav', 'slimeball', 'sniggers', 'snowback',
  'spermherder', 'spankthemonkey', 'spitter', 'strapon', 'Tacohead', 'suckoff',
  'titbitnipply', 'Turco-Albanian', 'tranny', 'trannie', 'zhidovka', 'zhid',
  'Bakra', 'Afro engineering', 'Ah Chah', 'alligatorbait', 'arabs', 'Arabush',
  'Ashke-Nazi', 'assblaster', 'assmonkey', 'badfuck', 'bazongas', 'beatoff', 
  'bazooms', 'Balija', 'bunghole', 'butchdike', 'buttfuckers', 'Boche', 'buttbang',
  'butt-bang', 'buttmunch', 'Charlie', 'chav', 'Chinaman', 'coloured', 'boong',
  'butchbabes', 'clit', 'cockknob', 'cocksucking', 'cocktease', 'Cokin', 'anchor-baby',
  'cumsock', 'fisting', 'fuck-you', 'Fritzie', 'transgendered', 'White-trash', 
  'whitetrash', 'whop', 'wtf', 'Vatnik', 'welfare queen', 'assman', 'black', 'Gyopo',
  'goddam', 'minge', 'punani', 'douche', 'doofus', 'munter', 'moron', 'ballgag', 
  'femsplaining', 'asslover', 'looney', 'Boonga', 'fat', 'homosexual', 'turd', 
  'zhydovka', 'effing', 'minger', 'dullard', 'buggery', 'brea5t', 'boong', 'addicted',
  'demon', 'devilworshipper', 'deth', 'destroy', 'doo-doo', 'doodoo', 'escort',
  'farting', 'fairies', 'husky', 'incest', 'Hunky', 'jiggy', 'laid', 'molester',
  'Mzungu', 'nigglings', 'niggling', 'niggles', 'pee-pee', 'pi55', 'phungky', 'porno',
  'pooping', 'prostitute', 'pros', 'sexslave', 'sextogo', 'shag', 'shithappens',
  'shithapens', 'shitfull', 'shitcan', 'shinola', 'slavedriver', 'sleezeball',
  'spermhearder', 'swastika', 'shits', 'trots', 'trisexual', 'twobitwhore', 'Munt',
  'gangsta', 'Abo', 'addicts', 'Alligator bait', 'analsex', 'Redskin', 'Gypsy', 
  'Ang mo', 'Ape', 'arab', 'Aravush', 'Armo', 'arse', 'assclown', 'asswipe', 
  'Beaney', 'beatyourmeat', 'bigbastard', 'bitches', 'Bogtrotter', 'bung', 'beaver',
  'bestial', 'bogan', 'Cabbage-Eater', 'carpetmuncher', 'carruth', 'cocklover',
  'cockrider', 'cornhole', 'bollock', 'Bog-Irish', 'chinamen', 'clamdigger',
  'clamdiver', 'dwarf', 'cakewalk', 'ftw', 'fml', 'handicapped', 'cawk', 
  'carpet-muncher', 'fuzzy-headed', 'full-blood', 'fuckity-bye', 'frogess', 'Norte',
  'troid', 'willy', 'pud', 'pubiclice', 'whitewashing', 'Brit'
];

const safeReplacements = {
    'stupid': 'foolish',
    'idiot': 'unreasonable',
    'dumb': 'unwise',
    'moron': 'unintelligent',
};

/**
 * Filter and sanitize ban reasons
 * @param {string} reason - Original ban reason
 * @returns {Object} {isSafe: boolean, filteredReason: string, issues: string[]}
 */
function filterBanReason(reason) {
    const issues = [];
    let filteredReason = reason;
    
    // Convert to lowercase for case-insensitive matching
    const lowerReason = reason.toLowerCase();
    
    // Check for banned words and replace with ####
    bannedWords.forEach(word => {
        if (lowerReason.includes(word.toLowerCase())) {
            issues.push(`Contains inappropriate language: ${word}`);
            const regex = new RegExp(word, 'gi');
            filteredReason = filteredReason.replace(regex, '####');
        }
    });
    
    // Check for personal information patterns
    const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
    
    if (phoneRegex.test(filteredReason)) {
        issues.push(`Contains phone number`);
        filteredReason = filteredReason.replace(phoneRegex, '####');
    }
    
    if (emailRegex.test(filteredReason)) {
        issues.push(`Contains email address`);
        filteredReason = filteredReason.replace(emailRegex, '####');
    }
    
    if (ipRegex.test(filteredReason)) {
        issues.push(`Contains IP address`);
        filteredReason = filteredReason.replace(ipRegex, '####');
    }
    
    // Check for URLs and links
    const urlRegex = /https?:\/\/[^\s]+|www\.[^\s]+|discord\.gg\/[^\s]+/gi;
    if (urlRegex.test(filteredReason)) {
        issues.push(`Contains links/URLs`);
        filteredReason = filteredReason.replace(urlRegex, '####');
    }
    
    // Apply safe replacements for milder words
    Object.keys(safeReplacements).forEach(badWord => {
        const regex = new RegExp(`\\b${badWord}\\b`, 'gi');
        filteredReason = filteredReason.replace(regex, safeReplacements[badWord]);
    });
    
    // Check length limits
    if (filteredReason.length > 200) {
        issues.push(`Reason too long (${filteredReason.length}/200 chars)`);
        filteredReason = filteredReason.substring(0, 197) + '...';
    }
    
    // Final check if the filtered reason is just #### (meaning it was entirely inappropriate)
    if (filteredReason.replace(/\s/g, '') === '####' || filteredReason === '####') {
        issues.push(`Reason contained only inappropriate content`);
        filteredReason = 'Inappropriate content removed';
    }
    
    return {
        isSafe: issues.length === 0,
        filteredReason: filteredReason,
        issues: issues
    };
}

module.exports = { filterBanReason };