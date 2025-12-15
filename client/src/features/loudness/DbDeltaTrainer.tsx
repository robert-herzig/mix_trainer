import { useEffect, useMemo, useState } from 'react'
import { useGainCompareEngine } from './hooks/useGainCompareEngine'
import './loudness.css'

const MIN_DB = 0.5
const MAX_DB = 10
const MIN_SEPARATION = 1
const OPTION_COUNT = 4

const formatDb = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`

const randomDelta = () => {
  const magnitude = Number((Math.random() * (MAX_DB - MIN_DB) + MIN_DB).toFixed(1))
  const sign = Math.random() < 0.5 ? -1 : 1
  return sign * magnitude
}

const randomOption = () => {
  const magnitude = Number((Math.random() * (MAX_DB - MIN_DB) + MIN_DB).toFixed(1))
  const sign = Math.random() < 0.5 ? -1 : 1
  return sign * magnitude
}

const generateOptions = (actual: number) => {
  const options = new Set<number>([actual])
  while (options.size < OPTION_COUNT) {
    const candidate = randomOption()
    const isFarEnough = [...options].every((value) => Math.abs(value - candidate) >= MIN_SEPARATION)
    if (isFarEnough) {
      options.add(candidate)
    }
  }
  const array = Array.from(options)
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

const buildChallenge = () => {
  const delta = randomDelta()
  return {
    delta,
    options: generateOptions(delta),
  }
}

type DbDeltaTrainerProps = {
  audioUrl: string
}

export const DbDeltaTrainer = ({ audioUrl }: DbDeltaTrainerProps) => {
  const [challenge, setChallenge] = useState(buildChallenge)
  const [selected, setSelected] = useState<number | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [isSuccessVisible, setIsSuccessVisible] = useState(false)
  const [hasAutoStarted, setHasAutoStarted] = useState(false)

  const isCorrect = selected === challenge.delta
  const hasAnswered = selected !== null

  const {
    status,
    isPlaying,
    isLooping,
    monitorMode,
    monitor,
    setLooping,
    restartPlayback,
    stopPlayback,
  } = useGainCompareEngine(audioUrl, challenge.delta)

  const statusLabel = useMemo(() => {
    if (status === 'loading') return 'Loading reference audio…'
    if (status === 'error') return 'Audio failed to load. Please refresh.'
    return 'Toggle between reference and gain-changed playback, then guess the dB delta.'
  }, [status])

  useEffect(() => {
    setHasAutoStarted(false)
  }, [audioUrl, challenge.delta])

  useEffect(() => {
    if (status === 'ready' && !hasAutoStarted) {
      setHasAutoStarted(true)
      restartPlayback()
    }
  }, [hasAutoStarted, restartPlayback, status])

  const handleSelect = (value: number) => {
    if (status !== 'ready') return
    setSelected(value)
    setAttempts((prev) => prev + 1)
    setIsSuccessVisible(value === challenge.delta)
  }

  const handleNewChallenge = () => {
    stopPlayback()
    setChallenge(buildChallenge())
    setSelected(null)
    setAttempts(0)
    setIsSuccessVisible(false)
    setHasAutoStarted(false)
  }

  return (
    <div className="db-trainer">
      <div className="db-trainer__main">
        <div className="db-trainer__card">
          <header>
            <h3>ΔdB Estimator</h3>
            <p>One of these answers matches the hidden gain change (between ±0.5 and ±10 dB). Can you tell which?</p>
          </header>

          <div className="db-trainer__options" role="group" aria-label="Gain difference options">
            {challenge.options.map((option) => (
              <button
                key={option}
                type="button"
                className={`db-trainer__option ${selected === option ? 'is-selected' : ''} ${
                  isSuccessVisible && option === challenge.delta ? 'is-correct' : ''
                } ${hasAnswered && option === selected && option !== challenge.delta ? 'is-incorrect' : ''}`}
                onClick={() => handleSelect(option)}
                disabled={status !== 'ready'}
              >
                {formatDb(option)}
              </button>
            ))}
          </div>

          <div className="db-trainer__feedback">
            {hasAnswered ? (
              <p className={isCorrect ? 'is-correct' : 'is-incorrect'}>
                {isCorrect
                  ? `Correct! The mix is ${formatDb(challenge.delta)} compared to reference.`
                  : 'Nope. Listen again, switch feeds, and try another answer.'}
              </p>
            ) : (
              <p>Select an answer to lock in your guess.</p>
            )}
            <p>Attempts: {attempts}</p>
          </div>
        </div>

        <div className="db-trainer__monitor-card">
          <div className="eq-match__monitor">
            <div className="eq-match__monitor-header">
              <p>Monitor feed</p>
              <span>Processed vs. reference</span>
            </div>
            <div className="eq-match__monitor-buttons">
              <button
                type="button"
                className={monitorMode === 'processed' ? 'is-active' : ''}
                disabled={status !== 'ready'}
                onClick={() => {
                  void monitor('processed')
                }}
              >
                Processed
              </button>
              <button
                type="button"
                className={monitorMode === 'reference' ? 'is-active' : ''}
                disabled={status !== 'ready'}
                onClick={() => {
                  void monitor('reference')
                }}
              >
                Reference
              </button>
            </div>
          </div>

          <div className="eq-match__transport db-trainer__transport">
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
          <div className="db-trainer__status">{statusLabel}</div>
        </div>
      </div>

      <aside className="db-trainer__sidebar">
        <button className="db-trainer__new" type="button" onClick={handleNewChallenge}>
          New gain change
        </button>

        {isSuccessVisible && (
          <div className="eq-match__success">
            <h4>Level champ!</h4>
            <p>
              You spotted {formatDb(challenge.delta)} in {attempts} attempt{attempts === 1 ? '' : 's'}. Keep training with a new
              sample or swap stems from the dropdown.
            </p>
            <div className="eq-match__success-actions">
              <button type="button" onClick={() => setIsSuccessVisible(false)}>
                Keep listening
              </button>
              <button type="button" onClick={handleNewChallenge}>
                Next challenge
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

export default DbDeltaTrainer
