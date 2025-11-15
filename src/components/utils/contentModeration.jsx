
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
  'social security number', 'bank account', 'routing number',
  
  // Investment scams
  'get rich quick', 'guaranteed profit', 'make money fast', 'investment opportunity',
  'crypto opportunity', 'nft investment', 'binary options', 'forex trading guaranteed'
];

// Predatory question patterns
const PREDATORY_PATTERNS = [
  /\b(where (are|do) you|your location|what('?s| is) your address)\b/i,
  /\b(are you (pretty|hot|cute|sexy|beautiful|single))\b/i,
  /\b(how old are you|what('?s| is) your age|are you (\d+)|are you (18|under|over))\b/i,
  /\b(send (me |)((a |)pic|photo|selfie|picture))\b/i,
  /\b(got (snap|snapchat|insta|instagram|whatsapp|telegram|kik))\b/i,
  /\b(add me on|let('?s| us) talk on|move to)\b/i,
  /\b(meet (up|in person)|hang out|come over)\b/i,
  /\b(virgin|sexual|dating|girlfriend|boyfriend)\b/i,
  /\b(you look|looking good|nice body)\b/i,
];

// Scam patterns
const SCAM_PATTERNS = [
  /\b(click (this|here)|check (this|out)|visit (my|this))\s+(link|website|page)\b/i,
  /\b(dm me|message me|text me).{0,20}(business|opportunity|offer)\b/i,
  /\b(limited time|act now|hurry|urgent).{0,30}(offer|deal|opportunity)\b/i,
  /\b\$\d+.{0,20}(per (day|week|hour)|guaranteed|profit|return)\b/i,
  /\b(work from home|side hustle|passive income).{0,30}(guaranteed|easy|simple)\b/i,
  /\b(amazon|apple|google|microsoft).{0,30}(gift card|voucher|prize)\b/i,
  /\b(verify your account|confirm your (identity|account))\b/i,
  /\b(suspended|locked|compromised).{0,20}account\b/i,
];

// Political and sensitive topic patterns
const POLITICAL_PATTERNS = [
  /\b(trump|biden|democrat|republican|liberal|conservative|left-?wing|right-?wing)\b/i,
  /\b(abortion|pro-life|pro-choice)\b/i,
  /\b(gun (control|rights)|second amendment|2nd amendment)\b/i,
  /\b(immigration|border wall|illegal alien)\b/i,
  /\b(blm|black lives matter|all lives matter)\b/i,
  /\b(antifa|proud boys)\b/i,
  /\b(vaccine mandate|anti-vax|anti-vaxx)\b/i,
  /\b(election (fraud|stolen|rigged))\b/i,
  /\b(fake news|mainstream media|msm)\b/i,
  /\b(climate (change|hoax|crisis))\b/i,
  /\b(woke|cancel culture)\b/i,
  /\b(lgbtq|transgender|trans rights)\b/i,
  /\b(israel|palestine|gaza)\b/i,
  /\b(russia|ukraine|putin)\b/i,
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
 * Checks for predatory question patterns
 */
function checkPredatoryPatterns(text) {
  const matchedPatterns = [];
  
  for (const pattern of PREDATORY_PATTERNS) {
    if (pattern.test(text)) {
      matchedPatterns.push('inappropriate question');
      break; // Only need to flag once
    }
  }
  
  return matchedPatterns;
}

/**
 * Checks for political and sensitive topics
 */
function checkPoliticalContent(text) {
  const matchedPatterns = [];
  
  for (const pattern of POLITICAL_PATTERNS) {
    if (pattern.test(text)) {
      matchedPatterns.push('political or sensitive topic');
      break; // Only need to flag once
    }
  }
  
  return matchedPatterns;
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
- Questions about appearance, location, or personal details

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
    return { isClean: true, flaggedWords: [], violations: [], predatoryPatterns: [], politicalPatterns: [], scamPatterns: [], censoredText: text, aiCheck: null };
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

  // Check for predatory patterns
  const predatoryPatterns = checkPredatoryPatterns(text);

  // Check for political content
  const politicalPatterns = checkPoliticalContent(text);

  // Check for scam patterns
  const scamPatterns = [];
  for (const pattern of SCAM_PATTERNS) {
    if (pattern.test(text)) {
      scamPatterns.push('potential scam');
      break;
    }
  }

  // Check for personal information
  const personalInfoViolations = checkPersonalInfo(text);

  // Run AI check for predatory behavior
  const aiCheck = await checkPredatoryBehavior(text);

  const isClean = flaggedWords.length === 0 && 
                  personalInfoViolations.length === 0 && 
                  predatoryPatterns.length === 0 &&
                  politicalPatterns.length === 0 &&
                  scamPatterns.length === 0 &&
                  aiCheck.isSafe &&
                  aiCheck.severity === 'none';

  return {
    isClean: isClean,
    flaggedWords: flaggedWords,
    violations: personalInfoViolations,
    predatoryPatterns: predatoryPatterns,
    politicalPatterns: politicalPatterns,
    scamPatterns: scamPatterns,
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
    let message = 'Please keep conversations focused on work, tasks, and productivity. Let\'s maintain a safe and supportive environment for everyone. 🌟';
    
    if (result.flaggedWords.length > 0) {
      message = 'Please keep language appropriate and focused on work/tasks. Let\'s maintain a safe and supportive environment for everyone. 🌟';
    } else if (result.predatoryPatterns.length > 0) {
      message = 'Please keep conversations focused on work and productivity. Let\'s maintain a safe and supportive environment for everyone. 🌟';
    } else if (result.politicalPatterns.length > 0) {
      message = 'Please keep conversations focused on work, tasks, and productivity - not politics or controversial topics. Let\'s maintain a safe and supportive environment for everyone. 🌟';
    } else if (result.scamPatterns.length > 0) {
      message = 'This message looks like spam or a scam. Please keep conversations focused on work and tasks only. 🚫';
    } else if (result.violations.length > 0) {
      message = 'For your safety, please don\'t share personal information. Let\'s keep conversations focused on work and tasks. 🌟';
    } else if (!result.aiCheck.isSafe) {
      message = 'Please keep conversations focused on work, tasks, and productivity. Let\'s maintain a safe and supportive environment for everyone. 🌟';
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
