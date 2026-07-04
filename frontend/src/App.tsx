import { useEffect, useRef } from 'react'
import { AboutOverlay } from './components/chrome/AboutOverlay'
import { TopBar } from './components/chrome/TopBar'
import { WrapUpOverlay } from './components/chrome/WrapUp'
import { AdminView } from './components/admin/AdminView'
import { MapView } from './components/map/MapView'
import { PatientSheet } from './components/sheet/PatientSheet'
import { TimeScrubber } from './components/scrubber/TimeScrubber'
import { escapeStep, useStore } from './store'
import { PRESETS, SIM_END_MIN } from './sim/time'
import './app.css'

/** Advances the sim clock while playing. */
function usePlayClock() {
  const playing = useStore((s) => s.playing)
  const raf = useRef<number>(0)
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const { simMin, speed, setSimMin, setPlaying } = useStore.getState()
      const next = simMin + speed * dt
      setSimMin(next)
      if (next >= SIM_END_MIN) setPlaying(false)
      else raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing])
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const s = useStore.getState()
      // while an overlay is open, only Escape acts on the app behind it
      if ((s.aboutOpen || s.wrapOpen) && e.key !== 'Escape') return
      switch (e.key) {
        case 'Escape':
          if (escapeStep()) e.preventDefault()
          break
        case 'f':
          if (s.view === 'doctor') s.cycleFloor()
          break
        case 'b':
          if (s.view === 'doctor') s.setStackOpen(!s.stackOpen)
          break
        case ' ':
          // Space on a focused control must activate the control, never hijack
          // it to drive the sim clock (keyboard-navigable is a deliverable)
          if ((e.target as HTMLElement)?.closest('button, a, [role="switch"], [tabindex]')) return
          e.preventDefault()
          s.setPlaying(!s.playing)
          break
        case 'ArrowLeft':
          e.preventDefault()
          s.nudgeSim(e.shiftKey ? -30 : -5)
          break
        case 'ArrowRight':
          e.preventDefault()
          s.nudgeSim(e.shiftKey ? 30 : 5)
          break
        case 'v':
          s.setView(s.view === 'doctor' ? 'admin' : 'doctor')
          break
        case '1':
        case '2':
        case '3':
        case '4': {
          // preset jumps are meaningless (and jarring) while the scrubber is
          // scoped to one patient's journey — the presets are hidden then too
          if (s.selectedId && s.view === 'doctor') break
          const p = PRESETS[Number(e.key) - 1]
          if (p) s.setSimMin(p.simMin)
          break
        }
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  usePlayClock()
  useKeyboard()
  const view = useStore((s) => s.view)

  return (
    <div className="app">
      <TopBar />
      <main className="app__main">
        {view === 'doctor' ? <MapView /> : <AdminView />}
        <PatientSheet />
      </main>
      <TimeScrubber />
      <AboutOverlay />
      <WrapUpOverlay />
    </div>
  )
}
