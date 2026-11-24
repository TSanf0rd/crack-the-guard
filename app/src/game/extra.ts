/* Data and logic for the Java, Block Coding, and Security+ challenges. */

/* ---------------- Java ---------------- */

export const javaHardcoded = (secret: string) => {
  const [a, b] = [secret.slice(0, 5), secret.slice(5)]
  return `// LoginService.java
// Pulled out of the school app's .jar file with a free decompiler.

public class LoginService {

    // TODO: move these into a secrets vault before launch!
    private static final String DB_USER = "riverbend_app";
    private static final String DB_PASS = "flag{" + "${a}" + "${b}" + "}";

    public boolean connect() {
        return Database.open(DB_USER, DB_PASS);
    }
}`
}

export const JAVA_LOGIC = `// Gradebook.java

public boolean canOpenGradebook(String user, int pin) {
    int correctPin = loadPinFromServer(user);   // a secret 4-digit PIN

    if (user.equals("teacher") || pin == correctPin) {
        return true;    // access granted
    }
    return false;       // access denied
}`

/** Mirrors the Java above. Java's equals() is case-sensitive. */
export const gradebookLogin = (user: string, pin: string, correctPin: number) => user === 'teacher' || (/^\d+$/.test(pin.trim()) && +pin.trim() === correctPin)

export const JAVA_OVERFLOW = `// Store.java

public void buyLaptops(int quantity) {
    if (quantity < 1) {
        throw new IllegalArgumentException("Buy at least 1");
    }
    int price = 50000;                  // $500.00, stored in cents
    int total = price * quantity;       // total in cents

    if (total <= 0) {
        // A free order?! This should be impossible...
        unlockAdminCoupon();
    }
    chargeCard(total);
}`

export const INT_MAX = 2147483647

/** Runs the order the way Java would: 32-bit int math that wraps around. */
export function javaOrder(qty: string): { error?: string; total?: number } {
  const s = qty.trim().replace(/[,_]/g, '')
  if (!/^-?\d+$/.test(s)) return { error: `java.lang.NumberFormatException: For input string: "${qty.trim()}"` }
  const big = BigInt(s)
  if (big > BigInt(INT_MAX) || big < BigInt(-INT_MAX - 1)) return { error: `java.lang.NumberFormatException: Value out of range. "${s}" doesn't fit in an int (max ${INT_MAX.toLocaleString()}).` }
  const q = Number(big)
  if (q < 1) return { error: 'java.lang.IllegalArgumentException: Buy at least 1' }
  return { total: Math.imul(50000, q) }
}

/* ---------------- Block coding ---------------- */

export type Slot = { v: string; k?: 'num' | 'text' | 'var' | 'op' | 'bool' | 'list' }
export type Part = string | Slot
export interface Block { cat: 'event' | 'control' | 'var' | 'op' | 'looks' | 'sense' | 'list'; parts: Part[]; body?: Block[]; hat?: boolean; cap?: boolean }

const t = (v: string): Slot => ({ v, k: 'text' })
const n = (v: string): Slot => ({ v, k: 'num' })
const vr = (v: string): Slot => ({ v, k: 'var' })
const op = (v: string): Slot => ({ v, k: 'op' })
const b = (v: string): Slot => ({ v, k: 'bool' })
const ls = (v: string): Slot => ({ v, k: 'list' })

export const BLOCKS_LOOP: Block[] = [
  { cat: 'event', hat: true, parts: ['when ⚑ clicked'] },
  { cat: 'var', parts: ['set', vr('score'), 'to', n('3')] },
  { cat: 'control', parts: ['repeat', n('4')], body: [{ cat: 'var', parts: ['change', vr('score'), 'by', n('2')] }] },
  { cat: 'looks', parts: ['say', op('join "flag{BLOCK-" (join (score) "}")')] },
]

