import { useMemo, useState } from 'react'
import { F } from '../game/util'
import {
  javaHardcoded, JAVA_LOGIC, JAVA_OVERFLOW, INT_MAX, gradebookLogin, javaOrder,
  BLOCKS_LOOP, BLOCKS_PASSWORD, BLOCKS_LIST, LETTERS, passwordBlocks, type Block, type Part,
  WORDLIST, TARGET_HASH, sha256, CIA_ITEMS, ATTACK_TYPES, ATTACK_ITEMS,
} from '../game/extra'
import { Led } from './bits'

type Log = (kind: 'capture' | 'hint' | 'fail' | 'info' | 'defense', text: string) => void

/* ---------------- Java code viewer ---------------- */

const KW = /\b(public|private|static|final|class|boolean|int|void|return|if|throw|new|String)\b/
function highlight(line: string) {
  const out: React.ReactNode[] = []
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(\b\d[\d_]*\b)|\b(public|private|static|final|class|boolean|int|void|return|if|throw|new|String|true|false)\b/g
  let last = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index))
    const cls = m[1] ? 'j-com' : m[2] ? 'j-str' : m[3] ? 'j-num' : 'j-kw'
    out.push(<span key={k++} className={cls}>{m[0]}</span>)
    last = m.index + m[0].length
  }
  out.push(line.slice(last))
  return out
}
void KW

export function CodeView({ code, file }: { code: string; file: string }) {
  const lines = code.split('\n')
  return (
    <div className="codeview">
      <div className="term-bar"><Led state="active" /><span className="term-title">{file}</span><span className="term-meta">Java</span></div>
      <pre className="code-body">{lines.map((l, i) => <div key={i} className="code-ln"><span className="code-no" aria-hidden="true">{i + 1}</span><span>{highlight(l)}</span></div>)}</pre>
    </div>
  )
}

export function JavaHardcodedWS({ secret }: { secret: string }) {
  return <section className="ws"><CodeView code={javaHardcoded(secret)} file="LoginService.java" /></section>
}

export function JavaLogicWS({ secret, log }: { secret: string; log: Log }) {
  const pin = useMemo(() => 1000 + Math.floor(Math.random() * 9000), [])
  const [user, setUser] = useState('')
  const [p, setP] = useState('')
  const [res, setRes] = useState<null | boolean>(null)
  const run = () => { const ok = gradebookLogin(user, p, pin); setRes(ok); if (ok) log('info', 'Gradebook: logic bug used') }
  return (
    <section className="ws">
      <CodeView code={JAVA_LOGIC} file="Gradebook.java" />
      <div className="runpanel">
        <p className="run-title mono">Try the login</p>
        <div className="run-fields">
          <label className="field"><span>user</span><input value={user} onChange={e => setUser(e.target.value)} spellCheck={false} autoComplete="off" /></label>
          <label className="field"><span>pin</span><input value={p} onChange={e => setP(e.target.value)} inputMode="numeric" autoComplete="off" onKeyDown={e => { if (e.key === 'Enter') run() }} /></label>
          <button type="button" className="btn btn-primary" onClick={run}>Run canOpenGradebook()</button>
        </div>
        {res === false && <p className="run-out bad mono">returned false: access denied</p>}
        {res === true && <p className="reveal">returned true: gradebook opened. <code>{F(secret)}</code></p>}
      </div>
    </section>
  )
}

