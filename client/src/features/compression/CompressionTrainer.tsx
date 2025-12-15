import { useEffect, useMemo, useState } from 'react'
import { Knob } from '../eq/components/Knob'
import { useCompressorEngine } from './hooks/useCompressorEngine'
import type { CompressionSettings } from './types'
import './compression.css'

const INPUT_MIN = -60
const INPUT_MAX = 0
const SUCCESS_THRESHOLD = 95

const defaultUserSettings: CompressionSettings = {
  threshold: -24,
  ratio: 4,
  attack: 20,
  release: 220,
  makeup: 0,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const randomCompressionSettings = (): CompressionSettings => ({
  threshold: Number((-48 + Math.random() * 28).toFixed(1)), // -48 to -20 dB
  ratio: Number((1.5 + Math.random() * 6.5).toFixed(2)), // 1.5:1 to 8:1
  attack: Number((8 + Math.random() * 70).toFixed(1)), // 8 ms to 78 ms
  release: Number((80 + Math.random() * 650).toFixed(1)), // 80 ms to 730 ms
  makeup: Number((-3 + Math.random() * 9).toFixed(1)), // -3 to +6 dB
})

const formatMs = (value: number) => `${value.toFixed(0)} ms`
const formatRatio = (value: number) => `${value.toFixed(2)}:1`
const formatDb = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`

const getCompressedLevel = (inputDb: number, settings: CompressionSettings) => {
  if (inputDb <= settings.threshold) {
    return inputDb + settings.makeup
  }
  const delta = inputDb - settings.threshold
  const compressed = settings.threshold + delta / settings.ratio
  return compressed + settings.makeup
}

const buildCurve = (settings: CompressionSettings) => {
  const steps = 120
  const points: string[] = []
  for (let i = 0; i <= steps; i += 1) {
    const inputDb = INPUT_MIN + (i / steps) * (INPUT_MAX - INPUT_MIN)
    const outputDb = clamp(getCompressedLevel(inputDb, settings), INPUT_MIN, INPUT_MAX)
    const x = ((inputDb - INPUT_MIN) / (INPUT_MAX - INPUT_MIN)) * 100
    const y = 100 - ((outputDb - INPUT_MIN) / (INPUT_MAX - INPUT_MIN)) * 100
    points.push(`${x},${y}`)
  }
  return points.join(' ')
}

const computeCurveDrift = (target: CompressionSettings, user: CompressionSettings) => {
  const samples = 30
  let total = 0
  for (let i = 0; i <= samples; i += 1) {
    const inputDb = INPUT_MIN + (i / samples) * (INPUT_MAX - INPUT_MIN)
    const diff = Math.abs(getCompressedLevel(inputDb, target) - getCompressedLevel(inputDb, user))
    total += diff
  }
  return total / (samples + 1)
}

const computeMatchScore = (target: CompressionSettings, user: CompressionSettings) => {
  let penalty = 0
  penalty += Math.abs(target.threshold - user.threshold) * 1
  penalty += Math.abs(Math.log(target.ratio) - Math.log(user.ratio)) * 42
  penalty += Math.abs(Math.log(target.attack) - Math.log(user.attack)) * 18
  penalty += Math.abs(Math.log(target.release) - Math.log(user.release)) * 12
  penalty += Math.abs(target.makeup - user.makeup) * 1.2
  penalty += computeCurveDrift(target, user) * 1.1
  return Math.max(0, Math.round(100 - penalty))
}

type CompressionTrainerProps = {
  audioUrl: string
}

export const CompressionTrainer = ({ audioUrl }: CompressionTrainerProps) => {
  const [targetSettings, setTargetSettings] = useState<CompressionSettings>(() => randomCompressionSettings())
  const [userSettings, setUserSettings] = useState<CompressionSettings>(() => ({ ...defaultUserSettings }))
  const [showTargetDetails, setShowTargetDetails] = useState(false)
  const [showScore, setShowScore] = useState(false)
  const [isSuccessVisible, setIsSuccessVisible] = useState(false)

  const {
    status,
    isPlaying,
    isLooping,
    monitorMode,
    monitor,
    setLooping,
    restartPlayback,
    stopPlayback,
  } = useCompressorEngine(audioUrl, targetSettings, userSettings)

  const targetCurve = useMemo(() => buildCurve(targetSettings), [targetSettings])
  const userCurve = useMemo(() => buildCurve(userSettings), [userSettings])
  const score = useMemo(() => computeMatchScore(targetSettings, userSettings), [targetSettings, userSettings])

  useEffect(() => {
    if (score >= SUCCESS_THRESHOLD && !isSuccessVisible) {
      setIsSuccessVisible(true)
      setShowScore(true)
    }
  }, [isSuccessVisible, score])

  const handleRandomize = () => {
    setTargetSettings(randomCompressionSettings())
    setUserSettings({ ...defaultUserSettings })
    setShowTargetDetails(false)
    setShowScore(false)
    setIsSuccessVisible(false)
  }

  const statusLabel = useMemo(() => {
    if (status === 'loading') return 'Loading reference audio…'
    if (status === 'error') return 'Audio failed to load. Please refresh.'
    return 'Toggle between target and your chain to compare envelope/tone.'
  }, [status])

  return (
    <div className="comp-trainer">
      <div className="comp-trainer__main">
        <div className="comp-trainer__curve-card">
          <header>
            <h3>Compression curve match</h3>
            <p>Match the hidden envelope by ear. Pink shows the target GR curve, cyan is yours.</p>
          </header>
          <div className="comp-trainer__curve">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="compBg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#e5e7eb" stopOpacity="0.95" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="100" height="100" fill="url(#compBg)" rx="8" />
              <polyline className="comp-curve comp-curve--baseline" points="0,100 100,0" />
              <polyline className="comp-curve comp-curve--target" points={targetCurve} />
              <polyline className="comp-curve comp-curve--user" points={userCurve} />
            </svg>
            <div className="comp-trainer__axis">
              <span>{INPUT_MIN} dBFS</span>
              <span>0 dBFS</span>
            </div>
          </div>
          <div className="comp-trainer__legend">
            <div>
              <span className="comp-swatch comp-swatch--target" /> Target curve
            </div>
            <div>
              <span className="comp-swatch comp-swatch--user" /> Your curve
            </div>
            <div>
              <span className="comp-swatch comp-swatch--baseline" /> 1:1 reference
            </div>
          </div>
        </div>

        <div className="comp-trainer__controls">
          <div className="comp-trainer__knobs">
            <Knob
              label="Threshold"
              min={-60}
              max={0}
              step={0.5}
              value={userSettings.threshold}
              suffix=" dB"
              onChange={(value) => setUserSettings((prev) => ({ ...prev, threshold: value }))}
            />
            <Knob
              label="Ratio"
              min={1}
              max={12}
              step={0.05}
              value={userSettings.ratio}
              formatValue={formatRatio}
              onChange={(value) => setUserSettings((prev) => ({ ...prev, ratio: value }))}
            />
            <Knob
              label="Attack"
              min={1}
              max={120}
              step={1}
              value={userSettings.attack}
              formatValue={formatMs}
              onChange={(value) => setUserSettings((prev) => ({ ...prev, attack: value }))}
            />
            <Knob
              label="Release"
              min={40}
              max={1200}
              step={5}
              value={userSettings.release}
              formatValue={formatMs}
              onChange={(value) => setUserSettings((prev) => ({ ...prev, release: value }))}
            />
            <Knob
              label="Makeup"
              min={-12}
              max={12}
              step={0.1}
              value={userSettings.makeup}
              suffix=" dB"
              onChange={(value) => setUserSettings((prev) => ({ ...prev, makeup: value }))}
            />
          </div>

          <div className="eq-match__monitor">
            <div className="eq-match__monitor-header">
              <p>Monitor feed</p>
              <span>{monitorMode === 'target' ? 'Target chain' : 'Your chain'}</span>
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
                My chain
              </button>
            </div>
          </div>

          <div className="eq-match__transport">
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
          <div className="eq-match__status">{statusLabel}</div>
        </div>
      </div>

      <aside className="comp-trainer__sidebar">
        <div className="comp-trainer__score">
          <p>Match accuracy</p>
          <strong>{showScore ? `${score}%` : '???'}</strong>
          <span>
            {showScore
              ? score >= SUCCESS_THRESHOLD
                ? 'Challenge cleared — queue the next one.'
                : 'Keep refining until you cross 95%.'
              : 'Score hidden. Toggle easy mode to view live accuracy.'}
          </span>
        </div>

        <div className="comp-trainer__actions">
          <button type="button" onClick={handleRandomize}>
            Randomize challenge
          </button>
          <button type="button" onClick={() => setShowScore((prev) => !prev)}>
            {showScore ? 'Hide score' : 'Show score (easy mode)'}
          </button>
          <button type="button" onClick={() => setShowTargetDetails((prev) => !prev)}>
            {showTargetDetails ? 'Hide target numbers' : 'Reveal target numbers'}
          </button>
        </div>

        {showTargetDetails && (
          <div className="comp-trainer__details">
            <h4>Hidden target</h4>
            <ul>
              <li>Threshold: {formatDb(targetSettings.threshold)}</li>
              <li>Ratio: {formatRatio(targetSettings.ratio)}</li>
              <li>Attack: {formatMs(targetSettings.attack)}</li>
              <li>Release: {formatMs(targetSettings.release)}</li>
              <li>Makeup: {formatDb(targetSettings.makeup)}</li>
            </ul>
          </div>
        )}

        {isSuccessVisible && (
          <div className="eq-match__success">
            <h4>Compression champion</h4>
            <p>You hit {score}% accuracy. Note how the curve compares, then spin up another target.</p>
            <div className="eq-match__success-actions">
              <button type="button" onClick={() => setIsSuccessVisible(false)}>
                Keep listening
              </button>
              <button type="button" onClick={handleRandomize}>
                Next challenge
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

export default CompressionTrainer