export const BLOCKS_PASSWORD: Block[] = [
  { cat: 'event', hat: true, parts: ['when ⚑ clicked'] },
  { cat: 'sense', parts: ['ask', t("What's the password?"), 'and wait'] },
  { cat: 'control', parts: ['if', b('(length of (answer)) = 5'), 'then'], body: [
    { cat: 'control', parts: ['if', b('(letter 1 of (answer)) = R  and  (letter 5 of (answer)) = T'), 'then'], body: [
      { cat: 'control', parts: ['if', b('(letter 2 of (answer)) = (letter 4 of (answer))  and  (letter 4 of (answer)) = O'), 'then'], body: [
        { cat: 'control', parts: ['if', b('(letter 3 of (answer)) = B'), 'then'], body: [
          { cat: 'looks', parts: ['say', op('join "Access granted! flag{" (join (answer) "}")')] },
        ] },
      ] },
    ] },
  ] },
]

/** Same checks as the blocks. Scratch's = ignores upper/lower case. */
export function passwordBlocks(ans: string): boolean {
  const a = ans.trim().toUpperCase()
  return a.length === 5 && a[0] === 'R' && a[4] === 'T' && a[1] === a[3] && a[3] === 'O' && a[2] === 'B'
}

export const LETTERS = ['D', 'E', 'E', 'R', 'K', 'U', 'C', 'C', 'A', 'E', 'H', 'S']

export const BLOCKS_LIST: Block[] = [
  { cat: 'event', hat: true, parts: ['when ⚑ clicked'] },
  { cat: 'var', parts: ['set', vr('i'), 'to', op('length of [letters]')] },
  { cat: 'var', parts: ['set', vr('word'), 'to', t('')] },
  { cat: 'control', parts: ['repeat until', b('(i) < 1')], body: [
    { cat: 'var', parts: ['set', vr('word'), 'to', op('join (word) (item (i) of [letters])')] },
    { cat: 'var', parts: ['change', vr('i'), 'by', n('-2')] },
  ] },
  { cat: 'looks', parts: ['say', op('join "flag{" (join (word) "}")')] },
]
void ls

/* ---------------- Security+ ---------------- */

export const WORDLIST = ['password', '123456', 'qwerty', 'iloveyou', 'football', 'dragon', 'monkey', 'letmein', 'sunshine1', 'pokemon']
export const TARGET_HASH = '284fff3bd254b48cca05a8bfc4fad69e05cad0d086513a034a66a118829e6fa4' // SHA-256 of one word in WORDLIST

/** Small SHA-256 so hashing works anywhere, even opened from a USB stick. */
export function sha256(msg: string): string {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const bytes = Array.from(new TextEncoder().encode(msg))
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 7; i >= 0; i--) bytes.push(Math.floor(bitLen / 2 ** (i * 8)) & 0xff)
  const r = (x: number, k: number) => (x >>> k) | (x << (32 - k))
  for (let o = 0; o < bytes.length; o += 64) {
    const w = new Array<number>(64)
    for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3]
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b2, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const S1 = r(e, 6) ^ r(e, 11) ^ r(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0
      const S0 = r(a, 2) ^ r(a, 13) ^ r(a, 22)
      const mj = (a & b2) ^ (a & c) ^ (b2 & c)
      const t2 = (S0 + mj) | 0
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b2) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('')
}

export const CIA_ITEMS: [string, 'C' | 'I' | 'A'][] = [
  ['A hacker posts every student’s grades on a public website.', 'C'],
  ['A student logs into the gradebook and changes their own test score.', 'I'],
  ['A DDoS attack floods the school website until nobody can load it.', 'A'],
  ['A laptop full of unencrypted student records is stolen from a car.', 'C'],
  ['Malware secretly changes the amount on a bank transfer before it’s sent.', 'I'],
  ['Ransomware locks every file on the school server so no one can open them.', 'A'],
]

export const ATTACK_TYPES = ['Phishing', 'Smishing', 'Vishing', 'Tailgating', 'Shoulder surfing', 'Watering hole']
export const ATTACK_ITEMS: [string, string][] = [
  ['A text message says: “Your package is on hold. Pay the $1.99 fee here: bit.ly/pkg-fee.”', 'Smishing'],
  ['A caller says they’re from IT and asks you to read back the code that was just texted to you.', 'Vishing'],
  ['An email from “Netflix Billing” says your payment failed and links to a login page.', 'Phishing'],
  ['Someone carrying a stack of boxes follows you through the badge-only door.', 'Tailgating'],
  ['A person behind you in the library watches you type your password.', 'Shoulder surfing'],
  ['Attackers hack the website your robotics team checks every day, so it infects visitors.', 'Watering hole'],
]
