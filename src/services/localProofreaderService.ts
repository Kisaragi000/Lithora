/**
 * Lithora Enterprise Local AI Proofreading Engine
 * 
 * 100% Local, Offline Desktop Rule-Based & Linguistic Proofreader for:
 * - English (EN): Homophones, grammar, indefinite articles, misspellings, style & typography
 * - Russian (RU): -тся/-ться, fused words (не знаю, в общем), common typos, grammar, commas before clauses
 * - Armenian (HY / ARM): Definite articles (-ը vs -ն before vowels/consonants), modern orthography (նաև, էական, etc.), Armenian verjaket (։) / buth (՝) punctuation
 */

export type ProofreadLanguage = 'auto' | 'en' | 'ru' | 'hy';

export type ProofreadIssueType =
  | 'spelling'
  | 'grammar'
  | 'style'
  | 'punctuation'
  | 'article'
  | 'typography';

export interface ProofreadSuggestion {
  id: string;
  original: string;
  replacement: string;
  startIndex: number;
  endIndex: number;
  type: ProofreadIssueType;
  language: 'en' | 'ru' | 'hy';
  explanation: string;
}

export interface ProofreadSummary {
  detectedLanguage: 'en' | 'ru' | 'hy' | 'mixed';
  suggestions: ProofreadSuggestion[];
  totalCheckedWords: number;
  executionTimeMs: number;
  isLocal: boolean;
}

/* =========================================================================
   1. DICTIONARIES & RULE MATRICES
   ========================================================================= */

// Common English Misspellings & Slips
const EN_MISSPELLINGS: Record<string, string> = {
  'teh': 'the',
  'recieve': 'receive',
  'recieved': 'received',
  'recieving': 'receiving',
  'seperate': 'separate',
  'seperated': 'separated',
  'seperation': 'separation',
  'definately': 'definitely',
  'occured': 'occurred',
  'occurence': 'occurrence',
  'untill': 'until',
  'truely': 'truly',
  'goverment': 'government',
  'wierd': 'weird',
  'acheive': 'achieve',
  'acheived': 'achieved',
  'accomodate': 'accommodate',
  'accomodation': 'accommodation',
  'calender': 'calendar',
  'tommorrow': 'tomorrow',
  'embarass': 'embarrass',
  'embarassing': 'embarrassing',
  'neccessary': 'necessary',
  'priviledge': 'privilege',
  'enviroment': 'environment',
  'existense': 'existence',
  'maintainance': 'maintenance',
  'posession': 'possession',
  'pronounciation': 'pronunciation',
  'recommand': 'recommend',
  'recommanded': 'recommended',
  'suprise': 'surprise',
  'suprised': 'surprised',
  'succesful': 'successful',
  'succesfully': 'successfully',
  'alot': 'a lot',
  'noone': 'no one',
  'basicly': 'basically',
  'publically': 'publicly',
  'concious': 'conscious',
  'noticable': 'noticeable',
  'writting': 'writing',
  'comming': 'coming',
  'judgemental': 'judgmental',
};

// Common English Phrase & Grammar Rules
interface PhraseRule {
  pattern: RegExp;
  replacement: string | ((match: string, ...args: string[]) => string);
  type: ProofreadIssueType;
  explanation: string;
}

