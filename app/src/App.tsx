import { useCallback, useState } from 'react'
import type { Challenge } from './game/types'
import { byId } from './game/catalog'
import { useGame } from './game/useGame'
import { Board, Boot, CaptureOverlay, ChallengeView, Decoder, Footer, Guide, StatusBar } from './components/views'

const BOOTED = 'ctg-booted'

export default function App() {
  const g = useGame()
  const [cur, setCur] = useState<string | null>(null)
  const [captured, setCaptured] = useState<Challenge | null>(null)
  const [fixedReq, setFixedReq] = useState(0)
  const [decoder, setDecoder] = useState(false)
  const [guide, setGuide] = useState(false)
  const [booting, setBooting] = useState(() => {
    try { return !sessionStorage.getItem(BOOTED) } catch { return false }
  })

  const endBoot = useCallback(() => {
    try { sessionStorage.setItem(BOOTED, '1') } catch { /* ignore */ }
    setBooting(false)
  }, [])

  const open = (id: string) => { setCur(id); setFixedReq(0); window.scrollTo(0, 0) }
  const board = () => { setCur(null); setCaptured(null); window.scrollTo(0, 0) }
  const c = byId(cur)

  const onCaptured = (ch: Challenge) => {
    const first = !g.isDone(ch.id)
    g.capture(ch)
    if (first) g.log('capture', `${ch.name} +${g.points(ch)}`)
    setCaptured(ch)
  }

  return (
    <>
      {booting && <Boot onDone={endBoot} />}
      <a className="skip" href="#main">Skip to content</a>
      <StatusBar g={g} onBoard={board} onDecoder={() => setDecoder(true)} onGuide={() => setGuide(true)} />
      {c ? (
        <ChallengeView key={`op-${c.id}`} g={g} c={c} open={open} fixedReq={fixedReq} onCaptured={onCaptured} />
      ) : (
        <Board g={g} open={open} />
      )}
      {c && (
        <div className="reset-row">
          <button type="button" className="linkish" onClick={() => { if (confirm('Start over? This clears your flags and score.')) { g.reset(); board() } }}>Start over</button>
        </div>
      )}
      <Footer />
      {captured && (
        <CaptureOverlay
          key={`cap-${captured.id}`}
          g={g}
          c={captured}
          onBoard={board}
          onStay={() => setCaptured(null)}
          onFixed={() => { setCaptured(null); setFixedReq(n => n + 1) }}
        />
      )}
      <Decoder open={decoder} onClose={() => setDecoder(false)} />
      <Guide open={guide} onClose={() => setGuide(false)} />
    </>
  )
}
