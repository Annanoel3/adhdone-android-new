// Content moderation utility - blocks really bad words and inappropriate language
// Used only in public spaces (Chat, profiles) - NOT in private Support Space

const INAPPROPRIATE_WORDS = [
  // Explicit sexual content
  'porn', 'xxx', 'nude', 'naked', 'nsfw', 'dick', 'cock', 'pussy', 
  'penis', 'boobs', 'tits', 'ass', 'anal', 'blowjob', 'handjob', 
  'orgasm', 'horny', 'erotic', 'bdsm', 'dildo', 'cum', 'cumming',
  
  // Severe violence/threats
  'rape', 'molest', 
  
  // Hate speech/slurs (the worst ones)
  'nigger', 'nigga', 'faggot', 'fag', 'tranny', 'retard', 'retarded', 
  'chink', 'gook', 'kike', 'wetback', 'beaner', 'towelhead', 'raghead',
  'cunt', 'whore', 'slut',
  
  // Scam/phishing attempts
  'cashapp me', 'venmo me', 'paypal me', 'send money', 'wire transfer',
  'bitcoin wallet', 'crypto wallet', 'credit card number', 'ssn', 
  'social security number', 'bank account', 'routing number'
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
 * Censors inappropriate words with asterisks
 * @param {string} text - Text to censor
 * @returns {string} - Censored text
 */
export function censorContent(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let censoredText = text;
  const words = text.split(/\s+/);
  
  for (const word of words) {
    const normalizedWord = normalizeText(word);
    
    for (const badWord of INAPPROPRIATE_WORDS) {
      const normalizedBadWord = normalizeText(badWord);
      
      if (normalizedWord.includes(normalizedBadWord)) {
        // Replace the word with asterisks (keep first letter)
        const replacement = word[0] + '*'.repeat(Math.max(1, word.length - 1));
        censoredText = censoredText.replace(new RegExp(`\\b${word}\\b`, 'gi'), replacement);
        break;
      }
    }
  }

  return censoredText;
}

/**
 * Checks if text contains inappropriate content
 * @param {string} text - Text to check
 * @returns {Object} - { isClean: boolean, flaggedWords: string[], censoredText: string }
 */
export function moderateContent(text) {
  if (!text || typeof text !== 'string') {
    return { isClean: true, flaggedWords: [], censoredText: text };
  }

  const normalizedText = normalizeText(text);
  const flaggedWords = [];

  // Check for exact matches and substring matches
  for (const word of INAPPROPRIATE_WORDS) {
    const normalizedWord = normalizeText(word);
    
    // Check if the inappropriate word appears in the text
    if (normalizedText.includes(normalizedWord)) {
      flaggedWords.push(word);
    }
  }

  return {
    isClean: flaggedWords.length === 0,
    flaggedWords: flaggedWords,
    censoredText: censorContent(text)
  };
}

/**
 * Validates text and provides helpful feedback
 */
export function validateContent(text, fieldName = 'Message') {
  const result = moderateContent(text);
  
  if (!result.isClean) {
    return {
      valid: false,
      message: `Please edit your ${fieldName.toLowerCase()} to remove inappropriate words and try again.`,
      censoredText: result.censoredText
    };
  }
  
  return {
    valid: true,
    message: null,
    censoredText: text
  };
}