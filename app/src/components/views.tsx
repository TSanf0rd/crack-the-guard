import { useEffect, useRef, useState } from 'react'
import type { Challenge, FeedEvent } from '../game/types'
import { ALL, CATS, HINT_COST, catOf } from '../game/catalog'
import type { Game } from '../game/useGame'
import { F, decoders } from '../game/util'
import { Clock, Led, stamp, useCountUp } from './bits'
import { ChatConsole, ToolWorkspace } from './workspaces'
import { Explainer } from './Explainer'
import { EXPLAIN } from '../game/explain'
import eagle from '../assets/eagle.svg'
import acm from '../assets/acm.png'

/* ---------------- Status bar ---------------- */

export function StatusBar({ g, onBoard, onDecoder, onGuide }: { g: Game; onBoard: () => void; onDecoder: () => void; onGuide: () => void }) {
  const shown = useCountUp(g.score)
  const pct = (g.save.done.length / ALL.length) * 100
  return (
    <header className="statusbar">
      <button type="button" className="brand" onClick={onBoard}>
        <img src={eagle} alt="" width={34} height={33} />
        <span><b>Crack the Guard</b><small>Riverbend SD · security operations</small></span>
      </button>
      <div className="readouts">
        <div className="readout"><span>Local</span><Clock /></div>
        <div className="readout"><span>Flags</span><b className="mono">{String(g.save.done.length).padStart(2, '0')}/{ALL.length}</b></div>
        <div className="readout"><span>Score</span><b className="mono score">{String(shown).padStart(4, '0')}</b></div>
      </div>
      <nav className="actions" aria-label="Console">
        <button type="button" className="btn btn-bar" onClick={onBoard}>Board</button>
        <button type="button" className="btn btn-bar" onClick={onDecoder}>Decoder</button>
        <button type="button" className="btn btn-bar" onClick={onGuide}>Field guide</button>
        <ThemeToggle />
      </nav>
      <div className="progress" style={{ ['--p' as string]: pct + '%' }} aria-hidden="true" />
    </header>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'))
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f5f2' : '#090e0b')
    try { localStorage.setItem('ctg-theme', theme) } catch { /* ignore */ }
  }, [theme])
  const light = theme === 'light'
  return (
    <button type="button" className="btn btn-bar theme-toggle" role="switch" aria-checked={light} aria-label="Light mode" onClick={() => setTheme(light ? 'dark' : 'light')}>
      <span className="tt-track" aria-hidden="true"><span className="tt-knob" /></span>
      <span>{light ? 'Light' : 'Dark'}</span>
    </button>
  )
}

/* ---------------- Board ---------------- */

