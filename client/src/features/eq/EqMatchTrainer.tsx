import { useCallback, useEffect, useMemo, useState } from 'react'
import { Knob } from './components/Knob'
import { useEqEngine } from './hooks/useEqEngine'
import type { FilterSettings, FilterShape } from './types'
import './eqMatch.css'

type EqMatchTrainerProps = {
  audioUrl: string
}
const MIN_FREQ = 20
const MAX_FREQ = 20000
const MIN_GAIN = -12
const MAX_GAIN = 12
const FILTER_TYPES: FilterShape[] = ['peaking', 'highpass', 'lowpass']

const filterLabels: Record<FilterShape, string> = {
  peaking: 'Bell',
  highpass: 'High-pass',
  lowpass: 'Low-pass',
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const ratioToFrequency = (ratio: number) => MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, ratio)

const formatHz = (value: number) => {
  if (value < 1000) return `${Math.round(value)} Hz`
  if (value < 10000) return `${(value / 1000).toFixed(2)} kHz`
  return `${(value / 1000).toFixed(1)} kHz`
}

const freqKnobMin = Math.log10(MIN_FREQ)
const freqKnobMax = Math.log10(MAX_FREQ)

const randomizeFilter = (): FilterSettings => {
  const type = FILTER_TYPES[Math.floor(Math.random() * FILTER_TYPES.length)]
  const frequency = ratioToFrequency(Math.random())
  const q = clamp(Number((Math.random() * 4 + 0.4).toFixed(2)), 0.4, 5)

  if (type === 'peaking') {
    const gain = Number((Math.random() * 18 - 9).toFixed(1))
    return { type, frequency, gain, q }
  }

  return { type, frequency, gain: 0, q }
}

const approximateGainResponse = (settings: FilterSettings, frequency: number) => {
  if (settings.type === 'peaking') {
    const width = Math.max(0.15, 1 / (settings.q * 1.8))
    const distance = Math.abs(Math.log(frequency / settings.frequency) / Math.log(2))
    const gaussian = Math.exp(-Math.pow(distance / width, 2))
    return gaussian * settings.gain
  }

  if (settings.type === 'highpass') {
    const ratio = frequency / settings.frequency
    const normalized = 1 - 1 / (1 + Math.pow(ratio, Math.max(1.2, settings.q)))
    return normalized * 12 - 12
  }

  const ratio = settings.frequency / frequency
  const normalized = 1 / (1 + Math.pow(ratio, Math.max(1.2, settings.q)))
  return -normalized * 12
}

const buildCurve = (settings: FilterSettings) => {
  const steps = 150
  const coords: string[] = []
  for (let i = 0; i <= steps; i += 1) {
    const ratio = i / steps
    const freq = ratioToFrequency(ratio)
    const gain = clamp(approximateGainResponse(settings, freq), MIN_GAIN, MAX_GAIN)
    const x = ratio * 100
    const y = ((MAX_GAIN - gain) / (MAX_GAIN - MIN_GAIN)) * 100
    coords.push(`${x},${y}`)
  }
  return coords.join(' ')
}

const computeMatchScore = (target: FilterSettings, user: FilterSettings) => {
  let penalty = 0

  if (target.type !== user.type) penalty += 25

  const freqError = Math.abs(Math.log(target.frequency / user.frequency) / Math.log(2))
  penalty += freqError * 35

  const qError = Math.abs(target.q - user.q)
  penalty += qError * 6

  if (target.type === 'peaking') {
    penalty += Math.abs(target.gain - user.gain) * 1.8
  }

  return Math.max(0, Math.round(100 - penalty))
}

