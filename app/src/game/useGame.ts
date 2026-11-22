import { useCallback, useEffect, useState } from 'react'
import type { Challenge, FeedEvent, SaveState } from './types'
import { ALL, HINT_COST } from './catalog'

const KEY = 'ctg-v5'

function fillFlags(s: SaveState): SaveState {
  const flags = { ...s.flags }
  for (const c of ALL) if (c.gen && !flags[c.id]) flags[c.id] = c.gen()
  return { ...s, flags }
}
function fresh(): SaveState {
  return fillFlags({ done: [], hints: {}, flags: {} })
}
function load(): SaveState {
  try {
    const v = localStorage.getItem(KEY)
    if (v) return fillFlags({ ...fresh(), ...JSON.parse(v) })
  } catch {
    /* storage unavailable */
  }
  return fresh()
}

export function useGame() {
  const [save, setSave] = useState<SaveState>(load)
  const [feed, setFeed] = useState<FeedEvent[]>([])

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(save)) } catch { /* ignore */ }
  }, [save])

  const log = useCallback((kind: FeedEvent['kind'], text: string) => {
    setFeed(f => [{ t: Date.now(), kind, text }, ...f].slice(0, 60))
  }, [])

  const secretOf = (c: Challenge) => (c.gen ? save.flags[c.id] : c.secret) ?? ''
  const expected = (c: Challenge) => c.answer ?? secretOf(c)
  const isDone = (id: string) => save.done.includes(id)
  const hintsUsed = (id: string) => save.hints[id] || 0
  const points = (c: Challenge) => Math.max(c.pts * 0.25, c.pts - HINT_COST[c.pts] * hintsUsed(c.id))
  const score = save.done.reduce((a, id) => { const c = ALL.find(x => x.id === id); return a + (c ? points(c) : 0) }, 0)

  const spendHint = (c: Challenge) => {
    if (isDone(c.id)) return
    setSave(s => ({ ...s, hints: { ...s.hints, [c.id]: (s.hints[c.id] || 0) + 1 } }))
  }
  const capture = (c: Challenge) => {
    setSave(s => (s.done.includes(c.id) ? s : { ...s, done: [...s.done, c.id] }))
  }
  const reset = () => { setSave(fresh()); setFeed([]) }

  return { save, feed, log, secretOf, expected, isDone, hintsUsed, points, score, spendHint, capture, reset }
}
export type Game = ReturnType<typeof useGame>