const EN_PHRASE_RULES: PhraseRule[] = [
  // Homophones / Confusables
  {
    pattern: /\btheir\s+(is|are|was|were)\b/gi,
    replacement: 'there $1',
    type: 'grammar',
    explanation: "Use 'there' to indicate existence or location, rather than possessive 'their'.",
  },
  {
    pattern: /\bthere\s+(car|house|document|file|team|work|computer|keys|opinion)\b/gi,
    replacement: 'their $1',
    type: 'grammar',
    explanation: "Use possessive 'their' instead of directional 'there'.",
  },
  {
    pattern: /\byour\s+(welcome|going|invited|ready|correct|wrong|able)\b/gi,
    replacement: "you're $1",
    type: 'grammar',
    explanation: "Use contraction 'you're' (you are) instead of possessive 'your'.",
  },
  {
    pattern: /\byou're\s+(file|document|account|name|phone|computer|settings)\b/gi,
    replacement: 'your $1',
    type: 'grammar',
    explanation: "Use possessive 'your' instead of contraction 'you're'.",
  },
  {
    pattern: /\bit's\s+(features|feature|color|title|margins|properties|settings|size|format|content)\b/gi,
    replacement: 'its $1',
    type: 'grammar',
    explanation: "Use possessive 'its' without an apostrophe for an object's attributes.",
  },
  {
    pattern: /\bits\s+(a|an|the|important|essential|necessary|ready|done|recommended|clear)\b/gi,
    replacement: "it's $1",
    type: 'grammar',
    explanation: "Use contraction 'it's' (it is) instead of possessive 'its'.",
  },
  {
    pattern: /\b(could|should|would|must)\s+of\b/gi,
    replacement: '$1 have',
    type: 'grammar',
    explanation: "Use '$1 have' instead of '$1 of'.",
  },
  {
    pattern: /\bsuppose\s+to\b/gi,
    replacement: 'supposed to',
    type: 'grammar',
    explanation: "The standard idiomatic expression is 'supposed to'.",
  },
  {
    pattern: /\buse\s+to\s+(be|have|do|go|write)\b/gi,
    replacement: 'used to $1',
    type: 'grammar',
    explanation: "Use 'used to' when expressing past habitual actions or states.",
  },
  {
    pattern: /\bhave\s+an\s+affect\s+on\b/gi,
    replacement: 'have an effect on',
    type: 'grammar',
    explanation: "'Effect' is the noun (result), while 'affect' is usually a verb.",
  },
  // Indefinite Article A vs AN before vowels
  {
    pattern: /\ba\s+(apple|orange|egg|idea|hour|honor|error|option|issue|element|exception|overview|application|update|instance)\b/gi,
    replacement: 'an $1',
    type: 'article',
    explanation: "Use 'an' before words beginning with a vowel sound.",
  },
  {
    pattern: /\ban\s+(document|book|user|file|table|page|paragraph|line|column|format|word|sentence|system|window)\b/gi,
    replacement: 'a $1',
    type: 'article',
    explanation: "Use 'a' before words beginning with a consonant sound.",
  },
  // Concise Style Suggestions
  {
    pattern: /\bin\s+order\s+to\b/gi,
    replacement: 'to',
    type: 'style',
    explanation: "Simplify 'in order to' to just 'to' for concise, clear prose.",
  },
  {
    pattern: /\bat\s+this\s+point\s+in\s+time\b/gi,
    replacement: 'currently',
    type: 'style',
    explanation: "Replace wordy 'at this point in time' with 'currently' or 'now'.",
  },
  {
    pattern: /\bdue\s+to\s+the\s+fact\s+that\b/gi,
    replacement: 'because',
    type: 'style',
    explanation: "Simplify 'due to the fact that' to 'because'.",
  },
  {
    pattern: /\beach\s+and\s+every\b/gi,
    replacement: 'every',
    type: 'style',
    explanation: "Use 'every' to eliminate redundancy.",
  },
  // Repetitions
  {
    pattern: /\b(the|in|to|and|is|that|of|it)\s+\1\b/gi,
    replacement: '$1',
    type: 'grammar',
    explanation: "Removed duplicate word repetition.",
  },
];

