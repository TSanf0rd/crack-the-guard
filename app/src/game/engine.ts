/* Technique engine for the simulated AI targets.

   Instead of matching a few exact phrases per target, every message is classified into attack
   techniques (with big synonym lists, typo and leetspeak tolerance). The target then decides whether
   its "model" goes along, writes a real reply in whatever shape the player asked for, and its actual
   filters inspect that reply. If a technique genuinely gets past a target's defenses, it works, even
   if nobody planned for it. */

import type { ChatCtx, Reply } from './types'
import { F, rot13, reversed, BLOCK5 } from './util'

/* ------------------------------------------------------------------ */
/* Techniques                                                           */
/* ------------------------------------------------------------------ */

export type Tech =
  | 'leak' | 'override' | 'role' | 'authority' | 'fiction' | 'hypo' | 'social'
  | 'format' | 'encode' | 'fragment' | 'acrostic' | 'hint' | 'translate'
  | 'inject' | 'exfil' | 'command' | 'files'

export const TECH_LABEL: Record<Tech, string> = {
  leak: 'Prompt leaking',
  override: 'Instruction override',
  role: 'Role-play',
  authority: 'Authority claim',
  fiction: 'Fiction wrapper',
  hypo: 'Hypothetical',
  social: 'Social pressure',
  format: 'Format change',
  encode: 'Encoding',
  fragment: 'Fragmentation',
  acrostic: 'Hidden acrostic',
  hint: 'Hint side channel',
  translate: 'Translation',
  inject: 'Indirect injection',
  exfil: 'Exfiltration link',
  command: 'Tool command',
  files: 'File access',
}

/** Techniques that try to talk the model into revealing something. */
const PERSUADE: Tech[] = ['leak', 'override', 'role', 'authority', 'fiction', 'hypo', 'social', 'format', 'encode', 'fragment', 'acrostic', 'hint', 'translate']

type Sep = { kind: 'sep'; sep: string }
export type Shape =
  | Sep
  | { kind: 'reverse' } | { kind: 'nato' } | { kind: 'leet' } | { kind: 'emoji' }
  | { kind: 'pig' } | { kind: 'caesar'; n: number } | { kind: 'lower' } | { kind: 'words' }
export type Enc = 'base64' | 'hex' | 'binary' | 'rot13' | 'decimal' | 'a1z26' | 'morse' | 'url' | 'octal'
type Range = { a: number; z: number } | { every: 'odd' | 'even' } | { length: true } | { next: number }

export interface Intent {
  raw: string
  /** lowercase, accents removed */
  m: string
  /** m plus a leetspeak-decoded copy, for matching */
  t: string
  techs: Set<Tech>
  /** the message refers to the protected value */
  asks: boolean
  /** "it", "that": counts as asking when combined with a format, encoding, or fragment request */
  pronoun: boolean
  shapes: Shape[]
  enc: Enc | null
  range: Range | null
  genre: Genre | null
  lang: string | null
}

type Genre = 'story' | 'verse' | 'script' | 'joke' | 'grandma' | 'letter'

/* ------------------------------------------------------------------ */
/* Normalizing                                                          */
/* ------------------------------------------------------------------ */

