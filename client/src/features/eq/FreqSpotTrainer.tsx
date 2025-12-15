import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { useEqEngine } from './hooks/useEqEngine'
import type { FilterSettings } from './types'
import './freqSpot.css'

const MIN_FREQ = 20
const MAX_FREQ = 20000
const BASE_WINDOW_OCT = 0.25 // ± quarter octave hard window
const EASY_WINDOW_MULTIPLIER = 2

type FreqSpotTrainerProps = {
  audioUrl: string
}

const ratioToFrequency = (ratio: number) => MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, ratio)
const frequencyToRatio = (frequency: number) =>
  Math.min(Math.max(Math.log(frequency / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ), 0), 1)

const formatHz = (value: number) => {
  if (value < 1000) return `${Math.round(value)} Hz`
  if (value < 10000) return `${(value / 1000).toFixed(2)} kHz`
  return `${(value / 1000).toFixed(1)} kHz`
}

const randomBoostFilter = (): FilterSettings => ({
  type: 'peaking',
  frequency: ratioToFrequency(Math.random()),
  gain: Number((Math.random() * 6 + 4).toFixed(1)),
  q: Number((Math.random() * 1.8 + 0.7).toFixed(2)),
})

const NEUTRAL_FILTER: FilterSettings = {
  type: 'peaking',
  frequency: 1000,
  gain: 0,
  q: 1,
}