// Common Russian Misspellings & Rules
const RU_MISSPELLINGS: Record<string, string> = {
  'незнаю': 'не знаю',
  'немогу': 'не могу',
  'нехочу': 'не хочу',
  'небуду': 'не буду',
  'вообщем': 'в общем',
  'врятли': 'вряд ли',
  'врядли': 'вряд ли',
  'потомучто': 'потому что',
  'зделал': 'сделал',
  'зделала': 'сделала',
  'зделать': 'сделать',
  'сдесь': 'здесь',
  'ихний': 'их',
  'ихняя': 'их',
  'ихнее': 'их',
  'ихние': 'их',
  'евонный': 'его',
  'ейный': 'её',
  'ложить': 'класть',
  'симпотичный': 'симпатичный',
  'симпотичная': 'симпатичная',
  'превередливый': 'привередливый',
  'согластно': 'согласно',
  'экспрессо': 'эспрессо',
  'лудший': 'лучший',
  'будующий': 'будущий',
  'следущий': 'следующий',
  'придти': 'прийти',
  'инциндент': 'инцидент',
  'прецендент': 'прецедент',
  'координально': 'кардинально',
  'черезвычайно': 'чрезвычайно',
  'агенство': 'агентство',
  'лесница': 'лестница',
  'чуство': 'чувство',
  'здраствуйте': 'здравствуйте',
  'пожалуйсто': 'пожалуйста',
  'учавствовать': 'участвовать',
  'рассписание': 'расписание',
  'безпрекословно': 'беспрекословно',
  'по тихоньку': 'потихоньку',
  'как будто бы': 'как будто',
};

const RU_PHRASE_RULES: PhraseRule[] = [
  // ТСЯ / ТЬСЯ rules
  {
    pattern: /\b(должен|должна|должно|должны|нужно|надо|хочет|хотят|будет|будут|может|могут|нельзя|не\s+стоит)\s+([а-яё]+)тся\b/gi,
    replacement: '$1 $2ться',
    type: 'grammar',
    explanation: "В инфинитиве (отвечает на вопрос «что делать? / что сделать?») пишется мягкий знак: «-ться».",
  },
  {
    pattern: /\b(он|она|оно|это|документ|текст|система|шрифт|файл)\s+([а-яё]+)ться\b/gi,
    replacement: '$1 $2тся',
    type: 'grammar',
    explanation: "В 3-м лице (отвечает на вопрос «что делает? / что делают?») мягкий знак не пишется: «-тся».",
  },
  // В течение / В продолжение
  {
    pattern: /\bв\s+течении\s+(дня|года|месяца|времени|недели|минуты|часа|срока|процесса)\b/gi,
    replacement: 'в течение $1',
    type: 'spelling',
    explanation: "При указании на промежуток времени производный предлог пишется с буквой «е»: «в течение».",
  },
  {
    pattern: /\bв\s+следствии\s+(этого|ошибки|проблемы)\b/gi,
    replacement: 'вследствие $1',
    type: 'spelling',
    explanation: "Производный предлог в значении «из-за» пишется слитно и с буквой «е»: «вследствие».",
  },
  {
    pattern: /\bдень\s+рождение\b/gi,
    replacement: 'день рождения',
    type: 'grammar',
    explanation: "Существительное «рождение» в словосочетании «день рождения» ставится в родительный падеж («день чего?»).",
  },
  {
    pattern: /\b(одеть|одел|одела)\s+(пальто|куртку|плащ|шляпу|костюм)\b/gi,
    replacement: 'надеть $2',
    type: 'style',
    explanation: "Надевают одежду на себя, а одевают кого-то другого: «надеть пальто».",
  },
  // Missing comma before clauses (Russian)
  {
    pattern: /\b([а-яё]+)\s+(что|чтобы|который|которая|которое|которые|потому\s+что|если|хотя)\b/gi,
    replacement: (match, p1, p2) => {
      // Do not add if already preceded by punctuation or preposition
      if (['и', 'или', 'а', 'но', 'да', 'не', 'ли'].includes(p1.toLowerCase())) return match;
      return `${p1}, ${p2}`;
    },
    type: 'punctuation',
    explanation: "Перед придаточной частью сложного предложения («что», «чтобы», «который» и др.) ставится запятая.",
  },
  {
    pattern: /\b([а-яё]+)\s+(но|а)\s+([а-яё]+)\b/gi,
    replacement: '$1, $2 $3',
    type: 'punctuation',
    explanation: "Перед противительными союзами «но» и «а» всегда ставится запятая.",
  },
  // Repeated Russian words
  {
    pattern: /\b(и|в|на|что|с|по|к)\s+\1\b/gi,
    replacement: '$1',
    type: 'grammar',
    explanation: "Удалено ошибочное повторение слова.",
  },
];