export const EqMatchTrainer = ({ audioUrl }: EqMatchTrainerProps) => {
  const [targetFilter, setTargetFilter] = useState<FilterSettings>(() => randomizeFilter())
  const [userFilter, setUserFilter] = useState<FilterSettings>({
    type: 'peaking',
    frequency: 1200,
    gain: 0,
    q: 1.2,
  })
  const [showTarget, setShowTarget] = useState(false)
  const [showScore, setShowScore] = useState(false)
  const [isSuccessVisible, setIsSuccessVisible] = useState(false)

  const { status, isPlaying, isLooping, monitorMode, monitor, setLooping, restartPlayback, stopPlayback } =
    useEqEngine(audioUrl, targetFilter, userFilter)

  const targetCurve = useMemo(() => buildCurve(targetFilter), [targetFilter])
  const userCurve = useMemo(() => buildCurve(userFilter), [userFilter])
  const score = useMemo(() => computeMatchScore(targetFilter, userFilter), [targetFilter, userFilter])
  const targetVisible = showTarget || isSuccessVisible

  useEffect(() => {
    if (score >= 90 && !isSuccessVisible) {
      setIsSuccessVisible(true)
      setShowTarget(true)
      setShowScore(true)
    }
  }, [isSuccessVisible, score])

  const handleSpectrumClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratioX = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const ratioY = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    const frequency = ratioToFrequency(ratioX)
    const gain = MAX_GAIN - ratioY * (MAX_GAIN - MIN_GAIN)

    setUserFilter((prev) => ({ ...prev, frequency, gain: prev.type === 'peaking' ? gain : prev.gain }))
  }, [])

  const handleTypeChange = (type: FilterShape) => {
    setUserFilter((prev) => ({ ...prev, type }))
  }

  const handleRandomize = () => {
    stopPlayback()
    setShowTarget(false)
    setShowScore(false)
    setIsSuccessVisible(false)
    setTargetFilter(randomizeFilter())
    if (isPlaying) {
      restartPlayback()
    }
  }

  const statusLabel = {
    loading: 'Loading reference audio…',
    ready: 'Ready to play the challenge',
    error: 'Audio failed to load. Please refresh.',
  }[status]

  return (
    <div className="eq-match">
      <div className="eq-match__working-area">
        <div className="eq-match__spectrum-card">
          <div className="eq-match__spectrum" onClick={handleSpectrumClick}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="spectrumBg" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#111827" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#020617" stopOpacity="0.85" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="100" height="100" fill="url(#spectrumBg)" rx="6" />
              {targetVisible && <polyline className="eq-curve eq-curve--target" points={targetCurve} />}
              <polyline className="eq-curve eq-curve--user" points={userCurve} />
            </svg>
            <div className="eq-match__spectrum-overlay">
              <span>20 Hz</span>
              <span>200 Hz</span>
              <span>2 kHz</span>
              <span>20 kHz</span>
            </div>
          </div>
          <div className="eq-match__legend">
            <div className="eq-match__legend-item">
              <span className="eq-match__legend-swatch eq-match__legend-swatch--target" />
              {targetVisible ? 'Target curve (pink)' : 'Target hidden · tap “Show Target” or hit 90%+'}
            </div>
            <div className="eq-match__legend-item">
              <span className="eq-match__legend-swatch eq-match__legend-swatch--user" /> Your EQ (cyan dashed)
            </div>
          </div>
          <div className="eq-match__hint">
            Pink appears once you reveal the target (or after a successful match). Cyan always shows your current filter.
            Click the spectrum to drop/drag your bell and refine with the knobs.
          </div>
        </div>

        <div className="eq-match__controls-card">
          <div className="eq-match__filter-types">
            {FILTER_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={`eq-match__pill ${userFilter.type === type ? 'is-active' : ''}`}
              >
                {filterLabels[type]}
              </button>
            ))}
          </div>

          <div className="eq-match__knobs">
            <Knob
              label="Frequency"
              min={freqKnobMin}
              max={freqKnobMax}
              value={Math.log10(userFilter.frequency)}
              step={0.01}
              formatValue={(val) => formatHz(Math.pow(10, val))}
              onChange={(val) =>
                setUserFilter((prev) => ({
                  ...prev,
                  frequency: Math.pow(10, val),
                }))
              }
            />

            {userFilter.type === 'peaking' && (
              <Knob
                label="Gain"
                min={MIN_GAIN}
                max={MAX_GAIN}
                value={userFilter.gain}
                step={0.1}
                suffix=" dB"
                onChange={(val) => setUserFilter((prev) => ({ ...prev, gain: val }))}
              />
            )}

            <Knob
              label="Q"
              min={0.3}
              max={5}
              value={userFilter.q}
              step={0.05}
              onChange={(val) => setUserFilter((prev) => ({ ...prev, q: val }))}
            />
          </div>

          <div className="eq-match__monitor">
            <div className="eq-match__monitor-header">
              <p>Monitor feed</p>
              <span>{monitorMode === 'target' ? 'Target curve (pink)' : 'Your EQ (cyan)'}</span>
            </div>
            <div className="eq-match__monitor-buttons">
              <button
                type="button"
                className={monitorMode === 'target' ? 'is-active' : ''}
                disabled={status !== 'ready'}
                onClick={() => {
                  void monitor('target')
                }}
              >
                Target
              </button>
              <button
                type="button"
                className={monitorMode === 'user' ? 'is-active' : ''}
                disabled={status !== 'ready'}
                onClick={() => {
                  void monitor('user')
                }}
              >
                My EQ
              </button>
            </div>
          </div>

          <div className="eq-match__transport">
            <button type="button" onClick={restartPlayback} disabled={status !== 'ready'}>
              {isPlaying ? 'Restart playback' : 'Start playback'}
            </button>
            <button
              type="button"
              className={isLooping ? 'is-active' : ''}
              onClick={() => setLooping(!isLooping)}
            >
              Loop {isLooping ? 'on' : 'off'}
            </button>
            <button type="button" onClick={stopPlayback}>
              Stop
            </button>
          </div>
          <div className="eq-match__status">{statusLabel}</div>
        </div>
      </div>

      <aside className="eq-match__sidebar">
        <div className={`eq-match__score-card ${showScore ? '' : 'is-hidden'}`}>
          <p>Match Score</p>
          <strong>{showScore ? `${score}%` : '???'}</strong>
          <span>
            {showScore
              ? isPlaying
                ? 'Listening… switch feeds on the fly.'
                : 'Adjust until you hit 90%+'
              : 'Score hidden. Enable easy mode to see your %.'}
          </span>
        </div>

        <div className="eq-match__actions">
          <button type="button" onClick={handleRandomize}>
            Randomize challenge
          </button>
          <button type="button" onClick={() => setShowTarget(true)} disabled={targetVisible}>
            Show target
          </button>
          <button type="button" onClick={() => setShowScore((prev) => !prev)}>
            {showScore ? 'Hide score' : 'Show score (easy mode)'}
          </button>
        </div>

        {targetVisible && (
          <div className="eq-match__answer">
            <h4>Current Target</h4>
            <ul>
              <li>Shape: {filterLabels[targetFilter.type]}</li>
              <li>Frequency: {formatHz(targetFilter.frequency)}</li>
              {targetFilter.type === 'peaking' && <li>Gain: {targetFilter.gain.toFixed(1)} dB</li>}
              <li>Q: {targetFilter.q.toFixed(2)}</li>
            </ul>
          </div>
        )}

        {isSuccessVisible && (
          <div className="eq-match__success">
            <h4>Great ears!</h4>
            <p>You nailed the curve with a {score}% match. Preview the pink line to analyze what you heard.</p>
            <div className="eq-match__success-actions">
              <button type="button" onClick={() => setIsSuccessVisible(false)}>
                Keep tweaking
              </button>
              <button type="button" onClick={handleRandomize}>
                New challenge
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

export default EqMatchTrainer