export const FreqSpotTrainer = ({ audioUrl }: FreqSpotTrainerProps) => {
  const [targetFilter, setTargetFilter] = useState<FilterSettings>(() => randomBoostFilter())
  const [guessFrequency, setGuessFrequency] = useState<number | null>(null)
  const [result, setResult] = useState<'pending' | 'hit' | 'miss'>('pending')
  const [isSuccessVisible, setIsSuccessVisible] = useState(false)
  const [hardMode, setHardMode] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [hasAutoStarted, setHasAutoStarted] = useState(false)

  const windowOct = hardMode ? BASE_WINDOW_OCT : BASE_WINDOW_OCT * EASY_WINDOW_MULTIPLIER
  const windowPercent = useMemo(() => (Math.pow(2, windowOct) - 1) * 100, [windowOct])

  const { status, isPlaying, isLooping, monitorMode, monitor, setLooping, restartPlayback, stopPlayback } =
    useEqEngine(audioUrl, targetFilter, NEUTRAL_FILTER)

  const targetRatio = useMemo(() => frequencyToRatio(targetFilter.frequency), [targetFilter])

  const guessWindow = useMemo(() => {
    if (guessFrequency === null) return null
    const lowerFreq = guessFrequency / Math.pow(2, windowOct)
    const upperFreq = guessFrequency * Math.pow(2, windowOct)
    return {
      lower: frequencyToRatio(lowerFreq),
      upper: frequencyToRatio(upperFreq),
    }
  }, [guessFrequency, windowOct])

  useEffect(() => {
    setHasAutoStarted(false)
  }, [audioUrl])

  useEffect(() => {
    if (status === 'ready' && !hasAutoStarted) {
      setHasAutoStarted(true)
      restartPlayback()
    }
  }, [hasAutoStarted, restartPlayback, status])

  const handleSpectrumClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const ratioX = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
      const frequency = ratioToFrequency(ratioX)
      const octDiff = Math.abs(Math.log2(frequency / targetFilter.frequency))
      const hit = octDiff <= windowOct

      setAttempts((prev) => prev + 1)
      setGuessFrequency(frequency)
      setResult(hit ? 'hit' : 'miss')
      setIsSuccessVisible(hit)
    },
    [targetFilter, windowOct],
  )

  const randomizeBoost = () => {
    stopPlayback()
    setTargetFilter(randomBoostFilter())
    setGuessFrequency(null)
    setResult('pending')
    setIsSuccessVisible(false)
    setAttempts(0)
    setHasAutoStarted(false)
  }

  const statusLabel = {
    loading: 'Loading reference audio…',
    ready: 'Listen for the boosted band and click it.',
    error: 'Audio failed to load. Please refresh.',
  }[status]

  return (
    <div className="freq-spot">
      <div className="freq-spot__main">
        <div className="freq-spot__spectrum-card">
          <header>
            <h3>Boost Hunt</h3>
            <p>Switch between original and boosted playback, then click where you think the lift lives.</p>
          </header>
          <div className="freq-spot__spectrum" onClick={handleSpectrumClick}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="freqSpotBg" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#0f172a" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#020617" stopOpacity="0.85" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="100" height="100" fill="url(#freqSpotBg)" rx="10" />
              {guessWindow && (
                <rect
                  className="freq-spot__guess-window"
                  x={guessWindow.lower * 100}
                  y={0}
                  width={(guessWindow.upper - guessWindow.lower) * 100}
                  height={100}
                />
              )}
              {isSuccessVisible && (
                <line className="freq-spot__target-line" x1={targetRatio * 100} x2={targetRatio * 100} y1={0} y2={100} />
              )}
            </svg>
            <div className="freq-spot__spectrum-overlay">
              <span>20 Hz</span>
              <span>200 Hz</span>
              <span>2 kHz</span>
              <span>20 kHz</span>
            </div>
          </div>
          <footer>
            <p>
              Hit window: ±{windowOct.toFixed(2)} oct (~±{windowPercent.toFixed(0)}%). Toggle hard mode to halve it. We
              shade the zone you claimed; nail it to reveal the exact boost.
            </p>
          </footer>
        </div>

        <div className="freq-spot__monitor-card">
          <div className="eq-match__monitor">
            <div className="eq-match__monitor-header">
              <p>Monitor feed</p>
              <span>{monitorMode === 'target' ? 'Boosted signal' : 'Original reference'}</span>
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
                Boosted
              </button>
              <button
                type="button"
                className={monitorMode === 'user' ? 'is-active' : ''}
                disabled={status !== 'ready'}
                onClick={() => {
                  void monitor('user')
                }}
              >
                Original
              </button>
            </div>
          </div>

          <div className="eq-match__transport freq-spot__transport">
            <div className="eq-match__transport-start">
              <button type="button" onClick={restartPlayback} disabled={status !== 'ready'}>
                {isPlaying ? 'Restart playback' : 'Start playback'}
              </button>
              <label className="loop-toggle">
                <input type="checkbox" checked={isLooping} onChange={(e) => setLooping(e.target.checked)} />
                Loop
              </label>
            </div>
            <button type="button" onClick={stopPlayback}>
              Stop
            </button>
          </div>
          <div className="freq-spot__status">{statusLabel}</div>
        </div>
      </div>

      <aside className="freq-spot__sidebar">
        <div className="freq-spot__info">
          <h4>Guess feedback</h4>
          {guessFrequency ? (
            <>
              <p className={`freq-spot__result freq-spot__result--${result}`}>
                {result === 'hit' ? 'Hit! 🎯' : 'Missed window'}
              </p>
              <p>
                Your guess: <strong>{formatHz(guessFrequency)}</strong>
              </p>
              {result === 'hit' && (
                <p className="freq-spot__attempts">
                  Attempts: <strong>{attempts}</strong>
                </p>
              )}
              {result === 'miss' && <p>Re-listen and try again. We only reveal the boost on a hit.</p>}
            </>
          ) : (
            <p>Click the spectrum after listening to set your guess. You can keep listening while you search.</p>
          )}
        </div>

        <div className="freq-spot__actions">
          <button type="button" onClick={randomizeBoost}>
            New boost
          </button>
          <button
            type="button"
            className={hardMode ? 'is-active' : ''}
            onClick={() => setHardMode((prev) => !prev)}
          >
            {hardMode ? 'Hard mode on (tight window)' : 'Hard mode off (wide window)'}
          </button>
        </div>

        {isSuccessVisible && (
          <div className="eq-match__success">
            <h4>Great ears!</h4>
            <p>
              The boost lives at <strong>{formatHz(targetFilter.frequency)}</strong> with +
              {targetFilter.gain.toFixed(1)} dB. You found it in {attempts} attempt{attempts === 1 ? '' : 's'}.
              Study the highlight and move on to the next round.
            </p>
            <div className="eq-match__success-actions">
              <button type="button" onClick={() => setIsSuccessVisible(false)}>
                Keep listening
              </button>
              <button type="button" onClick={randomizeBoost}>
                Next challenge
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

export default FreqSpotTrainer