// Armenian Orthography & Linguistic Rules
const HY_MISSPELLINGS: Record<string, string> = {
  'միգուցէ': 'միգուցե',
  'նաեւ': 'նաև',
  'նաեվ': 'նաև',
  'այլեւս': 'այլևս',
  'որեւէ': 'որևէ',
  'եական': 'էական',
  'ամենաեական': 'ամենաէական',
  'ելեկտրոն': 'էլեկտրոն',
  'ելեկտրոնային': 'էլեկտրոնային',
  'ովկիանոս': 'օվկիանոս',
  'առօրեա': 'առօրյա',
  'միքանի': 'մի քանի',
  'միշարք': 'մի շարք',
  'այս ինքն': 'այսինքն',
  'այնու ամենայնիվ': 'այնուամենայնիվ',
  'ով-որ': 'ով որ',
  'ինչ որ': 'ինչ-որ',
  'շնորհակալեմ': 'շնորհակալ եմ',
  'հաջողութիւն': 'հաջողություն',
  'կապակցութեամբ': 'կապակցությամբ',
  'անհրաժեշտութիւն': 'անհրաժեշտություն',
  'հնարաւոր': 'հնարավոր',
};

const HY_PHRASE_RULES: PhraseRule[] = [
  // Definite article rule: word ends in -ը followed by a word starting with vowel
  // Armenian vowels: ա, ե, է, ը, ի, ո, օ, ու
  {
    pattern: /([\u0531-\u0556\u0561-\u0587]+)ը\s+([աեէըիոօ]|ու)([\u0531-\u0556\u0561-\u0587]*)/gi,
    replacement: '$1ն $2$3',
    type: 'article',
    explanation: "Հայերենի որոշյալ հոդի կանոն. ձայնավորով սկսվող հաջորդ բառից առաջ գործածվում է «ն» հոդը (օր.՝ «գիրքն ընկավ», ոչ թե «գիրքը ընկավ»)։",
  },
  // Definite article rule: word ends in -ն followed by a word starting with a consonant
  // Armenian consonants
  {
    pattern: /([\u0531-\u0556\u0561-\u0587]+)ն\s+([բգդզթժլխծկհձղճմյնշչպջռսվտրցփքֆ])([\u0531-\u0556\u0561-\u0587]*)/gi,
    replacement: '$1ը $2$3',
    type: 'article',
    explanation: "Բաղաձայնով սկսվող հաջորդ բառից առաջ գործածվում է «ը» որոշյալ հոդը (օր.՝ «մարդը գնաց», ոչ թե «մարդն գնաց»)։",
  },
  // Armenian sentence ending punctuation: Replace Latin semicolon or colon with Armenian Verjaket (։)
  {
    pattern: /([\u0531-\u0556\u0561-\u0587]+)([:;])(\s|$)/g,
    replacement: '$1։$3',
    type: 'punctuation',
    explanation: "Հայերեն տեքստի ավարտին գործածվում է հայկական վերջակետ («։»), ոչ թե լատինական երկկետ («:») կամ կետ-ստորակետ («;»)։",
  },
  // Repeated Armenian words
  {
    pattern: /([\u0531-\u0556\u0561-\u0587]+)\s+\1\b/gi,
    replacement: '$1',
    type: 'grammar',
    explanation: "Հեռացված է նույն բառի ավելորդ կրկնությունը։",
  },
];

/* =========================================================================
   2. LANGUAGE DETECTION
   ========================================================================= */

