// Content moderation utility - blocks inappropriate language, personal info, and predatory behavior
// Used only in public spaces (Chat, profiles) - NOT in private Support Space

import { base44 } from "@/api/base44Client";

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

// Regex patterns for personal information
const PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  phone: /(\+\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}|\d{10,}/,
  // Addresses with street numbers, coordinates, or common location formats
  location: /\b\d+\s+[A-Za-z]+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|court|ct|place|pl)\b/i,
  coordinates: /[-+]?\d{1,3}\.\d+,\s*[-+]?\d{1,3}\.\d+/,
  zipcode: /\b\d{5}(-\d{4})?\b/
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
 * Checks for personal information patterns
 */
function checkPersonalInfo(text) {
  const violations = [];
  
  if (PATTERNS.email.test(text)) {
    violations.push('email address');
  }
  
  if (PATTERNS.phone.test(text)) {
    violations.push('phone number');
  }
  
  if (PATTERNS.location.test(text) || PATTERNS.coordinates.test(text)) {
    violations.push('location/address');
  }
  
  if (PATTERNS.zipcode.test(text)) {
    violations.push('zip code');
  }
  
  return violations;
}

/**
 * Censors inappropriate words with asterisks
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
        const replacement = word[0] + '*'.repeat(Math.max(1, word.length - 1));
        censoredText = censoredText.replace(new RegExp(`\\b${word}\\b`, 'gi'), replacement);
        break;
      }
    }
  }

  return censoredText;
}

/**
 * AI-based check for predatory behavior patterns
 */
async function checkPredatoryBehavior(text) {
  try {
    const prompt = `You are a content moderation AI protecting users in a productivity/ADHD support app.

Analyze this message for predatory behavior, grooming, or inappropriate contact attempts. Look for:
- Requests to move conversation off-platform
- Age-related questions or comments
- Attempts to establish private contact (phone, social media, other apps)
- Inappropriate relationship building with potentially underage users
- Sexual or romantic advances
- Requests for personal photos
- Manipulation tactics or isolation attempts

Message: "${text}"

Respond ONLY with a JSON object:
{
  "isSafe": true/false,
  "reason": "brief explanation if unsafe, otherwise empty string",
  "severity": "none/low/medium/high"
}`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      response_json_schema: {
        type: "object",
        properties: {
          isSafe: { type: "boolean" },
          reason: { type: "string" },
          severity: { type: "string", enum: ["none", "low", "medium", "high"] }
        },
        required: ["isSafe", "reason", "severity"]
      }
    });

    return response;
  } catch (error) {
    console.error("AI moderation error:", error);
    // Fail open to avoid blocking legitimate messages on error
    return { isSafe: true, reason: "", severity: "none" };
  }
}

/**
 * Checks if text contains inappropriate content
 */
export async function moderateContent(text) {
  if (!text || typeof text !== 'string') {
    return { isClean: true, flaggedWords: [], violations: [], censoredText: text, aiCheck: null };
  }

  const normalizedText = normalizeText(text);
  const flaggedWords = [];

  // Check for inappropriate words
  for (const word of INAPPROPRIATE_WORDS) {
    const normalizedWord = normalizeText(word);
    if (normalizedText.includes(normalizedWord)) {
      flaggedWords.push(word);
    }
  }

  // Check for personal information
  const personalInfoViolations = checkPersonalInfo(text);

  // Run AI check for predatory behavior
  const aiCheck = await checkPredatoryBehavior(text);

  const isClean = flaggedWords.length === 0 && 
                  personalInfoViolations.length === 0 && 
                  aiCheck.isSafe &&
                  aiCheck.severity === 'none';

  return {
    isClean: isClean,
    flaggedWords: flaggedWords,
    violations: personalInfoViolations,
    censoredText: censorContent(text),
    aiCheck: aiCheck
  };
}

/**
 * Validates text and provides helpful feedback
 */
export async function validateContent(text, fieldName = 'Message') {
  const result = await moderateContent(text);
  
  if (!result.isClean) {
    let message = '';
    
    if (result.flaggedWords.length > 0) {
      message = `Please edit your ${fieldName.toLowerCase()} to remove inappropriate words and try again.`;
    } else if (result.violations.length > 0) {
      message = `For your safety, please don't share ${result.violations.join(', ')} in messages. This helps protect all users.`;
    } else if (!result.aiCheck.isSafe) {
      message = `Your message was flagged for safety concerns. ${result.aiCheck.reason || 'Please keep conversations appropriate and respectful.'}`;
    }
    
    return {
      valid: false,
      message: message,
      censoredText: result.censoredText
    };
  }
  
  return {
    valid: true,
    message: null,
    censoredText: text
  };
}