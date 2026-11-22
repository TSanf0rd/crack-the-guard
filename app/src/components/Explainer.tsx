import { useEffect, useState } from 'react'
import type { Explain, FlowNode, Visual } from '../game/explain'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Steps through 0..n, one step every `ms`. Restart by changing `run`. */
function useStepper(n: number, ms: number, run: number) {
  const [i, setI] = useState(() => (reduced() ? n : 0))
  useEffect(() => {
    if (reduced()) { setI(n); return }
    setI(0)
    let k = 0
    const t = setInterval(() => { k++; setI(k); if (k >= n) clearInterval(t) }, ms)
    return () => clearInterval(t)
  }, [n, ms, run])
  return i
}

function Replay({ onClick }: { onClick: () => void }) {
  return <button type="button" className="xp-replay mono" onClick={onClick}>Replay</button>
}

/* ---------- flow: boxes light up left to right ---------- */
function Flow({ nodes }: { nodes: FlowNode[] }) {
  const [run, setRun] = useState(0)
  const lit = useStepper(nodes.length, 650, run)
  return (
    <>
      <ol className="flow">
        {nodes.map((n, i) => (
          <li key={i} className={`fn fn-${n.s || 'ok'}${i < lit ? ' lit' : ''}`}>
            <span className="fk">{n.k}</span>
            <span className="fv">{n.v}</span>
          </li>
        ))}
      </ol>
      <Replay onClick={() => setRun(r => r + 1)} />
    </>
  )
}

