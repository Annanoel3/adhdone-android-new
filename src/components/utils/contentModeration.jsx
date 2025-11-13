// Content moderation utility - blocks inappropriate language

const INAPPROPRIATE_WORDS = [
  // Sexual content
  'porn', 'xxx', 'sex', 'nude', 'naked', 'nsfw', 'dick', 'cock', 'pussy', 'vagina', 
  'penis', 'boobs', 'tits', 'ass', 'anal', 'oral', 'blowjob', 'handjob', 'masturbate',
  'orgasm', 'horny', 'erotic', 'seduction', 'fetish', 'bdsm', 'kinky', 'dildo',
  'vibrator', 'cum', 'cumming', 'ejaculate', 'semen', 'sperm', 'testicle', 'scrotum',
  'nipple', 'breast', 'clitoris', 'labia', 'vulva', 'aroused', 'arousal',
  
  // Violence/threats
  'kill', 'murder', 'rape', 'molest', 'assault', 'abuse', 'torture', 'mutilate',
  'suicide', 'kys', 'genocide', 'terrorism', 'terrorist', 'bomb', 'shoot', 'stab',
  'strangle', 'choke', 'suffocate', 'lynch', 'execute', 'slaughter', 'massacre',
  'dismember', 'decapitate', 'behead', 'eviscerate',
  
  // Hate speech/slurs
  'nigger', 'nigga', 'faggot', 'fag', 'tranny', 'retard', 'retarded', 'spic', 
  'chink', 'gook', 'kike', 'wetback', 'beaner', 'towelhead', 'raghead', 'dyke',
  'cunt', 'whore', 'slut', 'bitch', 'hoe',
  
  // Drugs (hard drugs, not medication)
  'cocaine', 'heroin', 'meth', 'methamphetamine', 'ecstasy', 'mdma', 'lsd', 
  'shrooms', 'mushrooms', 'crack', 'fentanyl', 'oxy', 'xanax', 'percocet',
  
  // Scam/illegal activity
  'cashapp', 'venmo', 'paypal', 'zelle', 'bitcoin', 'crypto', 'invest', 'trading',
  'money laundering', 'fraud', 'scam', 'phishing', 'hack', 'hacking', 'stolen',
  'credit card', 'ssn', 'social security'
];

// Common letter substitutions used to bypass filters
const SUBSTITUTIONS = {
  '@': 'a',
  '4': 'a',
  '8': 'b',
  '3': 'e',
  '1': 'i',
  '!': 'i',
  '0': 'o',
  '5': 's',
  '$': 's',
  '7': 't',
  '+': 't',
  '*': '',
  '.': '',
  '-': '',
  '_': '',
  ' ': ''
};

/**
 * Normalizes text to catch attempts to bypass the filter
 */
function normalizeText(text) {
  let normalized = text.toLowerCase();
  
  // Replace common substitutions
  for (const [char, replacement] of Object.entries(SUBSTITUTIONS)) {
    normalized = normalized.split(char).join(replacement);
  }
  
  // Remove extra spaces and special characters
  normalized = normalized.replace(/[^a-z0-9]/g, '');
  
  return normalized;
}

/**
 * Checks if text contains inappropriate content
 * @param {string} text - Text to check
 * @returns {Object} - { isClean: boolean, flaggedWords: string[] }
 */
export function moderateContent(text) {
  if (!text || typeof text !== 'string') {
    return { isClean: true, flaggedWords: [] };
  }

  const normalizedText = normalizeText(text);
  const flaggedWords = [];

  // Check for exact matches and substring matches
  for (const word of INAPPROPRIATE_WORDS) {
    const normalizedWord = normalizeText(word);
    
    // Check if the inappropriate word appears in the text
    if (normalizedText.includes(normalizedWord)) {
      // Verify it's a whole word match or surrounded by non-letters
      const regex = new RegExp(`(^|[^a-z])${normalizedWord}([^a-z]|$)`, 'i');
      if (regex.test(normalizedText)) {
        flaggedWords.push(word);
      }
    }
  }

  return {
    isClean: flaggedWords.length === 0,
    flaggedWords: flaggedWords
  };
}

/**
 * Validates text and throws an error if inappropriate
 */
export function validateContent(text, fieldName = 'Content') {
  const result = moderateContent(text);
  
  if (!result.isClean) {
    throw new Error(`${fieldName} contains inappropriate language. Please keep communication respectful and appropriate.`);
  }
  
  return true;
}