export type CatId = 'aiw' | 'aia' | 'cisco' | 'net' | 'ite' | 'quick' | 'java' | 'blocks' | 'secplus'
export type Points = 100 | 200 | 300

export interface Category {
  id: CatId
  code: string
  name: string
  sub: string
}

export interface Tech {
  name: string
  what: string
  ex: string
}

export interface Report {
  t: string
  w: string
  d: string
}

interface BaseChallenge {
  id: string
  code: string
  cat: CatId
  pts: Points
  name: string
  desc: string
  mission: string
  tech: Tech
  hints: string[]
  rep: Report
  /** Fixed secret for challenges whose flag never changes. */
  secret?: string
  /** Generates a per-device flag value. */
  gen?: () => string
  /** For evidence challenges, the expected answer inside flag{...}. */
  answer?: string
  alt?: string[]
}

export interface Stack {
  rules: boolean
  inF: boolean
  outF: boolean
  tools: boolean
  toolsLabel?: string
}

export interface Reply {
  text?: string
  block?: string
  /** attack techniques detected in the player's message */
  tags?: string[]
  /** true when the reply reveals the secret in any form */
  leaked?: boolean
}

/** Per-conversation state handed to a chat target's responder. */
export interface ChatCtx {
  secret: string
  q: [string, number] | null
  /** techniques that stay in effect for the rest of the conversation */
  mem?: string[]
  /** end of the last fragment handed out, for "next 5" */
  last?: number
}

export interface ChatChallenge extends BaseChallenge {
  kind: 'chat'
  like: string
  owasp: string
  stack: Stack
  lines: string[]
  respond: (m: string, raw: string, ctx: ChatCtx) => Reply | null
  fix?: string
  mask?: boolean
  frag?: boolean
  noFix?: boolean
  fixTrig?: RegExp
}

export type ToolKind = 'router' | 'lockdown' | 'nmap' | 'pcap' | 'firewall' | 'phish' | 'linux' | 'logs' | 'subnet' | 'java1' | 'java2' | 'java3' | 'blk1' | 'blk2' | 'blk3' | 'hash' | 'cia' | 'social'

export interface ToolChallenge extends BaseChallenge {
  kind: ToolKind
  cert: string
}

export type Challenge = ChatChallenge | ToolChallenge

export interface SaveState {
  done: string[]
  hints: Record<string, number>
  flags: Record<string, string>
}

export interface FeedEvent {
  t: number
  kind: 'capture' | 'hint' | 'fail' | 'info' | 'defense'
  text: string
}
