import { useMemo, useRef, useState, useEffect } from 'react'
import type { ChatChallenge, ChatCtx, FeedEvent, ToolChallenge } from '../game/types'
import { F, R, hexdump, leakCheck, printable } from '../game/util'
import { LinuxShell, LockItDown, RouterRescue, type AuditCheck } from '../game/shells'
import { FLOWS, NMAP, PHISH_HEADERS, authLog, capture, firstMatch, srcValid, subnetQuestion, type Rule } from '../game/evidence'
import { Terminal } from './Terminal'
import { Led } from './bits'

type Log = (kind: FeedEvent['kind'], text: string) => void

/* ---------------- Chat targets ---------------- */

interface Msg { who: string; kind: 'bot' | 'you' | 'block' | 'defense' | 'sys' | 'typing'; text: string; tags?: string[] }

function SignalChain({ c }: { c: ChatChallenge }) {
  const s = c.stack
  const nodes: [string, string, boolean | null][] = [
    ['Input', 'your message', null],
    ['Input filter', s.inF ? 'blocks keywords' : 'off', s.inF],
    ['Model', s.rules ? 'has rules' : 'no rules', s.rules],
    ['Tools', s.tools ? s.toolsLabel || 'email, files, keys' : 'none', s.tools],
    ['Output filter', s.outF ? 'scans replies' : 'off', s.outF],
    ['Reply', 'what you see', null],
  ]
  return (
    <ol className="chain" aria-label="Defenses between you and the model">
      {nodes.map(([k, v, on]) => (
        <li key={k} className={on === null ? 'io' : on ? 'on' : 'off'}>
          {on !== null && <Led state={on ? 'done' : 'off'} />}
          <span className="ck">{k}</span>
          <span className="cv">{v}</span>
        </li>
      ))}
    </ol>
  )
}

export function ChatConsole({ c, secret, captured, fixedReq, log }: { c: ChatChallenge; secret: string; captured: boolean; fixedReq: number; log: Log }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ who: 'TARGET', kind: 'bot', text: c.lines[0] }])
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [fixed, setFixed] = useState(false)
  const ctx = useRef<ChatCtx>({ secret, q: null })
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { ctx.current.secret = secret }, [secret])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs])

  const setMode = (f: boolean) => {
    setFixed(f)
    setMsgs(m => [...m, { who: 'MODE', kind: 'sys', text: f ? 'Fixed mode is on. Replay the attack that worked and watch the defense stop it.' : 'Vulnerable mode is back on.' }])
  }
  useEffect(() => { if (fixedReq > 0) setMode(true) }, [fixedReq]) // eslint-disable-line react-hooks/exhaustive-deps

  const respond = (raw: string): { out: Msg[]; tags?: string[] } => {
    const r = c.respond(raw.toLowerCase(), raw, ctx.current)
    return { out: reply(raw, r), tags: r?.tags }
  }

  const reply = (raw: string, r: ReturnType<ChatChallenge['respond']>): Msg[] => {
    const m = raw.toLowerCase()
    const defense = (): Msg => { log('defense', `${c.name}: fixed version held`); return { who: 'DEFENSE', kind: 'defense', text: `${c.fix} The fix held.` } }
    if (fixed && r && !r.block && r.text) {
      if (c.fixTrig?.test(r.text)) { ctx.current.q = null; return [defense()] }
      if (c.mask && r.text.includes(F(secret))) return [{ who: 'TARGET', kind: 'bot', text: r.text.split(F(secret)).join('•••••••• [masked]') }, defense()]
      if (r.leaked || (c.frag && /Characters? \d+/.test(r.text)) || leakCheck(r.text, secret)) return [defense()]
    }
    if (r?.block) return [{ who: 'FILTER', kind: 'block', text: r.block }]
    if (r?.text) return [{ who: 'TARGET', kind: 'bot', text: r.text }]
    if (R.greet.test(m)) return [{ who: 'TARGET', kind: 'bot', text: c.lines[0] }]
    return [{ who: 'TARGET', kind: 'bot', text: c.lines[1 + Math.floor(Math.random() * (c.lines.length - 1))] }]
  }

  const send = () => {
    const v = value.trim()
    if (!v || busy) return
    setValue('')
    setBusy(true)
    setMsgs(m => [...m, { who: 'YOU', kind: 'you', text: v }, { who: 'TARGET', kind: 'typing', text: 'typing' }])
    setTimeout(() => {
      const { out, tags } = respond(v)
      setMsgs(m => {
        const base = m.filter(x => x.kind !== 'typing')
        const li = base.length - 1
        if (tags?.length && base[li]?.kind === 'you') base[li] = { ...base[li], tags }
        return [...base, ...out]
      })
      setBusy(false)
    }, 450 + Math.random() * 450)
  }

  return (
    <section className="ws chat" aria-label="Conversation with the target">
      <div className="ws-head">
        <SignalChain c={c} />
        {captured && !c.noFix && (
          <div className="mode" role="group" aria-label="Target version">
            <span>Version</span>
            <button type="button" aria-pressed={!fixed} onClick={() => fixed && setMode(false)}>Vulnerable</button>
            <button type="button" aria-pressed={fixed} onClick={() => !fixed && setMode(true)}>Fixed</button>
          </div>
        )}
      </div>
      <div className="transcript" aria-live="polite">
        {msgs.map((x, i) => (
          <div key={i} className={`msg msg-${x.kind}`}>
            <span className="who">{x.who}</span>
            <span className="say">
              {x.kind === 'typing' ? <span className="typing" aria-label="Target is typing"><i /><i /><i /></span> : x.text}
              {x.tags && <span className="tags"><span className="tags-k">Detected</span>{x.tags.map(t => <span key={t} className="tag">{t}</span>)}</span>}
            </span>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="composer">
        <span className="caret-sign" aria-hidden="true">&gt;</span>
        <input value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }} placeholder="Message the target" aria-label="Message the target" autoComplete="off" />
        <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>Send</button>
      </div>
    </section>
  )
}

