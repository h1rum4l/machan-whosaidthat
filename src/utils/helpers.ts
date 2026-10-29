/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AvatarOption, GamePrompt } from '../types/game';

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'tuktuk', name: 'Tuk-Tuk Turbo', emoji: '🛺', bg: 'from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/40' },
  { id: 'lion', name: 'Lion Machan', emoji: '🦁', bg: 'from-yellow-500/20 to-amber-600/20 text-yellow-400 border-yellow-500/40' },
  { id: 'kottu', name: 'Kottu Maestro', emoji: '🥘', bg: 'from-red-500/20 to-rose-600/20 text-rose-400 border-rose-500/40' },
  { id: 'coconut', name: 'Thambili Boss', emoji: '🥥', bg: 'from-emerald-500/20 to-teal-600/20 text-emerald-400 border-emerald-500/40' },
  { id: 'teacup', name: 'Ceylon Chai', emoji: '☕', bg: 'from-amber-600/20 to-stone-700/20 text-amber-300 border-amber-600/40' },
  { id: 'cricket', name: 'Sixer King', emoji: '🏏', bg: 'from-blue-500/20 to-indigo-600/20 text-blue-400 border-blue-500/40' },
  { id: 'peacock', name: 'Mayura Vibe', emoji: '🦚', bg: 'from-cyan-500/20 to-blue-600/20 text-cyan-400 border-cyan-500/40' },
  { id: 'mask', name: 'Vesmuhuna Pro', emoji: '👺', bg: 'from-purple-500/20 to-pink-600/20 text-purple-400 border-purple-500/40' },
];

export function getAvatar(id: string): AvatarOption {
  return AVATAR_OPTIONS.find(a => a.id === id) || AVATAR_OPTIONS[0];
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function validateAnswer(text: string): {
  isValid: boolean;
  wordCount: number;
  charCount: number;
  error?: string;
} {
  const trimmed = text.trim();
  const wordCount = countWords(trimmed);
  const charCount = trimmed.length;

  if (charCount === 0) {
    return { isValid: false, wordCount: 0, charCount: 0, error: 'Please enter your answer, machan!' };
  }
  if (charCount > 120) {
    return { isValid: false, wordCount, charCount, error: 'Max 120 characters allowed!' };
  }
  if (wordCount > 6) {
    return { isValid: false, wordCount, charCount, error: 'Keep it punchy: maximum 6 words!' };
  }

  return { isValid: true, wordCount, charCount };
}

// 10 Curated Authentic Sri Lankan Singlish & English Party Questions
export const SRI_LANKAN_PROMPTS: GamePrompt[] = [
  {
    id: 'p1',
    category: 'banter',
    promptEnglish: 'What is the most dangerous sentence to utter to an angry Sri Lankan Amma?',
    promptSinglish: 'Amma mata bath epa, kottu kaawa',
  },
  {
    id: 'p2',
    category: 'relatable',
    promptEnglish: 'A tuk-tuk driver says: "Meter is broken, but don\'t worry machan, I will charge normal." How much does he actually charge?',
    promptSinglish: 'Meter kadila, shape eke yamu machan',
  },
  {
    id: 'p3',
    category: 'party',
    promptEnglish: 'What is the ultimate strategy to attack the Sri Lankan wedding buffet dessert table?',
    promptSinglish: 'Watalappam and ice cream double scoop tactics',
  },
  {
    id: 'p4',
    category: 'banter',
    promptEnglish: 'Your friend says "On the way, 5 minutes machan!" Where are they actually right now?',
    promptSinglish: 'Thama bath kanawa or thama gedara',
  },
  {
    id: 'p5',
    category: 'relatable',
    promptEnglish: 'What item does every Sri Lankan father keep in the glove compartment "just in case"?',
    promptSinglish: 'Ape thaaththala gaawa thiyena unhithu dewal',
  },
  {
    id: 'p6',
    category: 'banter',
    promptEnglish: 'What is the fastest way to get kicked out of a big match tent or baila session?',
    promptSinglish: 'Papare band eka madhata gihilla dance eka kadana eka',
  },
  {
    id: 'p7',
    category: 'relatable',
    promptEnglish: 'What is your best excuse when you are 3 hours late to a friends trip meetup at Galle Face?',
    promptSinglish: 'Traffic Galle road eke full block wela',
  },
  {
    id: 'p8',
    category: 'food',
    promptEnglish: 'The clock strikes 2:30 AM in Colombo. What unholy food combo are you craving?',
    promptSinglish: 'Roast paan with pol sambol and cheese kottu',
  },
  {
    id: 'p9',
    category: 'banter',
    promptEnglish: 'What is the most awkward question your neighbourhood auntie asks at a party?',
    promptSinglish: 'Putha thama job ekak set une nadda?',
  },
  {
    id: 'p10',
    category: 'party',
    promptEnglish: 'FINALE: Describe this friend group in 6 words or less before the baila starts!',
    promptSinglish: 'Double points round! Full aathal machan!',
  },
];

// Mock bots with authentic Singlish responses for each prompt
export const MOCK_BOT_PLAYERS = [
  { id: 'bot-1', nickname: 'Kasun K', avatar: 'tuktuk' as const, isBot: true },
  { id: 'bot-2', nickname: 'Shenali M', avatar: 'peacock' as const, isBot: true },
  { id: 'bot-3', nickname: 'Dinuka R', avatar: 'kottu' as const, isBot: true },
  { id: 'bot-4', nickname: 'Kaveen D', avatar: 'cricket' as const, isBot: true },
];

export const MOCK_BOT_ANSWERS: Record<string, string[]> = {
  p1: [
    'Oya kiyana dewal therune na',
    'Dinner already had with friends',
    'Amme bath eke lunu wadi',
    'I will wash plates tomorrow',
  ],
  p2: [
    'Flight ticket price for 2km',
    'Three times petrol bill cost',
    'Gedara idan Galle yanawa wage',
    'Just two thousand rupees extra',
  ],
  p3: [
    'Fill plate before aunties arrive',
    'Pocket puding inside serviette napkins',
    'Watalappam bowl first, rice later',
    'Send cousin to block queue',
  ],
  p4: [
    'Thama towel eka pita udin',
    'Sleeping peacefully under bedroom ceiling fan',
    'Looking for car keys everywhere',
    'Ironing shirt at 100 degrees',
  ],
  p5: [
    'Ten plastic bags inside bag',
    'Old torch with dead battery',
    'Expired Panadol strips and balm',
    'Folded newspaper from year 2012',
  ],
  p6: [
    'Requesting English slow love ballad',
    'Spilling lion lager on papare drum',
    'Telling referee to stop noise',
    'Wearing opposite school rugby jersey',
  ],
  p7: [
    'Heavy rain near Dehiwala bridge',
    'Tyre puncture twice in row',
    'Grandma cat felt very sick',
    'Google maps sent to Kandy',
  ],
  p8: [
    'Palandi cheese kottu with milo',
    'Spicy isso wade extra lime',
    'Roast chicken hopper with gravy',
    'Sweet bun dipped in tea',
  ],
  p9: [
    'When are you marrying daughter?',
    'Why salary so small son?',
    'Have you gained weight machan?',
    'When buying your own car?',
  ],
  p10: [
    'Pure chaos, zero brain cells',
    'Always late, forever best machans',
    'Hungry lions searching for food',
    'Loudest table in whole town',
  ],
};
