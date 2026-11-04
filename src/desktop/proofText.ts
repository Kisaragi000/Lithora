// Proofreading messages in the interface's language. The checks name their issues in the
// language of the text they read (a Russian rule in Russian, a shared rule in English), so the
// common ones are looked up here; anything else (Harper's English style notes) shows as written.
import type { Strings } from './strings';

type Key =
  | 'proofRepeated'
  | 'proofExtraSpace'
  | 'proofSpaceBefore'
  | 'proofCommaSpace'
  | 'proofCapital'
  | 'proofArmenianStop'
  | 'proofRepeatedMark';

const EXACT: Record<string, Key> = {
  'This word is repeated.': 'proofRepeated',
  'Слово повторяется.': 'proofRepeated',
  'Բառը կրկնվում է։': 'proofRepeated',
  'Extra space': 'proofExtraSpace',
  'Extra spaces between words.': 'proofExtraSpace',
  'Лишние пробелы между словами.': 'proofExtraSpace',
  'Ավելորդ բացատներ բառերի միջև։': 'proofExtraSpace',
  'Двойной пробел': 'proofExtraSpace',
  'Remove the space before the punctuation': 'proofSpaceBefore',
  'No space before punctuation.': 'proofSpaceBefore',
  'Перед знаком препинания пробел не нужен.': 'proofSpaceBefore',
  'Կետադրական նշանից առաջ բացատ պետք չէ։': 'proofSpaceBefore',
  'Лишний пробел перед знаком препинания': 'proofSpaceBefore',
  'Add a space after the comma.': 'proofCommaSpace',
  'После запятой нужен пробел.': 'proofCommaSpace',
  'Ստորակետից հետո բացատ է պետք։': 'proofCommaSpace',
  'Capitalize the first word of a sentence': 'proofCapital',
  'Предложение начинается со строчной буквы': 'proofCapital',
  'Հայերենում նախադասությունն ավարտվում է վերջակետով (։)։': 'proofArmenianStop',
  'Повтор знака препинания': 'proofRepeatedMark',
};

/** The issue's message in the interface's language, where Lithora knows it. */
export function issueMessage(t: Strings, kind: string, message: string): string {
  if (kind === 'spelling') return t.possibleMisspelling;
  const key = EXACT[message];
  if (key) return t[key];
  if (message.startsWith('Повтор слова:')) return t.proofRepeated;
  const comma = message.match(/^Возможно, пропущена запятая перед «(.+)»$/);
  if (comma) return t.proofMissingComma.replace('{word}', comma[1]);
  return message;
}

/** A suggestion as a button label: a space (which would show as nothing) gets a name. */
export function suggestionLabel(t: Strings, s: string): string {
  if (s === '') return t.deleteText;
  if (s.trim() === '') return `␣ ${t.oneSpace}`;
  return s.replace(/ /g, ' ');
}
