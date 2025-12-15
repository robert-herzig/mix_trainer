import { useMemo, useState } from 'react'
import { EqMatchTrainer } from './features/eq/EqMatchTrainer'
import { FreqSpotTrainer } from './features/eq/FreqSpotTrainer'
import { CompressionTrainer } from './features/compression/CompressionTrainer'
import { DbDeltaTrainer } from './features/loudness/DbDeltaTrainer'
import './App.css'

type TabId = 'eq' | 'freqspot' | 'compression' | 'loudness'

const audioOptions = [
  { value: '/audio/reference.wav', label: 'Rock guitar riff' },
  { value: '/audio/growl.wav', label: 'Growl vocal loop' },
  { value: '/audio/drumbeat.wav', label: 'Drum beat loop' },
]

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('eq')
  const [audioSource, setAudioSource] = useState<string>(audioOptions[0].value)

  const tabList = useMemo(
    () => [
      { id: 'eq' as TabId, label: 'EQ Match' },
      { id: 'freqspot' as TabId, label: 'Freq Spot' },
      { id: 'compression' as TabId, label: 'Compression' },
      { id: 'loudness' as TabId, label: 'dB Delta' },
    ],
    [],
  )

  const renderPanel = () => {
    switch (activeTab) {
      case 'eq':
        return <EqMatchTrainer audioUrl={audioSource} />
      case 'freqspot':
        return <FreqSpotTrainer audioUrl={audioSource} />
      case 'compression':
        return <CompressionTrainer audioUrl={audioSource} />
      case 'loudness':
        return <DbDeltaTrainer audioUrl={audioSource} />
      default:
        return null
    }
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

      <div className="app-audio-selector">
        <label htmlFor="audioSelect">Reference audio</label>
        <select
          id="audioSelect"
          value={audioSource}
          onChange={(event) => setAudioSource(event.target.value)}
        >
          {audioOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <section className="app-panel" aria-live="polite">
        {renderPanel()}
      </section>
    </div>
  )
}

export default App