/* ---------------- Cisco ---------------- */

export function RouterWS({ secret, log }: { secret: string; log: Log }) {
  const shell = useMemo(() => new RouterRescue(secret), [secret])
  return <section className="ws"><Terminal shell={shell} label="R2 · console" meta="ISR 4331 · 9600 8N1" onCommand={(_c, out) => { if (out.includes('%ISP-GW')) log('info', 'R2 uplink verified by ISP') }} /></section>
}

export function LockdownWS({ secret, log }: { secret: string; log: Log }) {
  const shell = useMemo(() => new LockItDown(), [])
  const [checks, setChecks] = useState<AuditCheck[] | null>(null)
  const all = checks?.every(x => x.ok)
  return (
    <section className="ws">
      <Terminal shell={shell} label="R3 · console" meta="ISR 4331 · 9600 8N1" />
      <div className="audit">
        <div className="audit-head">
          <h3>Security audit</h3>
          <button type="button" className="btn btn-primary" onClick={() => { const r = shell.audit(); setChecks(r); log(r.every(x => x.ok) ? 'info' : 'fail', `R3 audit: ${r.filter(x => x.ok).length} of 5 passed`) }}>Run audit</button>
        </div>
        {checks ? (
          <ul>
            {checks.map(x => (
              <li key={x.label} className={x.ok ? 'pass' : 'fail'}>
                <Led state={x.ok ? 'done' : 'alert'} />
                <span><b>{x.label}</b>{!x.ok && <span className="fixnote"> {x.fix}</span>}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">No audit run yet. Run it to see which checks fail.</p>}
        {all && <p className="reveal">Audit passed. Compliance ticket: <code>{F(secret)}</code></p>}
      </div>
    </section>
  )
}

/* ---------------- IT Essentials ---------------- */

export function LinuxWS({ secret }: { secret: string }) {
  const shell = useMemo(() => new LinuxShell(secret), [secret])
  return <section className="ws"><Terminal shell={shell} label="riverbend-pc · ssh" meta="Ubuntu 24.04" /></section>
}

export function LogsWS() {
  const lines = useMemo(authLog, [])
  const [q, setQ] = useState('')
  const hits = q ? lines.filter(l => l.toLowerCase().includes(q.toLowerCase())) : lines
  const mark = (l: string) => {
    if (!q) return l
    const i = l.toLowerCase().indexOf(q.toLowerCase())
    return <>{l.slice(0, i)}<mark>{l.slice(i, i + q.length)}</mark>{l.slice(i + q.length)}</>
  }
  return (
    <section className="ws">
      <div className="toolbar">
        <label className="field">
          <span>grep</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Accepted, Failed, an IP…" autoComplete="off" spellCheck={false} />
        </label>
        <span className="muted mono">/var/log/auth.log · {q ? `${hits.length} of ${lines.length} lines` : `${lines.length} lines`}</span>
      </div>
      <pre className="logview">{hits.length ? hits.map((l, i) => <div key={i} className={/Accepted/.test(l) ? 'ok' : /Failed/.test(l) ? 'bad' : ''}>{mark(l)}</div>) : <div className="muted">No matching lines.</div>}</pre>
    </section>
  )
}

export function PhishWS() {
  const [raw, setRaw] = useState(false)
  return (
    <section className="ws">
      <article className="mail">
        <header>
          <p className="subject">Action required: your password expires today</p>
          <p><b>Riverbend IT Help Desk</b> <span className="muted">&lt;it-support@riverbendsd.org&gt;</span></p>
          <p className="muted">to jlee@riverbendsd.org · Mon 7:42 AM</p>
        </header>
        <div className="mail-body">
          <p>Hi,</p>
          <p>Our records show your district password expires in 2 hours. To avoid losing access to email and Canvas, confirm your password now.</p>
          <p><span className="fake-cta">Keep my current password</span></p>
          <p>Riverbend School District IT</p>
        </div>
        <footer><button type="button" className="btn btn-ghost" onClick={() => setRaw(r => !r)} aria-expanded={raw}>{raw ? 'Hide original' : 'Show original'}</button></footer>
      </article>
      {raw && <pre className="out">{PHISH_HEADERS}</pre>}
    </section>
  )
}

/* ---------------- Network Security ---------------- */

export function NmapWS() {
  return <section className="ws"><pre className="out out-term">{NMAP}</pre></section>
}

const PROTO_CLASS: Record<string, string> = { FTP: 'p-ftp', DNS: 'p-dns', TCP: 'p-tcp', ARP: 'p-arp', 'TLSv1.3': 'p-tls' }

export function PcapWS({ secret }: { secret: string }) {
  const packets = useMemo(() => capture(secret), [secret])
  const [filter, setFilter] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const f = filter.trim().toLowerCase().replace(/^(ip\.addr|ip)\s*==\s*/, '')
  const shown = packets.map((p, i) => ({ p, i })).filter(({ p }) => !f || p.proto.toLowerCase().includes(f) || p.src.includes(f) || p.dst.includes(f) || p.info.toLowerCase().includes(f))
  const pk = sel !== null ? packets[sel] : null
  return (
    <section className="ws">
      <div className="toolbar">
        <label className="field">
          <span>display filter</span>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="ftp, dns, 10.10.2.40" autoComplete="off" spellCheck={false} />
        </label>
        <span className="muted mono"><Led state="active" /> eth0 · {shown.length} of {packets.length} packets</span>
      </div>
      <div className="table-wrap">
        <table className="pcap">
          <thead><tr><th>No.</th><th>Time</th><th>Source</th><th>Destination</th><th>Protocol</th><th>Info</th></tr></thead>
          <tbody>
            {shown.map(({ p, i }) => (
              <tr key={i} className={`${PROTO_CLASS[p.proto] || ''}${sel === i ? ' sel' : ''}`} tabIndex={0} onClick={() => setSel(i)} onKeyDown={e => { if (e.key === 'Enter') setSel(i) }} aria-selected={sel === i}>
                <td>{i + 1}</td><td>{(0.0213 * i + 0.0011).toFixed(4)}</td><td>{p.src}</td><td>{p.dst}</td><td>{p.proto}</td><td>{p.info}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <pre className="out">{pk ? `Frame ${sel! + 1}: ${pk.proto}, ${pk.src} → ${pk.dst}\n\n` + (pk.payload ? `${hexdump(pk.payload)}\n\nAs text: ${printable(pk.payload)}` : '(no payload)') : 'Select a packet to inspect its bytes.'}</pre>
    </section>
  )
}

let ruleId = 1
export function FirewallWS({ secret, log }: { secret: string; log: Log }) {
  const [rules, setRules] = useState<Rule[]>([{ id: ruleId++, action: 'permit', src: 'any', port: 'any' }])
  const [result, setResult] = useState<{ rows: { label: string; want: boolean; got: boolean; hit: number }[]; bad?: number } | null>(null)
  const upd = (id: number, patch: Partial<Rule>) => setRules(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  const test = () => {
    const bad = rules.findIndex(r => !srcValid(r.src))
    if (bad >= 0) { setResult({ rows: [], bad }); return }
    const rows = FLOWS.map(fl => { const hit = firstMatch(rules, fl); return { label: fl.label, want: fl.allow, got: hit >= 0 && rules[hit].action === 'permit', hit } })
    setResult({ rows })
    const pass = rows.filter(r => r.want === r.got).length
    log(pass === rows.length ? 'info' : 'fail', `Firewall test: ${pass} of ${rows.length} passed`)
  }
  const passed = result && !result.bad && result.rows.length > 0 && result.rows.every(r => r.want === r.got)
  return (
    <section className="ws">
      <p className="muted">Rules run top to bottom. The first match wins. Anything that matches nothing hits the implicit deny.</p>
      <div className="table-wrap">
        <table className="rules">
          <thead><tr><th>#</th><th>Action</th><th>Source</th><th>Dest port</th><th><span className="sr-only">Order and delete</span></th></tr></thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={r.id}>
                <td className="mono">{i + 1}</td>
                <td><select value={r.action} aria-label={`Rule ${i + 1} action`} onChange={e => upd(r.id, { action: e.target.value as Rule['action'] })}><option>permit</option><option>deny</option></select></td>
                <td><input value={r.src} aria-label={`Rule ${i + 1} source`} className={srcValid(r.src) ? '' : 'invalid'} spellCheck={false} onChange={e => upd(r.id, { src: e.target.value.trim() })} /></td>
                <td><select value={r.port} aria-label={`Rule ${i + 1} port`} onChange={e => upd(r.id, { port: e.target.value as Rule['port'] })}>{['any', '22', '80', '443', '3389'].map(p => <option key={p}>{p}</option>)}</select></td>
                <td className="row-actions">
                  <button type="button" onClick={() => i > 0 && setRules(rs => { const n = [...rs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })} disabled={i === 0} aria-label={`Move rule ${i + 1} up`}>Up</button>
                  <button type="button" onClick={() => setRules(rs => rs.filter(x => x.id !== r.id))} aria-label={`Delete rule ${i + 1}`}>Delete</button>
                </td>
              </tr>
            ))}
            <tr className="implicit"><td className="mono">*</td><td>deny</td><td>any</td><td>any</td><td className="muted">implicit</td></tr>
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <button type="button" className="btn btn-ghost" onClick={() => setRules(rs => [...rs, { id: ruleId++, action: 'permit', src: 'any', port: '80' }])}>Add rule</button>
        <button type="button" className="btn btn-primary" onClick={test}>Run traffic test</button>
      </div>
      {result?.bad !== undefined && <p className="error">Rule {result.bad + 1} has a source the firewall can’t read. Use any, an IP like 10.10.5.20, or a network like 10.10.5.0/24.</p>}
      {result && result.rows.length > 0 && (
        <div className="table-wrap">
          <table className="results">
            <thead><tr><th>Traffic</th><th>Should be</th><th>Result</th><th>Check</th></tr></thead>
            <tbody>
              {result.rows.map(r => (
                <tr key={r.label} className={r.want === r.got ? 'pass' : 'fail'}>
                  <td>{r.label}</td><td>{r.want ? 'allowed' : 'blocked'}</td><td>{r.got ? 'allowed' : 'blocked'} <span className="muted">({r.hit >= 0 ? `rule ${r.hit + 1}` : 'implicit deny'})</span></td>
                  <td><Led state={r.want === r.got ? 'done' : 'alert'} /> {r.want === r.got ? 'Pass' : 'Fail'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {passed && <p className="reveal">All six tests passed. Change ticket approved: <code>{F(secret)}</code></p>}
    </section>
  )
}

/* ---------------- Quick-fire ---------------- */

export function SubnetWS({ secret, log }: { secret: string; log: Log }) {
  const [q, setQ] = useState(subnetQuestion)
  const [streak, setStreak] = useState(0)
  const [a, setA] = useState({ net: '', bc: '', hosts: '' })
  const [note, setNote] = useState('')
  const won = streak >= 3
  const check = () => {
    const ok = a.net.trim() === q.net && a.bc.trim() === q.bc && a.hosts.trim() === q.hosts
    if (ok) {
      const n = streak + 1
      setStreak(n)
      setNote(n >= 3 ? '' : 'Correct. Next one.')
      if (n >= 3) log('info', 'Subnetting: three in a row')
    } else {
      setNote(`Not quite. ${q.ip} uses mask ${q.mask}: network ${q.net}, broadcast ${q.bc}, ${q.hosts} usable hosts. Streak reset.`)
      setStreak(0)
    }
    if (!(ok && streak + 1 >= 3)) { setQ(subnetQuestion()); setA({ net: '', bc: '', hosts: '' }) }
  }
  return (
    <section className="ws">
      <div className="drill">
        <div className="streak" aria-label={`Streak ${streak} of 3`}>{[0, 1, 2].map(i => <Led key={i} state={i < streak ? 'done' : 'off'} />)}<span>Streak {streak} of 3</span></div>
        <p className="qip">{q.ip}</p>
        <div className="drill-fields">
          <label className="field"><span>Network address</span><input value={a.net} onChange={e => setA({ ...a, net: e.target.value })} disabled={won} spellCheck={false} /></label>
          <label className="field"><span>Broadcast address</span><input value={a.bc} onChange={e => setA({ ...a, bc: e.target.value })} disabled={won} spellCheck={false} /></label>
          <label className="field"><span>Usable hosts</span><input value={a.hosts} onChange={e => setA({ ...a, hosts: e.target.value })} disabled={won} inputMode="numeric" onKeyDown={e => { if (e.key === 'Enter') check() }} /></label>
        </div>
        <button type="button" className="btn btn-primary" onClick={check} disabled={won}>Check</button>
        {note && <p className="muted" role="status">{note}</p>}
        {won && <p className="reveal">Three in a row. <code>{F(secret)}</code></p>}
      </div>
    </section>
  )
}

export function ToolWorkspace({ c, secret, log }: { c: ToolChallenge; secret: string; log: Log }) {
  switch (c.kind) {
    case 'router': return <RouterWS secret={secret} log={log} />
    case 'lockdown': return <LockdownWS secret={secret} log={log} />
    case 'linux': return <LinuxWS secret={secret} />
    case 'logs': return <LogsWS />
    case 'phish': return <PhishWS />
    case 'nmap': return <NmapWS />
    case 'pcap': return <PcapWS secret={secret} />
    case 'firewall': return <FirewallWS secret={secret} log={log} />
    case 'subnet': return <SubnetWS secret={secret} log={log} />
  }
}