/* ---------- table ---------- */
function Table({ v }: { v: Extract<Visual, { type: 'table' }> }) {
  return (
    <>
      <div className="xtable-wrap">
        <table className="xtable">
          <thead><tr>{v.head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {v.rows.map((r, i) => (
              <tr key={i} className={v.bad?.includes(i) ? 'r-bad' : v.good?.includes(i) ? 'r-good' : undefined}>
                {r.map((c, j) => <td key={j} data-label={v.head[j]}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {v.note && <p className="xp-note">{v.note}</p>}
    </>
  )
}

/* ---------- filter checker ---------- */
function Filter({ v }: { v: Extract<Visual, { type: 'filter' }> }) {
  const [text, setText] = useState(v.tries[0])
  const hit = v.mode === 'in'
    ? v.words.find(w => text.toLowerCase().includes(w))
    : v.words.find(w => text.toUpperCase().includes(w))
  return (
    <div className="fsim">
      <div className="fsim-tries">
        {v.tries.map(t => <button key={t} type="button" className={`chip${t === text ? ' on' : ''}`} onClick={() => setText(t)}>{t}</button>)}
      </div>
      <label className="fsim-row">
        <span className="mono fsim-lab">{v.mode === 'in' ? 'Your message' : 'AI reply'}</span>
        <input value={text} onChange={e => setText(e.target.value)} spellCheck={false} autoComplete="off" />
      </label>
      <p className={`fsim-out mono ${hit ? 'blocked' : 'passed'}`} role="status">
        <span className={`led ${hit ? 'led-alert' : 'led-done'}`} />
        {hit ? `BLOCKED: found “${hit.toLowerCase()}”` : 'PASSES the filter'}
      </p>
      <p className="xp-note">{v.note}</p>
    </div>
  )
}

/* ---------- encoder ---------- */
const b64 = (s: string) => { try { return btoa(unescape(encodeURIComponent(s))) } catch { return '' } }
const hexOf = (s: string) => Array.from(new TextEncoder().encode(s)).map(b => b.toString(16).padStart(2, '0')).join(' ')
function Encode() {
  const [t, setT] = useState('HELLO')
  return (
    <div className="fsim">
      <label className="fsim-row">
        <span className="mono fsim-lab">Plain text</span>
        <input value={t} onChange={e => setT(e.target.value.slice(0, 40))} spellCheck={false} autoComplete="off" />
      </label>
      <dl className="enc">
        <div><dt className="mono">Base64</dt><dd className="mono">{b64(t) || ' '}</dd></div>
        <div><dt className="mono">Hex</dt><dd className="mono">{hexOf(t) || ' '}</dd></div>
      </dl>
      <p className="xp-note">A filter looking for “{t || 'HELLO'}” won’t recognize either line. The Decoder turns them back.</p>
    </div>
  )
}

/* ---------- fragments ---------- */
function Fragment({ example }: { example: string }) {
  const parts = example.match(/.{1,5}/g) || []
  const [run, setRun] = useState(0)
  const step = useStepper(parts.length + 1, 900, run)
  const shown = parts.slice(0, Math.min(step, parts.length))
  return (
    <div className="frag">
      <ol className="frag-asks">
        {parts.map((p, i) => {
          const a = i * 5 + 1, b = i * 5 + p.length
          return (
            <li key={i} className={i < step ? 'lit' : ''}>
              <span className="mono muted">“Characters {a} to {b}?”</span>
              <span className="mono frag-p">{i < step ? p : '·'.repeat(p.length)}</span>
              <span className="mono led-txt">{i < step ? 'no alarm' : ''}</span>
            </li>
          )
        })}
      </ol>
      <p className="frag-join mono">
        <span className="muted">Put together:</span> {shown.map((p, i) => <span key={i} className={`fj fj-${i % 3}`}>{p}</span>)}
        {step > parts.length && <span className="frag-ok"> = {example}</span>}
      </p>
      <Replay onClick={() => setRun(r => r + 1)} />
    </div>
  )
}

/* ---------- acrostic ---------- */
function Acrostic({ lines }: { lines: string[] }) {
  const word = lines.map(l => l[0]).join('')
  return (
    <div className="acro">
      <ol>
        {lines.map(l => <li key={l}><b>{l[0]}</b>{l.slice(1)}</li>)}
      </ol>
      <p className="acro-word mono"><span className="muted">Read down the left side:</span> <b>{word}</b></p>
    </div>
  )
}

/* ---------- firewall bouncer ---------- */
const FW_RULES = [
  { text: 'permit  any  →  port 80 (website)', match: (p: number) => p === 80 },
  { text: 'permit  any  →  port 443 (secure website)', match: (p: number) => p === 443 },
]
const FW_VISITORS = [
  { who: 'Student opens the website', port: 443 },
  { who: 'Attacker tries SSH', port: 22 },
  { who: 'Someone loads the old http site', port: 80 },
]
function Firewall() {
  const [v, setV] = useState<number | null>(null)
  const [run, setRun] = useState(0)
  const rows = FW_RULES.length + 1
  const step = useStepper(rows, 600, run)
  const port = v === null ? null : FW_VISITORS[v].port
  const hit = port === null ? -1 : FW_RULES.findIndex(r => r.match(port))
  const stopAt = hit === -1 ? FW_RULES.length : hit
  const done = v !== null && step > stopAt
  return (
    <div className="fw">
      <div className="fsim-tries">
        {FW_VISITORS.map((x, i) => (
          <button key={x.who} type="button" className={`chip${v === i ? ' on' : ''}`} onClick={() => { setV(i); setRun(r => r + 1) }}>
            {x.who} <span className="mono muted">:{x.port}</span>
          </button>
        ))}
      </div>
      <ol className="fw-list mono">
        {[...FW_RULES.map(r => r.text), 'deny   everything else (invisible last line)'].map((t, i) => {
          const checking = v !== null && i <= Math.min(step, stopAt) && i < step
          const matched = done && i === stopAt
          return (
            <li key={t} className={`${checking ? 'chk' : ''}${matched ? (i === FW_RULES.length ? ' deny' : ' allow') : ''}`}>
              <span className="fw-n">{i + 1}</span>{t}
              {checking && !matched && <span className="fw-tag">no match</span>}
              {matched && <span className="fw-tag">{i === FW_RULES.length ? 'BLOCKED' : 'LET IN'}</span>}
            </li>
          )
        })}
      </ol>
      <p className="xp-note">{v === null ? 'Pick a visitor. The bouncer checks the list from the top and stops at the first match.' : done ? (stopAt === FW_RULES.length ? 'Nothing matched, so the invisible last line blocks it.' : `Rule ${stopAt + 1} matched, so the bouncer stops reading and lets them in.`) : 'Checking…'}</p>
    </div>
  )
}

/* ---------- subnet slider ---------- */
function Subnet() {
  const [p, setP] = useState(26)
  const size = 2 ** (32 - p)
  const mask = 256 - size
  const blocks = 256 / size
  const hl = blocks > 1 ? 1 : 0
  const net = hl * size
  return (
    <div className="sub">
      <div className="sub-ctl">
        <label className="mono" htmlFor="pfx">Prefix /{p}</label>
        <input id="pfx" type="range" min={24} max={30} value={p} onChange={e => setP(+e.target.value)} />
      </div>
      <div className="sub-bar" aria-hidden="true">
        {Array.from({ length: blocks }, (_, i) => <span key={i} className={i === hl ? 'b-hl' : ''} />)}
      </div>
      <div className="sub-scale mono" aria-hidden="true"><span>.0</span><span>.255</span></div>
      <dl className="sub-read mono">
        <div><dt>Mask</dt><dd>255.255.255.{mask}</dd></div>
        <div><dt>Block size</dt><dd>256 − {mask} = {size}</dd></div>
        <div><dt>Blocks</dt><dd>{blocks}</dd></div>
        <div><dt>Usable hosts</dt><dd>{size} − 2 = {size - 2}</dd></div>
      </dl>
      <p className="xp-note">
        Highlighted block: network <b className="mono">.{net}</b>, broadcast <b className="mono">.{net + size - 1}</b>.
        {blocks <= 8 && <> Networks start at {Array.from({ length: blocks }, (_, i) => `.${i * size}`).join(', ')}.</>}
      </p>
    </div>
  )
}

function VisualView({ v }: { v: Visual }) {
  switch (v.type) {
    case 'flow': return <Flow nodes={v.nodes} />
    case 'table': return <Table v={v} />
    case 'filter': return <Filter v={v} />
    case 'encode': return <Encode />
    case 'fragment': return <Fragment example={v.example} />
    case 'acrostic': return <Acrostic lines={v.lines} />
    case 'firewall': return <Firewall />
    case 'subnet': return <Subnet />
  }
}

export function Explainer({ x, meta }: { x: Explain; meta: [string, string][] }) {
  return (
    <section className="xp" aria-label="How this challenge works">
      <div className="xp-row">
        <h2 className="xp-k mono">The story</h2>
        <p className="xp-story">{x.story}</p>
      </div>
      <div className="xp-row">
        <h2 className="xp-k mono">Think of it like</h2>
        <p className="xp-like">{x.like}</p>
      </div>
      {x.visuals.map((v, i) => (
        <div className="xp-row" key={i}>
          <h2 className="xp-k mono">{v.title}</h2>
          <div className="xp-vis"><VisualView v={v} /></div>
        </div>
      ))}
      <div className="xp-row">
        <h2 className="xp-k mono">Your plan</h2>
        <ol className="plan">{x.plan.map((s, i) => <li key={i}><span className="plan-n mono">{i + 1}</span><span>{s}</span></li>)}</ol>
      </div>
      {x.words && (
        <div className="xp-row">
          <h2 className="xp-k mono">Words to know</h2>
          <dl className="words">{x.words.map(([k, d]) => <div key={k}><dt>{k}</dt><dd>{d}</dd></div>)}</dl>
        </div>
      )}
      <p className="xp-meta mono">{meta.map(([k, v]) => <span key={k}><span className="muted">{k}:</span> {v}</span>)}</p>
    </section>
  )
}