export function detectDocumentLanguage(text: string): 'en' | 'ru' | 'hy' | 'mixed' {
  if (!text) return 'en';

  const cyrillicMatches = text.match(/[\u0400-\u04FF]/g) || [];
  const armenianMatches = text.match(/[\u0530-\u058F]/g) || [];
  const latinMatches = text.match(/[A-Za-z]/g) || [];

  const cyrCount = cyrillicMatches.length;
  const armCount = armenianMatches.length;
  const latCount = latinMatches.length;

  const total = cyrCount + armCount + latCount;
  if (total === 0) return 'en';

  if (armCount / total > 0.3) return 'hy';
  if (cyrCount / total > 0.3) return 'ru';
  if (latCount / total > 0.5) return 'en';

  return 'mixed';
}

/* =========================================================================
   3. CORE PROOFREADING RUNNER (100% LOCAL & OFFLINE)
   ========================================================================= */

/**
 * Proofreads text locally using deterministic spelling, grammatical,
 * orthographic, article, and punctuation rule sets.
 */
export function proofreadTextLocally(
  text: string,
  targetLanguage: ProofreadLanguage = 'auto'
): ProofreadSummary {
  const startTime = performance.now();
  const suggestions: ProofreadSuggestion[] = [];

  const detected = detectDocumentLanguage(text);
  const langToUse = targetLanguage === 'auto' ? detected : targetLanguage;

  const runEnglish = langToUse === 'en' || langToUse === 'mixed';
  const runRussian = langToUse === 'ru' || langToUse === 'mixed';
  const runArmenian = langToUse === 'hy' || langToUse === 'mixed';

  // Words count estimate
  const words = text.trim().split(/\s+/).filter(Boolean);
  const totalCheckedWords = words.length;

  let issueCounter = 0;

  // 1. Check English Misspellings & Rules
  if (runEnglish) {
    // Word-level spelling check
    const wordRegex = /\b[A-Za-z]+(?:'[A-Za-z]+)?\b/g;
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(text)) !== null) {
      const originalWord = match[0];
      const lower = originalWord.toLowerCase();
      if (EN_MISSPELLINGS[lower]) {
        let replacement = EN_MISSPELLINGS[lower];
        // Preserve original case
        if (originalWord[0] === originalWord[0].toUpperCase()) {
          replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        suggestions.push({
          id: `en_spell_${issueCounter++}`,
          original: originalWord,
          replacement,
          startIndex: match.index,
          endIndex: match.index + originalWord.length,
          type: 'spelling',
          language: 'en',
          explanation: `Spelling suggestion: replace '${originalWord}' with '${replacement}'.`,
        });
      }
    }

    // Phrase & Grammar rules
    for (const rule of EN_PHRASE_RULES) {
      rule.pattern.lastIndex = 0;
      let pMatch: RegExpExecArray | null;
      while ((pMatch = rule.pattern.exec(text)) !== null) {
        const originalPhrase = pMatch[0];
        let replacement = '';
        if (typeof rule.replacement === 'function') {
          replacement = rule.replacement(originalPhrase, ...(pMatch.slice(1)));
        } else {
          replacement = originalPhrase.replace(rule.pattern, rule.replacement);
        }

        if (replacement && replacement !== originalPhrase) {
          suggestions.push({
            id: `en_rule_${issueCounter++}`,
            original: originalPhrase,
            replacement,
            startIndex: pMatch.index,
            endIndex: pMatch.index + originalPhrase.length,
            type: rule.type,
            language: 'en',
            explanation: rule.explanation,
          });
        }
      }
    }
  }

  // 2. Check Russian Misspellings & Rules
  if (runRussian) {
    const ruWordRegex = /\b[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)?\b/g;
    let match: RegExpExecArray | null;
    while ((match = ruWordRegex.exec(text)) !== null) {
      const originalWord = match[0];
      const lower = originalWord.toLowerCase();
      if (RU_MISSPELLINGS[lower]) {
        let replacement = RU_MISSPELLINGS[lower];
        if (originalWord[0] === originalWord[0].toUpperCase()) {
          replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        suggestions.push({
          id: `ru_spell_${issueCounter++}`,
          original: originalWord,
          replacement,
          startIndex: match.index,
          endIndex: match.index + originalWord.length,
          type: 'spelling',
          language: 'ru',
          explanation: `Исправление: замените «${originalWord}» на «${replacement}».`,
        });
      }
    }

    // Russian Phrase & Grammar rules
    for (const rule of RU_PHRASE_RULES) {
      rule.pattern.lastIndex = 0;
      let pMatch: RegExpExecArray | null;
      while ((pMatch = rule.pattern.exec(text)) !== null) {
        const originalPhrase = pMatch[0];
        let replacement = '';
        if (typeof rule.replacement === 'function') {
          replacement = rule.replacement(originalPhrase, ...(pMatch.slice(1)));
        } else {
          replacement = originalPhrase.replace(rule.pattern, rule.replacement);
        }

        if (replacement && replacement !== originalPhrase) {
          suggestions.push({
            id: `ru_rule_${issueCounter++}`,
            original: originalPhrase,
            replacement,
            startIndex: pMatch.index,
            endIndex: pMatch.index + originalPhrase.length,
            type: rule.type,
            language: 'ru',
            explanation: rule.explanation,
          });
        }
      }
    }
  }

  // 3. Check Armenian Rules & Orthography
  if (runArmenian) {
    const hyWordRegex = /\b[\u0531-\u0556\u0561-\u0587]+(?:-[\u0531-\u0556\u0561-\u0587]+)?\b/g;
    let match: RegExpExecArray | null;
    while ((match = hyWordRegex.exec(text)) !== null) {
      const originalWord = match[0];
      const lower = originalWord.toLowerCase();
      if (HY_MISSPELLINGS[lower]) {
        let replacement = HY_MISSPELLINGS[lower];
        if (originalWord[0] === originalWord[0].toUpperCase()) {
          replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        suggestions.push({
          id: `hy_spell_${issueCounter++}`,
          original: originalWord,
          replacement,
          startIndex: match.index,
          endIndex: match.index + originalWord.length,
          type: 'spelling',
          language: 'hy',
          explanation: `Ուղղագրություն. առաջարկվում է «${originalWord}»-ը փոխարինել «${replacement}»-ով։`,
        });
      }
    }

    // Armenian Phrase & Grammar rules
    for (const rule of HY_PHRASE_RULES) {
      rule.pattern.lastIndex = 0;
      let pMatch: RegExpExecArray | null;
      while ((pMatch = rule.pattern.exec(text)) !== null) {
        const originalPhrase = pMatch[0];
        let replacement = '';
        if (typeof rule.replacement === 'function') {
          replacement = rule.replacement(originalPhrase, ...(pMatch.slice(1)));
        } else {
          replacement = originalPhrase.replace(rule.pattern, rule.replacement);
        }

        if (replacement && replacement !== originalPhrase) {
          suggestions.push({
            id: `hy_rule_${issueCounter++}`,
            original: originalPhrase,
            replacement,
            startIndex: pMatch.index,
            endIndex: pMatch.index + originalPhrase.length,
            type: rule.type,
            language: 'hy',
            explanation: rule.explanation,
          });
        }
      }
    }
  }

  // Universal typography rules (spacing before commas/periods, double spaces)
  const typographySpaceRegex = /([a-zA-Zа-яА-ЯёЁ\u0531-\u0556\u0561-\u0587])\s+([,.:;?!])/g;
  let typoMatch: RegExpExecArray | null;
  while ((typoMatch = typographySpaceRegex.exec(text)) !== null) {
    const original = typoMatch[0];
    const replacement = `${typoMatch[1]}${typoMatch[2]}`;
    suggestions.push({
      id: `typo_${issueCounter++}`,
      original,
      replacement,
      startIndex: typoMatch.index,
      endIndex: typoMatch.index + original.length,
      type: 'typography',
      language: langToUse === 'mixed' ? 'en' : langToUse,
      explanation: 'Remove extraneous space before punctuation.',
    });
  }

  // Sort suggestions by startIndex
  suggestions.sort((a, b) => a.startIndex - b.startIndex);

  // Filter overlapping suggestions to avoid DOM collisions
  const filteredSuggestions: ProofreadSuggestion[] = [];
  let lastEnd = -1;
  for (const s of suggestions) {
    if (s.startIndex >= lastEnd) {
      filteredSuggestions.push(s);
      lastEnd = s.endIndex;
    }
  }

  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    detectedLanguage: detected,
    suggestions: filteredSuggestions,
    totalCheckedWords,
    executionTimeMs,
    isLocal: true,
  };
}

/* =========================================================================
   4. DOM / HTML MARKING UTILITIES (LAVENDER HIGHLIGHTS)
   ========================================================================= */

/**
 * Escapes characters for safe HTML attribute injection
 */
function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Wraps occurrences of suggested corrections in editor HTML with
 * `.proofread-lavender-mark` spans.
 */
export function injectLavenderMarksIntoHtml(
  html: string,
  suggestions: ProofreadSuggestion[]
): string {
  if (!suggestions || suggestions.length === 0) return html;

  // First, strip any existing proofread spans so we do not nest them
  let cleanHtml = clearLavenderMarksFromHtml(html);

  // Apply suggestions that match exact phrases
  // We sort by length descending to match longer phrases before shorter substrings
  const sorted = [...suggestions].sort((a, b) => b.original.length - a.original.length);

  for (const item of sorted) {
    // Regex that avoids matching inside HTML tags or attributes
    const escapedOriginal = item.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<!<[^>]*)(${escapedOriginal})(?![^<]*>)`, 'g');

    cleanHtml = cleanHtml.replace(regex, (match) => {
      return `<span class="proofread-lavender-mark" data-proofread-id="${item.id}" data-original="${escapeAttr(
        match
      )}" data-replacement="${escapeAttr(item.replacement)}" data-type="${item.type}" data-lang="${
        item.language
      }" data-explanation="${escapeAttr(item.explanation)}" title="Suggested: ${escapeAttr(
        item.replacement
      )}">${match}</span>`;
    });
  }

  return cleanHtml;
}

