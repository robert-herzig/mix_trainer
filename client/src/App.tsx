import { useMemo, useState } from 'react'
import { EqMatchTrainer } from './features/eq/EqMatchTrainer'
import './App.css'

type TabId = 'eq' | 'compression' | 'loudness'

const placeholderCopy: Record<TabId, { title: string; body: string }> = {
  eq: {
    title: 'EQ Match Lab',
    body: 'Shape filters by ear, match the hidden curve, and learn faster than in static quiz apps.',
  },
  compression: {
    title: 'Compression Gym (soon)',
    body: 'Dial in attack, release, and ratio on a hidden setting. We will record how fast you land at the right feel.',
  },
  loudness: {
    title: 'ΔdB Estimator (soon)',
    body: 'Test your ability to notice subtle gain changes with calibrated level jumps and scoring.',
  },
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('eq')

  const tabList = useMemo(
    () => [
      { id: 'eq' as TabId, label: 'EQ Match' },
      { id: 'compression' as TabId, label: 'Compression' },
      { id: 'loudness' as TabId, label: 'dB Delta' },
    ],
    [],
  )

  const renderPanel = () => {
    if (activeTab === 'eq') return <EqMatchTrainer />

    const copy = placeholderCopy[activeTab]
    return (
      <div className="placeholder">
        <h3>{copy.title}</h3>
        <p>{copy.body}</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-hero">
        <div>
          <p className="eyebrow">Mix Trainer</p>
          <h1>Train your mastering instincts by ear</h1>
          <p className="lede">
            Inspired by SoundGym sessions but tuned for daily deep practice. Start with EQ curve matching and
            extend into compression timing and loudness perception.
          </p>
        </div>
        <div className="hero-chip">
          <span>v0.1 prototype</span>
          <span>React · Web Audio</span>
        </div>
      </header>

      <nav className="app-tabs" aria-label="Training modules">
        {tabList.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === activeTab ? 'is-active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="app-panel" aria-live="polite">
        {renderPanel()}
      </section>
    </div>
  )
}

export default App