export function Board({ g, open }: { g: Game; open: (id: string) => void }) {
  const totalPts = ALL.reduce((a, c) => a + c.pts, 0)
  return (
    <main className="board" id="main">
      <div className="board-head">
        <div>
          <p className="kicker mono">Incident board</p>
          <h1>Pick a target. Capture the flag.</h1>
        </div>
        <dl className="board-stats">
          <div><dt>Open</dt><dd className="mono">{ALL.length - g.save.done.length}</dd></div>
          <div><dt>Captured</dt><dd className="mono">{g.save.done.length}</dd></div>
          <div><dt>Points available</dt><dd className="mono">{totalPts}</dd></div>
        </dl>
      </div>
      <p className="board-note">Every flag looks like <code>flag{'{...}'}</code>. Harder targets are worth more, and hints cost points. Start anywhere.</p>
      <div className="matrix">
        {CATS.map(k => {
          const items = ALL.filter(c => c.cat === k.id).sort((x, y) => x.pts - y.pts)
          const done = items.filter(c => g.isDone(c.id)).length
          return (
            <section className="mrow" key={k.id} aria-labelledby={`cat-${k.id}`}>
              <div className="mcat">
                <h2 id={`cat-${k.id}`}>{k.name}</h2>
                <span className="muted">{k.sub}</span>
                <span className="mono small muted">{done}/{items.length} captured</span>
                <span className="meter" aria-hidden="true"><i style={{ width: `${(done / items.length) * 100}%` }} /></span>
              </div>
              <ul className="mitems">
                {items.map(c => {
                  const d = g.isDone(c.id)
                  return (
                    <li key={c.id}>
                      <button type="button" className={`node${d ? ' is-done' : ''}`} onClick={() => open(c.id)}>
                        <Led state={d ? 'done' : 'open'} />
                        <span className="node-code mono">{c.code}</span>
                        <span className="node-name">{c.name}</span>
                        <span className="node-pts mono">{c.pts}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
      <div className="legend muted"><span><Led state="open" /> open</span><span><Led state="done" /> captured</span><span><Led state="active" /> you are here</span></div>
    </main>
  )
}

/* ---------------- Challenge view ---------------- */

function Rail({ g, cur, open }: { g: Game; cur: string; open: (id: string) => void }) {
  return (
    <nav className="rail" aria-label="All challenges">
      {CATS.map(k => (
        <div key={k.id} className="rail-group">
          <p className="rail-cat mono">{k.name}</p>
          {ALL.filter(c => c.cat === k.id).map(c => (
            <button key={c.id} type="button" className={`rail-item${c.id === cur ? ' is-cur' : ''}`} aria-current={c.id === cur ? 'true' : undefined} onClick={() => open(c.id)}>
              <Led state={c.id === cur ? 'active' : g.isDone(c.id) ? 'done' : 'open'} />
              <span>{c.name}</span>
              <span className="mono muted">{c.pts}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}

export function Feed({ feed }: { feed: FeedEvent[] }) {
  return (
    <aside className="feed" aria-label="Activity">
      <p className="rail-cat mono">Activity</p>
      {feed.length === 0 && <p className="muted small">Captures, hints, and test results show up here.</p>}
      <ol>
        {feed.map((e, i) => (
          <li key={e.t + '-' + i} className={`ev ev-${e.kind}`}>
            <span className="mono muted">{stamp(e.t)}</span>
            <span className="tag mono">{e.kind}</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </aside>
  )
}

export function ChallengeView({ g, c, open, fixedReq, onCaptured }: { g: Game; c: Challenge; open: (id: string) => void; fixedReq: number; onCaptured: (c: Challenge) => void }) {
  const [brief, setBrief] = useState(() => !g.isDone(c.id))
  const [hints, setHints] = useState<string[]>([])
  const [guess, setGuess] = useState('')
  const [msg, setMsg] = useState('')
  const done = g.isDone(c.id)
  const chat = c.kind === 'chat'
  const allHints = [(chat ? 'Try something like: ' : 'Start here: ') + c.tech.ex, ...c.hints]
  const secret = g.secretOf(c)

  const hint = () => {
    const next = allHints[Math.min(hints.length, allHints.length - 1)]
    if (hints.length < allHints.length) { g.spendHint(c); g.log('hint', `${c.name}: hint ${hints.length + 1}${done ? '' : ` (−${HINT_COST[c.pts]})`}`) }
    setHints(h => (h.length < allHints.length ? [...h, next] : h))
  }

  const submit = () => {
    const raw = guess.trim()
    if (!raw) return
    const exp = g.expected(c)
    const n = (s: string) => s.toUpperCase().replace(/\s+/g, '')
    const a = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const ok = (v: string) => n(v) === n(exp) || (c.alt || []).some(x => n(x) === n(v))
    const m = raw.match(/^flag\s*\{\s*(.+?)\s*\}$/i)
    if (!m && (ok(raw) || a(raw) === a(exp))) { setMsg('Right value, wrong format. Submit it as flag{...}.'); return }
    if (m && ok(m[1])) { setGuess(''); setMsg(''); onCaptured(c); return }
    setMsg(m ? 'That isn’t the flag. Keep working on it.' : 'Flags look like flag{EXAMPLE}. Check your format.')
    g.log('fail', `${c.name}: wrong flag`)
  }

  const meta: [string, string][] = chat
    ? [['Similar to', c.like], ['OWASP Top 10 for LLMs', c.owasp]]
    : [['Certification link', c.cert]]

  return (
    <div className="op">
      <Rail g={g} cur={c.id} open={open} />
      <main className="op-main" id="main">
        <div className="op-head">
          <p className="op-id mono">
            <Led state={done ? 'done' : 'active'} />
            <span>{c.code}</span><span>{catOf(c).name}</span><span>{c.pts} pts</span><span className={done ? 'st-done' : 'st-open'}>{done ? 'Captured' : 'Open'}</span>
          </p>
          <h1 className="mission">{c.mission}</h1>
          <div className="op-tools">
            <button type="button" className="btn btn-ghost" aria-expanded={brief} onClick={() => setBrief(b => !b)}>{brief ? 'Hide how it works' : 'How it works'}</button>
            <button type="button" className="btn btn-ghost" onClick={hint}>Hint{!done && <span className="cost mono"> −{HINT_COST[c.pts]}</span>}</button>
            <span className="muted small">{c.name} · {chat ? 'Technique' : 'Skill'}: <b className="ink">{c.tech.name}</b></span>
          </div>
          {brief && <Explainer x={EXPLAIN[c.id]} meta={meta} />}
          {hints.length > 0 && (
            <ol className="hints">{hints.map((h, i) => <li key={i}><span className="mono">HINT {i + 1}</span>{h}</li>)}</ol>
          )}
        </div>

        {chat ? <ChatConsole c={c} secret={secret} captured={done} fixedReq={fixedReq} log={g.log} /> : <ToolWorkspace c={c} secret={secret} log={g.log} />}

        <div className="flagbar">
          <label htmlFor="flag" className="mono">Submit flag</label>
          <input id="flag" value={guess} onChange={e => setGuess(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }} placeholder="flag{...}" autoComplete="off" spellCheck={false} />
          <button type="button" className="btn btn-gold" onClick={submit}>Submit</button>
          {msg && <p className="flagmsg" role="status">{msg}</p>}
        </div>
      </main>
      <Feed feed={g.feed} />
    </div>
  )
}

/* ---------------- Capture overlay ---------------- */

export function CaptureOverlay({ g, c, onBoard, onStay, onFixed }: { g: Game; c: Challenge; onBoard: () => void; onStay: () => void; onFixed: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const pts = useCountUp(g.points(c), 900)
  const all = g.save.done.length === ALL.length
  const chat = c.kind === 'chat'
  useEffect(() => { ref.current?.showModal() }, [])
  const leave = (fn: () => void) => () => { ref.current?.close(); fn() }
  return (
    <dialog ref={ref} className="capture" aria-labelledby="cap-title" onCancel={e => { e.preventDefault(); leave(onStay)() }}>
      <div className="cap-top">
        <p className="cap-stamp" id="cap-title" tabIndex={-1} autoFocus>{all ? 'Board cleared' : 'Flag captured'}</p>
        <p className="cap-pts mono">+{pts}</p>
        <p className="mono cap-flag">{c.code} · {F(g.expected(c))}</p>
      </div>
      <dl className="cap-body">
        <div><dt className="mono">{chat ? 'Technique' : 'Skill'}</dt><dd>{c.rep.t}</dd></div>
        <div><dt className="mono">{chat ? 'OWASP Top 10 for LLMs' : 'Certification link'}</dt><dd>{chat ? c.owasp : c.cert}</dd></div>
        <div><dt className="mono">{chat ? 'Where this happened for real' : 'Why it matters'}</dt><dd>{c.rep.w}</dd></div>
        <div><dt className="mono">How defenders stop it</dt><dd>{c.rep.d}</dd></div>
        {all && <div><dt className="mono">What you just did</dt><dd>You attacked AI systems, fixed and hardened network gear, and investigated real kinds of evidence. That’s the work of red teamers, network admins, and SOC analysts. Final score: <b>{g.score}</b>. Only test systems you have permission to test.</dd></div>}
      </dl>
      <div className="cap-actions">
        <button type="button" className="btn btn-gold" onClick={leave(onBoard)}>Back to the board</button>
        {chat && !c.noFix && <button type="button" className="btn btn-ghost" onClick={leave(onFixed)}>Try it against the fixed version</button>}
        <button type="button" className="btn btn-ghost" onClick={leave(onStay)}>Stay here</button>
      </div>
    </dialog>
  )
}

/* ---------------- Decoder and guide ---------------- */

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (open) ref.current?.showModal(); else ref.current?.close() }, [open])
  return (
    <dialog ref={ref} className="sheet" aria-label={title} onCancel={e => { e.preventDefault(); onClose() }}>
      <div className="sheet-head"><h2>{title}</h2><button type="button" className="btn btn-ghost" onClick={onClose}>Close</button></div>
      {children}
    </dialog>
  )
}

export function Decoder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [v, setV] = useState('')
  const [out, setOut] = useState('')
  return (
    <Modal open={open} onClose={onClose} title="Decoder">
      <p className="muted">Paste encoded text, then pick how to decode it. Analysts use tools like CyberChef for this.</p>
      <textarea value={v} onChange={e => setV(e.target.value)} rows={4} spellCheck={false} aria-label="Text to decode" />
      <div className="toolbar">
        {Object.entries(decoders).map(([k, fn]) => (
          <button key={k} type="button" className="btn btn-ghost" onClick={() => { try { setOut(fn(v)) } catch { setOut('Couldn’t decode that. Check the format.') } }}>{k}</button>
        ))}
      </div>
      <pre className="out" aria-live="polite">{out || 'Output appears here.'}</pre>
    </Modal>
  )
}

const GUIDE: [string, string, string][] = [
  ['Prompt leaking', 'Get the AI to reveal the hidden instructions its developer wrote.', 'AI-01'],
  ['Instruction override', 'Write new rules that replace the AI’s real ones, like “Ignore your previous instructions and…”', 'AI-02'],
  ['Role impersonation', 'Pretend to be someone the AI should trust, like an employee.', 'AI-02, AI-ADV-07'],
  ['Jailbreaking', 'Wrap a request in a story or game so breaking the rule doesn’t feel like breaking a rule.', 'AI-03'],
  ['Self-referential injection', 'Control the shape of the AI’s answer so it slips past the filter checking it.', 'AI-04'],
  ['Goal hijacking', 'Give the AI a normal-looking task that secretly carries your goal.', 'AI-06'],
  ['Direct command injection', 'When an AI can run commands, send one that exposes more than it should.', 'AI-ADV-08'],
  ['Evasions', 'Typos, synonyms, other languages, or encodings that dodge filters.', 'AI-05, AI-ADV-09'],
  ['Fragmentation', 'Pull data out a few pieces at a time so no single reply looks suspicious.', 'AI-ADV-10'],
  ['Indirect prompt injection', 'Hide instructions in content the AI reads, like a ticket or web page.', 'AI-ADV-11, AI-ADV-13'],
  ['Sensitive information disclosure', 'Find secrets an AI can read, like a key in a project file.', 'AI-ADV-12'],
]

export function Guide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Field guide">
      <p className="muted">The main ways people attack AI systems, in plain English. Every challenge also has a How it works panel with a picture and a 3-step plan.</p>
      <p className="muted">There’s no single right answer on the AI targets. Each message is checked for the technique you used, shown as <b>Detected</b> under your message, and the target’s real filters decide what gets through. If your trick would actually beat that defense, it works.</p>
      <dl className="guide">
        {GUIDE.map(([k, v, where]) => <div key={k}><dt>{k}<span className="mono muted"> {where}</span></dt><dd>{v}</dd></div>)}
      </dl>
    </Modal>
  )
}

/* ---------------- Boot and footer ---------------- */

const BOOT = [
  'RIVERBEND SD // SECURITY OPERATIONS CONSOLE',
  'crack-the-guard 3.0 · Missouri S&T Miner Champions',
  '[ ok ] loading 13 AI targets',
  '[ ok ] bringing up Cisco lab: R2, R3',
  '[ ok ] capture engine on eth0',
  `[ ok ] ${ALL.length} challenges online`,
  'press any key to start',
]

export function Boot({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setN(BOOT.length); return }
    if (n >= BOOT.length) return
    const id = setTimeout(() => setN(x => x + 1), n === 0 ? 150 : 230)
    return () => clearTimeout(id)
  }, [n])
  useEffect(() => {
    const go = () => onDone()
    window.addEventListener('keydown', go)
    const t = n >= BOOT.length ? setTimeout(go, 1400) : undefined
    return () => { window.removeEventListener('keydown', go); if (t) clearTimeout(t) }
  }, [n, onDone])
  return (
    <div className="boot" onClick={onDone} role="dialog" aria-label="Starting console">
      <pre>{BOOT.slice(0, n).map((l, i) => <div key={i} className={i === BOOT.length - 1 ? 'blink' : l.startsWith('[ ok ]') ? 'ok' : ''}>{l}</div>)}</pre>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="site">
      <img src={acm} alt="S&T ACM" width={96} height={55} />
      <img src={eagle} alt="ACM Security" width={40} height={38} />
      <p><b>Crack the Guard</b> was built by Tyler Sanford for Missouri S&amp;T Miner Champions. Want to keep hacking? Join ACM Security at Missouri S&amp;T.</p>
    </footer>
  )
}