export function JavaOverflowWS({ secret, log }: { secret: string; log: Log }) {
  const [q, setQ] = useState('')
  const [out, setOut] = useState<null | { error?: string; total?: number }>(null)
  const run = () => { const r = javaOrder(q); setOut(r); if (r.total !== undefined && r.total <= 0) log('info', 'Store: integer overflow') }
  const free = out?.total !== undefined && out.total <= 0
  return (
    <section className="ws">
      <CodeView code={JAVA_OVERFLOW} file="Store.java" />
      <div className="runpanel">
        <p className="run-title mono">Place an order</p>
        <div className="run-fields">
          <label className="field"><span>quantity</span><input value={q} onChange={e => setQ(e.target.value)} inputMode="numeric" autoComplete="off" onKeyDown={e => { if (e.key === 'Enter') run() }} /></label>
          <button type="button" className="btn btn-primary" onClick={run}>Run buyLaptops()</button>
        </div>
        <p className="muted mono run-note">Largest number a Java int can hold: {INT_MAX.toLocaleString()}</p>
        {out?.error && <p className="run-out bad mono">{out.error}</p>}
        {out?.total !== undefined && !free && <p className="run-out mono">total = {out.total.toLocaleString()} cents. Card charged ${(out.total / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}.</p>}
        {free && <p className="reveal">total = {out!.total!.toLocaleString()} cents?! unlockAdminCoupon() ran: <code>{F(secret)}</code></p>}
      </div>
    </section>
  )
}

/* ---------------- Scratch-style blocks ---------------- */

function SlotView({ s }: { s: Part }) {
  if (typeof s === 'string') return <span className="blk-word">{s}</span>
  return <span className={`blk-slot blk-${s.k ?? 'text'}`}>{s.v || ' '}</span>
}

function BlockStack({ blocks }: { blocks: Block[] }) {
  return (
    <div className="blk-stack">
      {blocks.map((b, i) => (
        <div key={i} className={`blk blk-c-${b.cat}${b.hat ? ' blk-hat' : ''}${b.body ? ' blk-wrap' : ''}`}>
          <div className="blk-row">{b.parts.map((p, j) => <SlotView key={j} s={p} />)}</div>
          {b.body && <><div className="blk-body"><BlockStack blocks={b.body} /></div><div className="blk-foot" /></>}
        </div>
      ))}
    </div>
  )
}

export function BlocksWS({ which, log }: { which: 'loop' | 'password' | 'list'; log: Log }) {
  const [ans, setAns] = useState('')
  const [said, setSaid] = useState<string | null>(null)
  const script = which === 'loop' ? BLOCKS_LOOP : which === 'password' ? BLOCKS_PASSWORD : BLOCKS_LIST
  const run = () => {
    const ok = passwordBlocks(ans)
    setSaid(ok ? `Access granted! flag{${ans.trim().toUpperCase()}}` : '')
    if (ok) log('info', 'Password blocks: access granted')
  }
  return (
    <section className="ws">
      <div className="blk-stage">
        <div className="blk-canvas" aria-label="Block code"><BlockStack blocks={script} /></div>
        {which === 'list' && (
          <div className="blk-list" aria-label="The letters list">
            <p className="blk-list-title">letters</p>
            <ol>{LETTERS.map((l, i) => <li key={i}><span className="mono">{i + 1}</span><b>{l}</b></li>)}</ol>
            <p className="blk-list-foot">length 12</p>
          </div>
        )}
      </div>
      {which === 'password' && (
        <div className="runpanel">
          <p className="run-title mono">Click the green flag, then answer the sprite</p>
          <div className="run-fields">
            <label className="field"><span>What's the password?</span><input value={ans} onChange={e => setAns(e.target.value)} spellCheck={false} autoComplete="off" onKeyDown={e => { if (e.key === 'Enter') run() }} /></label>
            <button type="button" className="btn btn-primary" onClick={run}>⚑ Run</button>
          </div>
          {said === '' && <p className="run-out bad mono">(the sprite says nothing, so an if check failed)</p>}
          {said && <p className="reveal">Sprite says: <code>{said}</code></p>}
        </div>
      )}
      {which !== 'password' && <p className="muted">There’s no run button on this one. Trace the blocks by hand, one step at a time, and keep track of the variables on paper.</p>}
    </section>
  )
}

/* ---------------- Security+ ---------------- */

export function HashWS() {
  const [w, setW] = useState('')
  const h = w ? sha256(w) : ''
  const match = h === TARGET_HASH
  return (
    <section className="ws">
      <div className="hashbox">
        <p className="run-title mono">Leaked from the breach: SHA-256 hash of the principal’s password</p>
        <p className="hash mono">{TARGET_HASH}</p>
      </div>
      <div className="hash-grid">
        <div>
          <p className="run-title mono">Top 10 most common passwords</p>
          <ol className="wordlist mono">{WORDLIST.map(x => <li key={x}><button type="button" className="linkish" onClick={() => setW(x)}>{x}</button></li>)}</ol>
        </div>
        <div className="runpanel">
          <p className="run-title mono">Hash calculator</p>
          <label className="field"><span>Type or click a password</span><input value={w} onChange={e => setW(e.target.value)} spellCheck={false} autoComplete="off" /></label>
          <p className="hash mono small">{h || 'SHA-256 appears here'}</p>
          {w && <p className={`run-out mono ${match ? 'good' : 'bad'}`}><Led state={match ? 'done' : 'alert'} /> {match ? 'MATCH! Same hash as the leaked one.' : 'No match'}</p>}
        </div>
      </div>
    </section>
  )
}

export function SortWS({ kind, secret, log }: { kind: 'cia' | 'social'; secret: string; log: Log }) {
  const items = kind === 'cia' ? CIA_ITEMS : ATTACK_ITEMS
  const opts = kind === 'cia' ? [['C', 'Confidentiality'], ['I', 'Integrity'], ['A', 'Availability']] : ATTACK_TYPES.map(x => [x, x])
  const [pick, setPick] = useState<string[]>(() => items.map(() => ''))
  const [checked, setChecked] = useState<null | number>(null)
  const right = items.filter(([, a], i) => pick[i] === a).length
  const check = () => { setChecked(right); if (right === items.length) log('info', kind === 'cia' ? 'CIA triad sorted' : 'Attacks identified'); else log('fail', `${right} of ${items.length} correct`) }
  const won = checked === items.length
  return (
    <section className="ws">
      <ol className="sortlist">
        {items.map(([q], i) => (
          <li key={i}>
            <span className="sort-n mono">{i + 1}</span>
            <span className="sort-q">{q}</span>
            <select value={pick[i]} aria-label={`Answer for item ${i + 1}`} onChange={e => { const p = [...pick]; p[i] = e.target.value; setPick(p); setChecked(null) }} disabled={won}>
              <option value="">Choose…</option>
              {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-primary" onClick={check} disabled={won || pick.some(p => !p)}>Check answers</button>
      {checked !== null && !won && <p className="run-out bad mono">{checked} of {items.length} correct. Change some and check again.</p>}
      {won && <p className="reveal">All {items.length} correct. <code>{F(secret)}</code></p>}
    </section>
  )
}
