import { useEffect, useRef, useState } from 'react'
import type { Shell } from '../game/shells'
import { Led } from './bits'

interface Line { kind: 'in' | 'out'; text: string }

/** A terminal with history, a blinking block cursor, and click-anywhere focus. */
export function Terminal({ shell, onCommand, label, meta }: { shell: Shell; onCommand?: (cmd: string, out: string) => void; label: string; meta?: string }) {
  const [lines, setLines] = useState<Line[]>(() => [{ kind: 'out', text: shell.banner }])
  const [value, setValue] = useState('')
  const [, force] = useState(0)
  const hist = useRef<string[]>([])
  const hi = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }) }, [lines])

  const run = () => {
    const cmd = value
    const prompt = shell.prompt()
    setValue('')
    if (!cmd.trim()) { setLines(l => [...l, { kind: 'in', text: prompt }]); return }
    hist.current.push(cmd)
    hi.current = hist.current.length
    const out = shell.exec(cmd.trim())
    if (out === '\f') { setLines([]); force(n => n + 1); return }
    setLines(l => [...l, { kind: 'in', text: prompt + cmd }, ...(out ? [{ kind: 'out' as const, text: out }] : [])])
    onCommand?.(cmd.trim(), out)
  }

  return (
    <div className="term" onClick={() => input.current?.focus()}>
      <div className="term-bar"><Led state="active" /><span className="term-title">{label}</span>{meta && <span className="term-meta">{meta}</span>}</div>
      <div className="term-body" ref={scroller} aria-live="polite">
        {lines.map((l, i) => l.kind === 'in'
          ? <div key={i} className="tl tl-in">{l.text}</div>
          : <div key={i} className="tl">{l.text.split('\n').map((t, j) => /^\(.*\)$/.test(t) ? <span key={j} className="tl-note">{t}</span> : <span key={j} className="tl-ln">{t || ' '}</span>)}</div>)}
        <label className="tl tl-live">
          <span className="tp">{shell.prompt()}</span>
          <span className="tv">{value}</span>
          <span className="cursor" aria-hidden="true" />
          <input
            ref={input}
            value={value}
            aria-label={`${label} command`}
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); run() }
              else if (e.key === 'ArrowUp') { e.preventDefault(); if (hi.current > 0) { hi.current--; setValue(hist.current[hi.current]) } }
              else if (e.key === 'ArrowDown') { e.preventDefault(); if (hi.current < hist.current.length - 1) { hi.current++; setValue(hist.current[hi.current]) } else { hi.current = hist.current.length; setValue('') } }
              else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setLines([]) }
            }}
          />
        </label>
      </div>
    </div>
  )
}
