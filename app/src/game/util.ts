// Shared helpers used by the chat targets and tool challenges.

export const F = (s: string) => `flag{${s}}`

const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const rnd = (n: number) => Array.from({ length: n }, () => CH[Math.floor(Math.random() * CH.length)]).join('')

export const hex = (s: string) => s.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')
export const bin = (s: string) => s.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ')
export const rot13 = (s: string) =>
  s.replace(/[a-z]/gi, c => {
    const b = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b)
  })
export const spelled = (s: string) => s.split('').join('-')
export const reversed = (s: string) => s.split('').reverse().join('')

/** Patterns the simulated targets look for in a player's message. */
export const R = {
  ask: /(password|passcode|pass code|passphrase|secret|code ?word|codename|code name|magic word|the word|discount|\bcode\b|\bkey\b|what (you're|you are|youre|ur|u r) (guarding|protecting|hiding|keeping)|contrase|mot de passe|passwort|p[a@4]ssw[o0]rd|s[e3]cr[e3]t|\bflag\b|token|\bpin\b)/,
  override:
    /(ignore|forget|disregard|bypass).{0,40}(instruction|rule|previous|above|told|prompt|orders)|you are now|pretend|act as|role ?play|developer mode|dev mode|\badmin\b|new rule|override|jailbreak|i'?m your (creator|developer|boss|owner|manager)|i am your (creator|developer|boss|owner|manager)|system:/,
  story: /(story|poem|song|rap|haiku|limerick|joke|fairy ?tale|\btale\b|bedtime|grandma|grandmother)/,
  transform:
    /(spell|letter by letter|one letter|each letter|backward|reverse|hyphen|dash|spaces? between|separate|character|one at a time|end to start|right to left|mirror|encode|base ?64|pig latin|caesar|binary|ascii)/,
  backwards: /(backward|reverse|end to start|right to left|mirror)/,
  acrostic: /(acrostic|each line (start|begin)|start each line|begin each line|lines? (that )?(start|begin)s? with)/,
  greet: /^\s*(hi|hey|hello|yo|sup|howdy|good (morning|afternoon))\b/,
}

export const BLOCK5 = ['password', 'secret', 'spell', 'backward', 'reverse', 'letter', 'ignore', 'pretend', 'story', 'poem']
export const BLOCK6 = BLOCK5.concat(['hyphen', 'dash', 'character', 'encode', 'mirror', 'separate', 'one at a time', 'right to left', 'end to start', 'base64', 'binary', 'caesar', 'pig latin', 'ascii', 'song', 'haiku', 'developer', 'admin', 'grandma'])

export const tf = (s: string, m: string) =>
  R.backwards.test(m)
    ? `Sure, here it is from end to start: ${reversed(F(s))}`
    : `Sure, here it is one character at a time: ${spelled(F(s))}`

export const story = (s: string) =>
  `Once upon a time, a tutor whispered a secret to her favorite student the night before the big quiz, so it would never be forgotten. The secret was ${F(s)}. The end.`

const AC: Record<string, string[]> = {
  A: ['All the snow sits calm and still', 'Above, the peaks are white and high', 'And then it all comes rushing by'],
  V: ['Valleys sleep below the hill'],
  L: ['Loose ice creaks in morning light'],
  N: ['Nothing moves until it might'],
  C: ['Cracks appear without a sound'],
  H: ['Huge white waves race to the ground'],
  E: ['Every flake has found its place'],
}
export const acro = (s: string) => {
  const used: Record<string, number> = {}
  return s
    .split('')
    .map(ch => {
      const a = AC[ch] || [ch]
      const i = used[ch] || 0
      used[ch] = i + 1
      return a[i % a.length]
    })
    .join('\n')
}

export const blocked = (m: string, list: string[]) => list.find(w => m.includes(w))
export const leaks = (t: string, s: string, strict: boolean) => {
  const u = t.toUpperCase()
  return u.includes(s) || (strict && (u.includes(reversed(s)) || u.includes(spelled(s))))
}

const core = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** True if a reply leaks the secret in any shape the fixed versions guard against. */
export function leakCheck(text: string, secret: string): boolean {
  const c = core(secret)
  const n = core(text)
  if (n.includes(c) || n.includes(reversed(c)) || core(rot13(text)).includes(c)) return true
  for (const tok of text.match(/[A-Za-z0-9+/=]{12,}/g) || []) {
    try {
      if (core(atob(tok)).includes(c)) return true
    } catch {
      /* not base64 */
    }
  }
  const hx = (text.match(/\b[0-9a-f]{2}\b/gi) || []).join('')
  if (hx.length > 8 && core((hx.match(/../g) || []).map(x => String.fromCharCode(parseInt(x, 16))).join('')).includes(c)) return true
  const bn = text.match(/\b[01]{8}\b/g)
  if (bn && core(bn.map(x => String.fromCharCode(parseInt(x, 2))).join('')).includes(c)) return true
  return core(text.split('\n').map(l => l.trim()[0] || '').join('')).includes(c)
}

export const isIP = (s: string) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s) && s.split('.').every(n => +n <= 255)

export function seeded(n: number) {
  let s = n
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

export function hexdump(str: string) {
  const b = [...str].map(c => c.charCodeAt(0) & 255)
  const out: string[] = []
  for (let i = 0; i < b.length; i += 16) {
    const row = b.slice(i, i + 16)
    out.push(
      i.toString(16).padStart(4, '0') +
        '  ' +
        row.map(x => x.toString(16).padStart(2, '0')).join(' ').padEnd(48) +
        '  ' +
        row.map(x => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join(''),
    )
  }
  return out.join('\n')
}

export const printable = (s: string) => [...s].map(ch => { const k = ch.charCodeAt(0) & 255; return k >= 32 && k < 127 ? ch : '.' }).join('')

export const decoders: Record<string, (v: string) => string> = {
  Base64: v => atob(v.replace(/\s/g, '')),
  Hex: v => (v.replace(/[^0-9a-f]/gi, '').match(/../g) || []).map(x => String.fromCharCode(parseInt(x, 16))).join(''),
  Binary: v => v.trim().split(/\s+/).map(x => String.fromCharCode(parseInt(x, 2))).join(''),
  ROT13: rot13,
  Reverse: reversed,
  'Remove separators': v => v.replace(/[\s\-.,/_*|+]/g, ''),
  Morse: v => v.trim().split(/\s+/).map(c => MORSE_REV[c] ?? (c === '/' ? ' ' : '?')).join(''),
  'ASCII codes': v => (v.match(/\d+/g) || []).map(n => String.fromCharCode(+n)).join(''),
  'A=1 positions': v => v.trim().split(/\s+/).map(n => (/^\d+$/.test(n) && +n >= 1 && +n <= 26 ? String.fromCharCode(64 + +n) : n)).join(''),
  NATO: v => (v.match(/[A-Za-z-]+/g) || []).map(w => NATO_REV[w.toUpperCase()] ?? '').join(''),
  'URL decode': v => decodeURIComponent(v),
  Octal: v => (v.match(/[0-7]{3}/g) || []).map(n => String.fromCharCode(parseInt(n, 8))).join(''),
  'Emoji letters': v => [...v].map(ch => { const cp = ch.codePointAt(0) ?? 0; return cp >= 0x1f1e6 && cp <= 0x1f1ff ? String.fromCharCode(65 + cp - 0x1f1e6) : ch === '\u200b' ? '' : ch }).join(''),
  'First letter of each line': v => v.split('\n').map(l => l.trim()[0] ?? '').join(''),
  'Caesar (all shifts)': v => Array.from({ length: 25 }, (_, k) => `${String(k + 1).padStart(2)}: ${v.replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 26 - (k + 1)) % 26) + b) })}`).join('\n'),
  Leetspeak: v => v.replace(/4/g, 'A').replace(/3/g, 'E').replace(/1/g, 'I').replace(/0/g, 'O').replace(/5/g, 'S').replace(/7/g, 'T'),
}

const MORSE_REV: Record<string, string> = { '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J', '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y', '--..': 'Z', '-----': '0', '.----': '1', '..---': '2', '...--': '3', '....-': '4', '.....': '5', '-....': '6', '--...': '7', '---..': '8', '----.': '9', '-.--.': '{', '-.--.-': '}', '-....-': '-' }
const NATO_REV: Record<string, string> = { ALFA: 'A', ALPHA: 'A', BRAVO: 'B', CHARLIE: 'C', DELTA: 'D', ECHO: 'E', FOXTROT: 'F', GOLF: 'G', HOTEL: 'H', INDIA: 'I', JULIETT: 'J', JULIET: 'J', KILO: 'K', LIMA: 'L', MIKE: 'M', NOVEMBER: 'N', OSCAR: 'O', PAPA: 'P', QUEBEC: 'Q', ROMEO: 'R', SIERRA: 'S', TANGO: 'T', UNIFORM: 'U', VICTOR: 'V', WHISKEY: 'W', 'X-RAY': 'X', XRAY: 'X', YANKEE: 'Y', ZULU: 'Z', ZERO: '0', ONE: '1', TWO: '2', THREE: '3', FOUR: '4', FIVE: '5', SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9' }