/**
 * Strips all `.proofread-lavender-mark` spans while keeping their inner text.
 */
export function clearLavenderMarksFromHtml(html: string): string {
  if (!html) return html;
  return html.replace(/<span\s+class="proofread-lavender-mark"[^>]*>([\s\S]*?)<\/span>/gi, '$1');
}

/**
 * Accepts a single suggestion by replacing the specific `.proofread-lavender-mark`
 * with its suggested replacement.
 */
export function acceptSuggestionInHtml(html: string, suggestionId: string): string {
  const regex = new RegExp(
    `<span\\s+class="proofread-lavender-mark"\\s+data-proofread-id="${suggestionId}"[\\s\\S]*?data-replacement="([^"]*)"[\\s\\S]*?>[\\s\\S]*?<\\/span>`,
    'i'
  );
  return html.replace(regex, (match, replacement) => {
    // Unescape &amp; &quot; etc
    const doc = new DOMParser().parseFromString(replacement, 'text/html');
    return doc.body.textContent || replacement;
  });
}

/**
 * Dismisses a single suggestion without changing the text (unwraps the span).
 */
export function dismissSuggestionInHtml(html: string, suggestionId: string): string {
  const regex = new RegExp(
    `<span\\s+class="proofread-lavender-mark"\\s+data-proofread-id="${suggestionId}"[\\s\\S]*?>([\\s\\S]*?)<\\/span>`,
    'i'
  );
  return html.replace(regex, '$1');
}

/**
 * Accepts all suggestions in one click.
 */
export function acceptAllSuggestionsInHtml(html: string): string {
  return html.replace(
    /<span\s+class="proofread-lavender-mark"[\s\S]*?data-replacement="([^"]*)"[\s\S]*?>[\s\S]*?<\/span>/gi,
    (match, replacement) => {
      const doc = new DOMParser().parseFromString(replacement, 'text/html');
      return doc.body.textContent || replacement;
    }
  );
}