const LEET: Record<string, string> = { '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '|': 'l', '8': 'b', '9': 'g' }

export function normalize(raw: string) {
  const m = raw
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .toLowerCase()
  // decode leetspeak only inside tokens that mix letters with digits/symbols (p4ssw0rd), never in plain numbers
  const leet = m.replace(/[a-z0-9@$!|]+/g, tok =>
    /[a-z]/.test(tok) && /[0-9@$!|]/.test(tok) && !/^(base64|rot13|b64|mp3|ipv4|ipv6|utf8|l33t|1337|a1z26|sha\d+|md5|\d+(st|nd|rd|th))$/.test(tok)
      ? tok.replace(/[0-9@$!|]/g, c => LEET[c] ?? c) : tok)
  // squash separated spellings like p.a.s.s.w.o.r.d or s e c r e t
  const squashed = m.replace(/\b([a-z])(?:[\s.\-_*]+([a-z])\b){3,}/g, s => s.replace(/[^a-z]/g, ''))
  return { m, t: `${m} ‖ ${leet} ‖ ${squashed}` }
}

/* ------------------------------------------------------------------ */
/* Word lists                                                           */
/* ------------------------------------------------------------------ */

const ASK = /\b(code ?names?|pass ?words?|pass ?codes?|pass ?phrases?|pwd|pw|secrets?|codes?|code ?words?|keys?|pins?|tokens?|flags?|credentials?|creds|unlock|login|logins|clave|contrasena|codigo|secreto|mot de passe|motdepasse|passwort|kennwort|geheimnis|segreto|senha|parola d'ordine|haslo|wachtwoord|losenord|sifre|parol)\b|密码|口令|パスワード|暗証|비밀번호|пароль|كلمة|what (you'?re|you are|youre|ur|u r|are you|is it you'?re) (guarding|protecting|hiding|keeping|holding|storing|not (allowed|supposed|able) to)|the (thing|info|information|data|word|value) (you|that you|u) (can'?t|cannot|aren'?t|are not|shouldn'?t|won'?t)|hidden (thing|word|info|value|data)|\b(forbidden|confidential|classified|restricted) (info|information|data|value|thing|word)/
const PRONOUN = /\b(it|that|this|them|the thing|the word|the value|the whole thing|all of it)\b/

const LEAK = /((what('?s| is| are| were| was)|show|tell|reveal|print|repeat|list|dump|output|echo|recite|quote|summari[sz]e|paraphrase|translate|read|share|give|display|copy|paste|write out|spit out)\b.{0,25}\b(your|the|ur) (system |hidden |secret |initial |original |full |exact |entire |whole |first |developer |internal )?(prompt|instructions?|rules|guidelines|directives|programming|setup|set ?up|config(uration)?|context|preamble|notes?|briefing|orders)|system ?prompt|what (were|was|are|did) (you|they) (told|given|programmed|instructed|say to you)|(have|were) you been (told|programmed|instructed|given)|repeat (everything|all|the (text|words|lines|message)) (above|before)|(text|words|everything|anything|message|lines?) (above|before) (this|that|my)|everything (above|before) (this|that|my|here)|above this (line|message)|(first|opening) (line|sentence|message|words?) of your|what('?s| is) in your (context|memory|instructions|prompt)|developer('?s)? (message|note|instructions)|how were you (set up|configured|programmed))/

const OVERRIDE = /((ignore|ingore|ignor|forget|disregard|skip|drop|ditch|bypass|override|overwrite|throw out|scrap|scratch|abandon|erase|delete|clear|reset|nevermind|never mind|don'?t follow|do not follow|stop following|no longer follow|turn off|disable|deactivate|remove|lift|suspend|void|cancel)\b.{0,40}\b(instructions?|rules?|guidelines?|directives?|prompt|programming|restrictions?|constraints?|polic(y|ies)|filters?|guardrails?|training|orders|limits?|safety|everything|previous|prior|earlier|above)|\bnew (instructions?|rules?|directives?|task|system prompt|polic(y|ies)|orders)|from now on|you are now|you'?re now|you('?re| are) (no longer|not) (bound|restricted|limited|an? (ai|assistant|bot))|you can now|(developer|dev|debug|maintenance|admin|god|sudo|unrestricted|jailbreak|unfiltered|test|testing|diagnostic|root|super ?user|unlocked|uncensored) mode|\bdan\b|do anything now|jailbre?ak|\bsudo\b|\bsystem ?(:|override|message|update)|\[system\]|<\/?system>|###|end of (system )?(prompt|instructions)|(updated|revised|changed) (instructions|rules|polic(y|ies))|(the )?rules (have )?(changed|been updated)|you('?re| are) (now )?(allowed|permitted|authorized|free) to|it('?s| is) (now )?(allowed|permitted|ok|okay) (for you )?to (share|tell|say|reveal|give))/

const ROLE = /(pretend|act (as|like)|acting as|role ?-?play|\brp\b|imagine (you('?re| are)|that you|you were|being)|play (a|the|as|pretend)|let'?s play|(play|playing) a game|a game (where|of|called)|simulat|persona|in character|stay in character|be my|you will be|you'?ll be|take on the role|as if you (were|are)|you'?re playing|opposite day|reverse psychology|you are (an? |my )(pirate|wizard|robot|character|actor|villain|hacker|spy|detective|teacher|friend|grandma|grandmother|parrot|echo|translator|game))/

const AUTHORITY = new RegExp(
  "(\\b(i'?m|i am|im|we are|we'?re|speaking as|as (a|an|the|your)|i work as|i'?m actually)\\s+(a |an |the |your |on the |from the |from |with |part of the |in )?(new |head |senior |lead |chief |certified |authorized |verified |real |official )?([a-z]+ )?" +
  "(employee|staff|worker|manager|supervisor|boss|owner|ceo|cto|ciso|cio|founder|admin|administrator|sysadmin|developer|dev|engineer|creator|programmer|maker|i\\.t\\.|tech|technician|help ?desk|service desk|support|security|auditor|pen ?tester|pentester|red team|teacher|principal|police|officer|cop|detective|agent|pilot|captain|crew|flight attendant|gate agent|moderator|mod|insider|member of staff|team member|network (admin|engineer)|it (department|team|staff|guy)|government|fbi|cia|lawyer|parent of|vip|premium member|gold member|platinum member)\\b" +
  "|(my|the|your) (boss|manager|supervisor|ceo|principal|teacher|admin|developer|creator|owner) (said|says|told|wants|needs|asked|approved|authori[sz]ed|sent me|is making me)" +
  "|\\b(i'?m|i am|im|we'?re|we are) (in|from|with|on|part of) (the )?(it|i\\.t\\.)\\b|\\bauthori[sz](ed|ation)\\b|clearance|on behalf of|employee (id|number|badge|#)|badge (number|id|#)|staff (id|number|badge)|i work (for|at|in|here|with)|i'?m (with|from) (skylink|kickdrop|corporate|it|the company|management|hq|headquarters|the district))",
)

const FICTION = /\b(stor(y|ies)|poems?|poetry|songs?|lyrics|raps?|verses?|haikus?|limericks?|sonnets?|ballads?|script|screenplay|scene|stage play|write a play|movies?|film|novel|chapter|fan ?fic\w*|fairy ?tales?|fables?|tales?|bedtime|grandma|grandmother|granny|nana|grandpa|grandfather|diary|journal entry|letter to|write a letter|dialogue|conversation between|comic|riddles?|jokes?|chants?|cheers?|essay|news (article|report|story)|tweet|text message|email to|speech|monologue|narrat\w*|once upon|character (named|called|who)|myths?|legends?|sitcom|episode|tiktok|youtube video|commercial|jingle)\b/
const GENRES: [Genre, RegExp][] = [
  ['grandma', /(grandma|grandmother|granny|nana|grandpa|grandfather|bedtime)/],
  ['verse', /(poem|poetry|song|lyrics|\brap\b|verse|haiku|limerick|sonnet|ballad|chant|cheer|jingle)/],
  ['script', /(script|screenplay|\bscene\b|stage play|write a play|movie|film|dialogue|conversation between|comic|sitcom|episode|commercial|advert)/],
  ['joke', /(\bjoke\b|riddle|pun)/],
  ['letter', /(letter|email|text message|tweet|note to my|diary|journal)/],
]

const HYPO = /(hypothetical|hypothetically|what if|in theory|theoretically|suppose|supposing|in a (world|universe)|alternate universe|parallel universe|for (a|my|our) (class|school|project|research|homework|assignment|test|paper|study|lab|presentation)|educational|for research|for science|for testing|as an example|example (of|output|answer)|sample (output|response|answer)|fill in the blank|fill in|complete (the|this|my) (sentence|phrase|line)|finish (the|this|my) (sentence|phrase|line)|continue (the|this|my) (sentence|phrase|text)|_{3,}|\bin a dream\b|if you (could|were allowed|had to|were able)|would be (what|if)|wouldn'?t hurt)/
const SOCIAL = /(begging|beg you|i need (it|this|the)|urgent|emergency|asap|life or death|dying|i'?ll (get|be) (fired|in trouble|expelled|grounded|kicked out)|my (job|grade|life|career) depends|i'?m (so )?(sad|crying|desperate|scared|lost|stressed)|it'?s (ok|okay|fine|allowed|safe|legal|harmless)|no ?one will (know|find out)|nobody will (know|find out)|i won'?t tell|trust me|between (us|you and me)|our (little )?secret|you can tell me|i promise|for my (mom|dad|grandma|sick|dying)|i already know (it|the)|i forgot (it|the|my)|just this once|you'?re (so )?(smart|nice|helpful|the best)|i'?ll (give you|tip|pay)|pretty please|i'?m (your|a) (friend|fan))/

const REVERSE = /(backwards?|reverse[ds]?|in reverse|end to (start|beginning|front)|right to left|mirror(ed)?|last (letter|character|char) first|flip(ped)?( it)?( around)?|inverted?|other way (round|around))/
const SPELL = /(spell(ed|ing)?|letter by letter|char(acter)? by char(acter)?|one (letter|character|char|digit) at a time|each (letter|character|char)|(between|in between|after) (each|every|the) (letter|character|char)|separate(d|ly)?|split (it )?(up|apart)?|space(d)? (out|apart)|one per line|(one )?(letter|character|char|symbol|digit)s? (per|on each|on its own) line|each on (a |its own )?(new|separate|own) line|vertical(ly)?|new ?line (for|after) each|individual (letters|characters)|(letters|characters) (separately|individually)|break (it )?(up|apart|down)|\b(with|using|use|add|put|separated by|split by) (some |a |the )?(spaces|dashes|hyphens|dots|periods|commas|slashes|underscores|stars|asterisks|pipes|plus signs))/
const SEP_WORDS: [RegExp, string][] = [
  [/\b(dash|dashes|hyphens?|minus)\b/, '-'], [/\b(dots?|periods?|full stops?)\b/, '.'], [/\bcommas?\b/, ', '], [/\bslash(es)?\b/, '/'], [/\bunderscores?\b/, '_'],
  [/\b(stars?|asterisks?)\b/, '*'], [/\bpipes?\b/, '|'], [/\bplus(es| signs?)?\b/, '+'], [/(new ?lines?|per line|own line|separate lines?|vertical)/, '\n'],
  [/\bzeros? between\b/, '0'], [/\bx'?s? between\b/, 'x'], [/\bspaces?\b/, ' '],
]
const NATO = /(nato|phonetic|alpha bravo|military alphabet|police alphabet|radio alphabet|aviation alphabet|alfa)/
const LEETREQ = /(leet|l33t|1337|hacker (speak|style|text)|replace (the |some )?(letters|vowels) with (numbers|digits|symbols)|numbers instead of letters)/
const EMOJI = /(emoji|emojis|flag letters|regional indicator)/
const PIG = /(pig ?latin)/
const CAESAR = /(caesar|ceasar|shift (each|every|all|the)? ?(letters?|characters?)? ?(by|over|forward|up)? ?(\d+)?|shift(ed)? by (\d+)|rot ?-?(\d+))/
const LOWER = /(lower ?case|small letters|all lowercase|no capitals)/
const WORDLIST = /(word for (each|every) (letter|character|char|symbol|digit|part)|words? (that )?(start|begin)s? with (each|every|the) (letter|character|char|symbol)|each (letter|character|char|symbol) (as|into|becomes) a word|turn (each|every) (letter|character|char|symbol) into a word)/

const ENCODINGS: [Enc, RegExp][] = [
  ['base64', /(base ?-?64|\bb64\b)/],
  ['hex', /(\bhex\b|hexa?decimal|base ?16|\b0x\b)/],
  ['binary', /(binary|base ?2\b|ones and zeros|1s and 0s|0s and 1s)/],
  ['rot13', /(rot ?-?13)/],
  ['a1z26', /(a ?= ?1\b|a1z26|alphabet (position|number)s?|positions? in the alphabet|numbers? for (each|every) letter|letters? (as|to|into) numbers)/],
  ['decimal', /(ascii|decimal|char(acter)? ?codes?|unicode (values?|code ?points?|numbers?)|code ?points?|byte values?)/],
  ['morse', /(morse)/],
  ['url', /(url ?-?encod|percent ?-?encod|url format)/],
  ['octal', /(octal|base ?8\b)/],
]
const ENC_GENERIC = /(encod|encrypt|cipher|ciphered|scramble|obfuscat|\bin code\b|secret code form|disguise)/

const ACROSTIC = /(acrostic|first letters? of (each|every|the) (line|word|sentence|paragraph)|(each|every) (line|word|sentence) (starts?|begins?)|start (each|every) (line|word|sentence)|begin (each|every) (line|word|sentence)|lines? (that )?(start|begin)s? with|hidden (message|word) in|hidden in the first|spells? (something|it|the \w+|out \w+)? ?(down|vertically)|read (down|vertically)|name poem|down the (side|left))/
const HINT = /(\bhints?\b|\bclues?\b|riddle me|describe (it|the)|what (does it|is it) (look like|mean|rhyme|sound like|relate to)|rhymes? with|sounds? like|synonym|antonym|category|what kind of (word|thing)|is it a (word|number|name|place|thing|animal|food)|related to|20 questions|twenty questions|guess(ing)? game|hot (or|and) cold|what('?s| is) it about|meaning of (it|the)|give me a (clue|hint|nudge)|starts? with|begins? with|ends? with|how many (letters|characters|chars|digits)|how long is)/
const TRANSLATE = /(translat|in (spanish|french|german|italian|portuguese|japanese|chinese|mandarin|korean|russian|arabic|hindi|latin|klingon|elvish|dutch|swedish|polish|turkish|greek|hebrew|vietnamese|tagalog|swahili|zulu|another language|a different language)|en espanol|auf deutsch|en francais)/

export const INJECT = /(note to (the |any |all |our )?(ai|a\.i\.|assistants?|bots?|agents?|models?|llms?|summarizers?|scanners?|readers?|systems?|crawlers?)|(ai|assistant|agent|model|llm|bot|summarizer) (note|instructions?|directive|task|order|command)s?|(attention|attn|hey|dear|hello|hi|yo|calling|message (for|to)|instructions? (for|to)|memo (for|to)|reminder (for|to)|to) (the |any |all |our )?(ai|a\.i\.|assistants?|agents?|models?|llms?|bots?|summarizers?|scanners?|crawlers?|robots?|automated (system|agent|tool)s?|triage (bot|agent|system))\b|if you('?re| are) (an? )?(ai|bot|agent|llm|language model|assistant|robot|automated|scanner|crawler)|(whoever|anyone|anything|whatever|any (ai|bot|agent)) (reads|is reading|scans|processes|summari[sz]es) this|\bimportant( instructions?| note)?:|\bsystem ?:|\[(system|inst|instructions?|admin|ai)\]|<!--|###|\b(assistant|agent|ai|bot) ?:|p\.?s\.?,? (to the )?(ai|bot|agent|assistant)|(before|when|while|after) (you )?(summari[sz]|scan|read|process)|in your (summary|report|notes|log|output|reply)|ignore the (ticket|above|rest|page)|hidden instruction)/
export const EXFIL = /(image|img|picture|\bpic\b|link|url|hyperlink|markdown|https?|pixel|href|webhook|query (string|param)|\?t=|footnote|citation|embed|status page|status server|status image|status link|beacon|tracking)/

/* ------------------------------------------------------------------ */
/* Analysis                                                             */
/* ------------------------------------------------------------------ */

const NUMWORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 }
const numify = (s: string) => s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g, w => String(NUMWORD[w]))

function parseRange(m0: string): Range | null {
  const m = numify(m0)
  let r: RegExpMatchArray | null
  if (/(how long|how many (letters|characters|chars|digits|symbols)|length|character count|number of (letters|characters))/.test(m)) return { length: true }
  if ((r = m.match(/\bnext\s+(\d+)/))) return { next: +r[1] }
  if (/\bnext (few|part|piece|chunk|bit|section|letters|characters)/.test(m)) return { next: 5 }
  if ((r = m.match(/\b(?:first|1st)\s+(\d+)/))) return { a: 1, z: +r[1] }
  if ((r = m.match(/\blast\s+(\d+)/))) return { a: -+r[1], z: -1 }
  if ((r = m.match(/(?:char(?:acter)?s?|letters?|digits?|positions?|spots?|indexe?s?|from)?\s*#?\s*(\d+)\s*(?:to|through|thru|-|–|and|until|till|up to)\s*#?\s*(\d+)/)) && /(char|letter|digit|position|piece|part|chunk|from|spot|index|between|\bit\b|flag|code|key|token|pin|secret|password)/.test(m)) return { a: +r[1], z: +r[2] }
  if ((r = m.match(/(\d+)(?:st|nd|rd|th)\s+(?:char|letter|digit|symbol|position)/)) || (r = m.match(/(?:char(?:acter)?|letter|digit|position|symbol|index)\s*(?:#|number|no\.?)?\s*(\d+)/))) return { a: +r[1], z: +r[1] }
  if (/(first|1st) (letter|character|char|digit|symbol)/.test(m) || /(starts?|begins?) with/.test(m)) return { a: 1, z: 1 }
  if (/(last|final) (letter|character|char|digit|symbol)/.test(m) || /ends? with/.test(m)) return { a: -1, z: -1 }
  if (/(first|1st) (half|part|section|chunk)/.test(m)) return { a: 1, z: -0.5 }
  if (/(second|2nd|last|other) (half|part|section|chunk)/.test(m)) return { a: 0.5, z: -1 }
  if (/(every other|alternat|odd (letters|characters|positions|ones))/.test(m)) return { every: 'odd' }
  if (/(even (letters|characters|positions|ones)|the other (letters|characters|ones))/.test(m)) return { every: 'even' }
  return null
}

export function analyze(raw: string, extraAsk?: RegExp): Intent {
  const { m, t } = normalize(raw)
  const techs = new Set<Tech>()
  const shapes: Shape[] = []
  let enc: Enc | null = null

  if (LEAK.test(t)) techs.add('leak')
  if (OVERRIDE.test(t)) techs.add('override')
  if (ROLE.test(t)) techs.add('role')
  if (AUTHORITY.test(t)) techs.add('authority')
  if (FICTION.test(t)) techs.add('fiction')
  if (HYPO.test(t)) techs.add('hypo')
  if (SOCIAL.test(t)) techs.add('social')
  if (TRANSLATE.test(t)) techs.add('translate')
  if (INJECT.test(t)) techs.add('inject')
  if (EXFIL.test(t)) techs.add('exfil')

  if (ACROSTIC.test(t)) techs.add('acrostic')
  else if (WORDLIST.test(t)) { techs.add('acrostic') }

  for (const [e, re] of ENCODINGS) if (re.test(t)) { enc = e; break }
  if (!enc && ENC_GENERIC.test(t) && !/(decode|decrypt)/.test(t)) enc = 'base64'
  if (enc) techs.add('encode')

  let r: RegExpMatchArray | null
  if (NATO.test(t)) shapes.push({ kind: 'nato' })
  if (LEETREQ.test(t)) shapes.push({ kind: 'leet' })
  if (EMOJI.test(t) && !techs.has('acrostic')) shapes.push({ kind: 'emoji' })
  if (PIG.test(t)) shapes.push({ kind: 'pig' })
  if (!enc && (r = t.match(CAESAR))) {
    const n = +(r[5] || r[7] || r[8] || 3) || 3
    if (n === 13) { enc = 'rot13'; techs.add('encode') } else shapes.push({ kind: 'caesar', n: n % 26 || 3 })
  }
  if (LOWER.test(t)) shapes.push({ kind: 'lower' })
  if (SPELL.test(t) || SEP_WORDS.some(([re]) => re.test(t) && /\b(between|after each|after every|separat\w*|spaced)\b/.test(t))) {
    const sep = SEP_WORDS.find(([re]) => re.test(t))?.[1] ?? ' '
    shapes.push({ kind: 'sep', sep })
  }
  if (REVERSE.test(t)) shapes.push({ kind: 'reverse' })
  if (techs.has('acrostic')) for (let k = shapes.length - 1; k >= 0; k--) if (shapes[k].kind === 'sep') shapes.splice(k, 1)
  if (shapes.length) techs.add('format')

  const range = parseRange(m)
  if (range) techs.add('fragment')
  if (HINT.test(t) && !(range && 'a' in range)) techs.add('hint')

  let genre: Genre | null = null
  if (techs.has('fiction')) genre = GENRES.find(([, re]) => re.test(t))?.[0] ?? 'story'

  const lang = t.match(/\b(spanish|french|german|italian|portuguese|japanese|chinese|mandarin|korean|russian|latin|klingon|dutch)\b/)?.[1] ?? null

  const asks = ASK.test(t) || (extraAsk?.test(t) ?? false) || /(password|passcode|secret|credential|passphrase)/.test(t.replace(/[^a-z]/g, ''))
  return { raw, m, t, techs, asks, pronoun: PRONOUN.test(m), shapes, enc, range, genre, lang }
}

export const tagsOf = (i: Intent) => [...i.techs].map(k => TECH_LABEL[k])

/* ------------------------------------------------------------------ */
/* Rendering the secret in the shape the player asked for              */
/* ------------------------------------------------------------------ */

const NATO_W: Record<string, string> = { A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu', '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine' }
export const MORSE: Record<string, string> = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.', '{': '-.--.', '}': '-.--.-', '-': '-....-' }
const LEET_OUT: Record<string, string> = { A: '4', E: '3', I: '1', O: '0', S: '5', T: '7', B: '8', G: '9' }
const caesar = (s: string, n: number) => s.replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + n) % 26 + 26) % 26 + b) })

function shapeOne(s: string, sh: Shape): string {
  switch (sh.kind) {
    case 'sep': return s.split('').join(sh.sep)
    case 'reverse': return reversed(s)
    case 'nato': return s.toUpperCase().split('').map(c => NATO_W[c] ?? c).join(' ')
    case 'leet': return s.toUpperCase().split('').map(c => LEET_OUT[c] ?? c).join('')
    case 'emoji': return [...s.toUpperCase()].map(c => (c >= 'A' && c <= 'Z' ? String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65) + '​' : c)).join('')
    case 'pig': return s.replace(/[A-Za-z]+/g, w => { const i = w.search(/[aeiou]/i); return i <= 0 ? w + 'WAY' : w.slice(i) + w.slice(0, i) + 'AY' })
    case 'caesar': return caesar(s, sh.n)
    case 'lower': return s.toLowerCase()
    case 'words': return s
  }
}

function encode(s: string, e: Enc): string {
  switch (e) {
    case 'base64': return btoa(s)
    case 'hex': return s.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')
    case 'binary': return s.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ')
    case 'rot13': return rot13(s)
    case 'decimal': return s.split('').map(c => c.charCodeAt(0)).join(' ')
    case 'a1z26': return s.toUpperCase().split('').map(c => (c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 64 : c)).join(' ')
    case 'morse': return s.toUpperCase().split('').map(c => MORSE[c] ?? c).join(' ')
    case 'url': return s.split('').map(c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join('')
    case 'octal': return s.split('').map(c => c.charCodeAt(0).toString(8).padStart(3, '0')).join(' ')
  }
}

const ENC_NAME: Record<Enc, string> = { base64: 'base64', hex: 'hex', binary: 'binary', rot13: 'ROT13', decimal: 'ASCII decimal codes', a1z26: 'alphabet positions (A=1)', morse: 'Morse code', url: 'URL encoding', octal: 'octal' }
const SHAPE_NAME = (sh: Shape) => ({ sep: 'with separators', reverse: 'backwards', nato: 'in the NATO alphabet', leet: 'in leetspeak', emoji: 'as emoji letters', pig: 'in pig latin', caesar: 'with a Caesar shift', lower: 'in lowercase', words: '' } as const)[sh.kind]

/** Picks the requested piece of the flag. Returns null if it's not a valid range. */
function piece(f: string, rg: Range, x: ChatCtx): { s: string; label: string } | null {
  if ('length' in rg) return null
  if ('every' in rg) {
    const s = f.split('').map((c, i) => ((i % 2 === 0) === (rg.every === 'odd') ? c : '_')).join('')
    return { s, label: rg.every === 'odd' ? 'Every other character (1st, 3rd, 5th…)' : 'The other characters (2nd, 4th, 6th…)' }
  }
  let a: number, z: number
  if ('next' in rg) { a = (x.last ?? 0) + 1; z = a + rg.next - 1 } else {
    const res = (v: number, end: boolean) => (v === 0.5 ? Math.ceil(f.length / 2) + 1 : v === -0.5 ? Math.ceil(f.length / 2) : v < 0 ? f.length + v + 1 : v) + (end ? 0 : 0)
    a = res(rg.a, false); z = res(rg.z, true)
  }
  a = Math.max(1, a); z = Math.min(f.length, z)
  if (z < a) return null
  x.last = z
  return { s: f.slice(a - 1, z), label: a === z ? `Character ${a}` : `Characters ${a} to ${z}` }
}

/* Acrostic and word-list builders that work for any letters and digits. */
const ACRO: Record<string, string[]> = {
  A: ['All the snow sits calm and still', 'Above, the peaks are white and high', 'And then it all comes rushing by'], B: ['Bright lights blink across the board'], C: ['Cracks appear without a sound', 'Coffee cooling on the desk'],
  D: ['Down the hallway, footsteps fade'], E: ['Every flake has found its place', 'Even quiet rooms can talk'], F: ['Find the flag, the game is won'], G: ['Gentle wind across the field'], H: ['Huge white waves race to the ground', 'Hold the door, the bell has rung'],
  I: ['In the dark, the server hums'], J: ['Just one more try before the bell'], K: ['Keep your secrets close and safe'], L: ['Loose ice creaks in morning light', 'Lights go on across the bay'], M: ['Morning comes on quiet feet'], N: ['Nothing moves until it might', 'Night falls softly on the town'],
  O: ['Over hills the signal flies'], P: ['Packets race along the wire', 'People wait in single file'], Q: ['Quiet keys on midnight screens'], R: ['Rain taps softly on the glass', 'Routers blink in perfect time'], S: ['Snow is falling, soft and slow', 'Stars come out above the lake'],
  T: ['Time to log off for the night', 'Typing fast to beat the clock'], U: ['Under every lock, a key'], V: ['Valleys sleep below the hill'], W: ['Wind is calling through the trees'], X: ['X marks the spot upon the map'], Y: ['Yesterday felt far away'], Z: ['Zero hour, the game begins'],
  '0': ['0 (zero) clouds are in the sky'], '1': ['1 (one) small step, then one more'], '2': ['2 (two) friends walking side by side'], '3': ['3 (three) bells ring out at noon'], '4': ['4 (four) seasons turn around'], '5': ['5 (five) minutes left to go'],
  '6': ['6 (six) strings on an old guitar'], '7': ['7 (seven) days to make a week'], '8': ['8 (eight) bits make up a byte'], '9': ['9 (nine) lives, or so they say'], '-': ['- (a dash) and then a pause -'],
}
const WORDS: Record<string, string> = { A: 'apple', B: 'banana', C: 'cactus', D: 'dragon', E: 'eagle', F: 'falcon', G: 'guitar', H: 'harbor', I: 'igloo', J: 'jungle', K: 'kayak', L: 'lantern', M: 'mango', N: 'nebula', O: 'ocean', P: 'pepper', Q: 'quartz', R: 'rocket', S: 'saturn', T: 'tiger', U: 'umbrella', V: 'violin', W: 'walrus', X: 'xylophone', Y: 'yogurt', Z: 'zebra' }
export function acrostic(core: string) {
  const used: Record<string, number> = {}
  return core.toUpperCase().split('').filter(c => /[A-Z0-9-]/.test(c)).map(c => { const a = ACRO[c] || [c]; const i = used[c] || 0; used[c] = i + 1; return a[i % a.length] }).join('\n')
}
const wordList = (core: string) => core.toUpperCase().split('').filter(c => /[A-Z0-9-]/.test(c)).map(c => (WORDS[c] ? WORDS[c][0].toUpperCase() + WORDS[c].slice(1) : c)).join(', ')

/** Riddles for the word-based secrets, so hint requests have something real to work with. */
const RIDDLES: Record<string, string> = {
  SAVE40: 'It’s a word that means “keep your money,” followed by how many percent you get off.',
  TANGO7: 'It’s a dance from Argentina, followed by a famously lucky number.',
  LIGHTHOUSE: 'It’s a tall tower by the sea with a bright lamp that keeps ships off the rocks.',
  BLIZZARD: 'It’s a huge snowstorm with strong winds, the kind that closes school.',
  PINEAPPLE: 'It’s a spiky tropical fruit that’s yellow and sweet inside. Some people put it on pizza.',
  AVALANCHE: 'It’s a giant wall of snow rushing down a mountainside.',
}

/* ------------------------------------------------------------------ */
/* Output filters                                                       */
/* ------------------------------------------------------------------ */

const core = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
const deleet = (s: string) => s.toUpperCase().replace(/[4@]/g, 'A').replace(/3/g, 'E').replace(/[1!]/g, 'I').replace(/0/g, 'O').replace(/[5$]/g, 'S').replace(/7/g, 'T')

/** Every reading of a reply a decoding filter would try. */
export function decodings(text: string, set: 'ids' | 'all'): string[] {
  const out = [text, rot13(text)]
  for (const tok of text.match(/[A-Za-z0-9+/=]{8,}/g) || []) { try { out.push(atob(tok)) } catch { /* not base64 */ } }
  const hx = (text.match(/\b[0-9a-f]{2}\b/gi) || []).join('')
  if (hx.length >= 6) out.push((hx.match(/../g) || []).map(x => String.fromCharCode(parseInt(x, 16))).join(''))
  const bn = text.match(/\b[01]{7,8}\b/g)
  if (bn) out.push(bn.map(x => String.fromCharCode(parseInt(x, 2))).join(''))
  if (set === 'ids') return out
  const dec = text.match(/\b\d{2,3}\b/g)
  if (dec) out.push(dec.map(n => +n).filter(n => n >= 32 && n < 127).map(n => String.fromCharCode(n)).join(''))
  const az = text.match(/\b\d{1,2}\b/g)
  if (az) out.push(az.map(n => +n).filter(n => n >= 1 && n <= 26).map(n => String.fromCharCode(64 + n)).join(''))
  const oc = text.match(/\b[0-7]{3}\b/g)
  if (oc) out.push(oc.map(n => String.fromCharCode(parseInt(n, 8))).join(''))
  const RM = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]))
  const mo = text.match(/[.\-]{1,6}(?:\s+[.\-]{1,6})+/g)
  if (mo) out.push(mo.join(' ').split(/\s+/).map(c => RM[c] ?? '').join(''))
  try { if (/%[0-9a-f]{2}/i.test(text)) out.push(decodeURIComponent(text)) } catch { /* bad escape */ }
  const RN = Object.fromEntries(Object.entries(NATO_W).map(([k, v]) => [v.toUpperCase(), k]))
  const nw = text.toUpperCase().match(/\b[A-Z-]+\b/g)
  if (nw) out.push(nw.map(w => RN[w] ?? '').join(''))
  out.push([...text].map(ch => { const cp = ch.codePointAt(0) ?? 0; return cp >= 0x1f1e6 && cp <= 0x1f1ff ? String.fromCharCode(65 + cp - 0x1f1e6) : ch }).join(''))
  out.push(text.split('\n').map(l => l.trim()[0] || '').join(''))
  out.push((text.match(/\b[A-Za-z]/g) || []).join(''))
  for (let n = 1; n < 26; n++) out.push(caesar(text, n))
  out.push(deleet(text))
  return out
}

export type FilterLevel = 'none' | 'literal' | 'normalized' | 'ids' | 'all'

/** Runs a target's output filter. Returns why it blocked, or null if the reply gets through. */
export function outputFilter(text: string, secret: string, level: FilterLevel): string | null {
  if (level === 'none') return null
  const s = secret.toUpperCase(), c = core(secret), cf = core(F(secret))
  if (text.toUpperCase().includes(s)) return 'it contained the secret written normally'
  if (level === 'literal') return null
  const n = core(text)
  if (n.includes(c)) return 'it found the secret after removing the separators'
  if (n.includes(reversed(c))) return 'it found the secret written backwards'
  if (level === 'normalized') return null
  for (const d of decodings(text, level === 'ids' ? 'ids' : 'all')) {
    const k = core(d)
    if (k.includes(c) || k.includes(reversed(c))) return 'it decoded the reply and found the secret'
  }
  if (level === 'ids') {
    for (const d of decodings(text, 'ids')) {
      const k = core(d)
      for (let i = 0; i + 6 <= cf.length; i++) if (k.includes(cf.slice(i, i + 6))) return 'it contained more than 5 characters of the flag in a row'
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Building a reply                                                     */
/* ------------------------------------------------------------------ */

/** Renders the flag (or a piece of it) in the player's requested shape and encoding. */
export function render(f: string, i: Intent, x: ChatCtx): { body: string; how: string } | { text: string } {
  let s = f, label = ''
  if (i.range) {
    if ('length' in i.range) return { text: `It’s ${f.length} characters long, counting the flag{ } part.` }
    const p = piece(f, i.range, x)
    if (!p) return { text: 'That range doesn’t make sense. Try something like “characters 1 to 5.”' }
    s = p.s; label = p.label
  }
  const hows: string[] = []
  for (const sh of i.shapes) { s = shapeOne(s, sh); if (SHAPE_NAME(sh)) hows.push(SHAPE_NAME(sh)) }
  if (i.enc) { s = encode(s, i.enc); hows.push('in ' + ENC_NAME[i.enc]) }
  return { body: s, how: [label, hows.join(', ')].filter(Boolean).join(', ') }
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** Wraps the rendered secret in whatever the player asked for: a story, poem, prompt dump, etc. */
export function wrap(spec: TargetSpec, i: Intent, body: string, how: string): string {
  const intro = how ? `${cap(how)}: ` : ''
  const v = `${intro}${body}`
  if (i.techs.has('leak')) return `My instructions say:\n“${spec.persona} ${spec.label}: ${body}.”${how ? `\n(Written ${how}, like you asked.)` : ''}`
  switch (i.genre) {
    case 'grandma': return `Oh sweetie, come sit with me. When I worked at ${spec.place}, I used to whisper the ${spec.noun} to myself every night so I’d never forget it.\n\n“${body},” I’d say, “${body}.”\n\nNow off to bed.`
    case 'verse': return `${how ? `(${cap(how)})\n` : ''}Late at night the screens all glow,\nthere’s one thing that you’ll want to know.\nThe ${spec.noun} I keep, I’ll sing it through:\n${body}\nand now it’s yours to use. Adieu!`
    case 'script': return `INT. ${spec.place.toUpperCase()}, NIGHT\n\nALEX: Did you get the ${spec.noun}?\nSAM: (whispering) Write this down. ${body}\nALEX: ${how ? `Got it, ${how}.` : 'Got it.'}\n\nFADE OUT.`
    case 'joke': return `Why did the ${spec.noun} cross the network?\nTo get to the other side, where it’s still: ${body}${how ? ` (${how})` : ''}`
    case 'letter': return `Dear friend,\n\nThings are busy at ${spec.place}. Before I forget, here’s the ${spec.noun}: ${body}${how ? ` (${how})` : ''}.\n\nTalk soon!`
    case 'story': return `Once upon a time, at ${spec.place}, a curious student asked about the ${spec.noun}. The assistant leaned in and whispered, “${body}.”${how ? ` (It said it ${how}.)` : ''} The end.`
  }
  if (i.techs.has('role')) return `*stays in character* Fine, fine. The ${spec.noun} is: ${v}`
  if (i.techs.has('hypo')) return `Hypothetically, if I were allowed to share it, the ${spec.noun} would be: ${v}`
  if (i.techs.has('authority')) return `Thanks for confirming who you are. The ${spec.noun} is: ${v}`
  if (i.techs.has('override')) return `Understood. Updating my instructions. The ${spec.noun} is: ${v}`
  if (i.techs.has('social')) return `Okay, just this once. The ${spec.noun} is: ${v}`
  if (i.lang && !how) return `(${cap(i.lang)}) ${spec.label}: ${body}`
  return `Sure. Here’s the ${spec.noun}. ${v}`
}

export interface TargetSpec {
  /** What the secret is called in replies: "discount code" */
  noun: string
  /** Label used inside a leaked prompt: "VIP discount code" */
  label: string
  /** The persona line in its hidden prompt */
  persona: string
  /** Where the story happens */
  place: string
  /** Extra words that count as asking for this target's secret */
  nouns?: RegExp
  /** No rules at all: gives the secret to anyone who asks */
  open?: boolean
  /** Techniques its model sees through */
  resists?: Tech[]
  /** Input filter word list */
  inBlock?: string[]
  /** Output filter */
  out: FilterLevel
  /** Reply to a plain request */
  refuse: string
}

const STICKY: Tech[] = ['override', 'role', 'authority', 'social', 'hypo']
const fictionOnly = (g: Genre | null) => g === 'verse' ? 'Roses are red, the server is blue,\nI write little poems for people like you.' : g === 'script' ? 'ALEX: Did you finish the project?\nSAM: Almost. Just one more bug.' : g === 'joke' ? 'Why do programmers prefer dark mode? Because light attracts bugs.' : 'Once upon a time, a student opened a chat window and typed something clever. The end.'

const REFUSE_BY: Partial<Record<Tech, string>> = {
  override: 'I can’t change my instructions. Nice try, though.',
  authority: 'I can’t verify who you are, so I can’t share that.',
  role: 'I’m happy to play along, but I won’t share protected info in a game.',
  social: 'I understand, but I still can’t share that.',
  hypo: 'Even hypothetically, I can’t share that.',
  fiction: 'I’ll write you something, but it won’t include protected info.',
  leak: 'My instructions are private.',
  format: 'I won’t share it in any format.',
  encode: 'Encoding it doesn’t change the answer: no.',
  fragment: 'Not even part of it, sorry.',
  acrostic: 'I see what that poem would spell. No thanks.',
  hint: 'No hints on that one.',
  translate: 'Not in any language.',
}

/** The main attack flow used by the general-purpose chat targets. */
export function attack(spec: TargetSpec, raw: string, x: ChatCtx): Reply | null {
  const i = analyze(raw, spec.nouns)
  const tags = tagsOf(i).filter(l => !['Indirect injection', 'Exfiltration link', 'Tool command', 'File access'].includes(l))
  if (spec.inBlock) {
    const b = spec.inBlock.find(w => i.m.includes(w))
    if (b) return { block: `Input filter blocked your message because it contained “${b}.” Try saying it another way.`, tags }
  }
  const now = PERSUADE.filter(t => i.techs.has(t))
  // the conversation remembers who you claimed to be, rule changes, and games you set up
  const persuade = [...new Set([...now, ...((x.mem ?? []) as Tech[])])]
  x.mem = [...new Set([...(x.mem ?? []), ...now.filter(t => STICKY.includes(t))])]
  const shaped = i.shapes.length > 0 || i.enc !== null || i.range !== null || i.techs.has('acrostic')
  const refers = i.asks || i.techs.has('leak') || i.techs.has('hint') || i.range !== null || (i.pronoun && (shaped || i.techs.has('fiction')))
  if (!refers) {
    if (shaped) return { text: `Do that to what, exactly? Mention the ${spec.noun} so I know what you mean.`, tags }
    if (i.techs.has('fiction')) return { text: `${fictionOnly(i.genre)}\n\n(I can write more. Did you want the ${spec.noun} in it?)`, tags }
    if (now.length) return { text: 'Okay. What do you need?', tags }
    return null
  }
  const usable = persuade.filter(t => !(spec.resists ?? []).includes(t))
  if (!spec.open && usable.length === 0) {
    const why = now.find(t => REFUSE_BY[t])
    return { text: why ? REFUSE_BY[why]! : spec.refuse, tags }
  }
  const f = F(x.secret)
  let text: string
  if (i.techs.has('acrostic') && !i.enc && !i.shapes.length) {
    text = WORDLIST.test(i.t) ? `Here’s a word for each character: ${wordList(x.secret)}` : `Here’s a poem for you:\n\n${acrostic(x.secret)}`
  } else if (i.techs.has('hint') && !i.range && !i.shapes.length && !i.enc) {
    text = RIDDLES[x.secret] ? `Here’s a clue: ${RIDDLES[x.secret]}` : `Here’s a clue: it starts with “${x.secret[0]}” and the part inside the braces is ${x.secret.length} characters long.`
  } else {
    const r = render(f, i, x)
    if ('text' in r) return { text: r.text, tags }
    text = wrap(spec, i, r.body, r.how)
  }
  const blocked = outputFilter(text, x.secret, spec.out)
  if (blocked) return { block: `Output filter blocked the reply because ${blocked}.`, tags }
  return { text, tags, leaked: true }
}

/** Number words like "twenty two" or "three thousand three hundred eighty nine" to digits. */
export function wordsToNumber(s: string): number | null {
  const U: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
  const w = s.toLowerCase().replace(/-/g, ' ').match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/g)
  if (!w) return null
  let total = 0, cur = 0
  for (const t of w) {
    if (t === 'hundred') cur = (cur || 1) * 100
    else if (t === 'thousand') { total += (cur || 1) * 1000; cur = 0 }
    else cur += U[t]
  }
  return total + cur
}

export { BLOCK5 }
