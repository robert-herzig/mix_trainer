import { useCallback, useEffect, useRef, useState } from 'react'

type EngineStatus = 'loading' | 'ready' | 'error'
export type MonitorMode = 'processed' | 'reference'

const MIX_FADE = 0.015

const dbToGain = (db: number) => Math.pow(10, db / 20)

export const useGainCompareEngine = (audioUrl: string, deltaDb: number) => {
  const audioContextRef = useRef<AudioContext | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const nodesRef = useRef<{
    source: AudioBufferSourceNode | null
    processedGain: GainNode | null
    referenceGain: GainNode | null
  }>({ source: null, processedGain: null, referenceGain: null })
  const isLoopingRef = useRef(true)
  const monitorModeRef = useRef<MonitorMode>('processed')

  const [status, setStatus] = useState<EngineStatus>('loading')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLooping, setIsLooping] = useState(true)
  const [monitorMode, setMonitorMode] = useState<MonitorMode>('processed')

  const ensureContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    return audioContextRef.current
  }, [])

  const stopPlayback = useCallback(() => {
    const { source, processedGain, referenceGain } = nodesRef.current

    if (source) {
      source.onended = null
      try {
        source.stop()
      } catch (error) {
        // Source may already be stopped; ignore.
      }
      source.disconnect()
    }

    processedGain?.disconnect()
    referenceGain?.disconnect()

    nodesRef.current = { source: null, processedGain: null, referenceGain: null }
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadAudio = async () => {
      if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
        setStatus('error')
        return
      }

      try {
        setStatus('loading')
        const context = ensureContext()
        const response = await fetch(audioUrl)
        if (!response.ok) throw new Error('Unable to load reference audio')
        const arrayBuffer = await response.arrayBuffer()
        const buffer = await context.decodeAudioData(arrayBuffer)
        if (cancelled) return
        bufferRef.current = buffer
        setStatus('ready')
      } catch (error) {
        if (!cancelled) {
          console.error(error)
          setStatus('error')
        }
      }
    }

    loadAudio()

    return () => {
      cancelled = true
      stopPlayback()
      audioContextRef.current?.close()
      audioContextRef.current = null
    }
  }, [audioUrl, ensureContext, stopPlayback])

  const applyMonitorMode = useCallback(
    (mode: MonitorMode) => {
      const { source, processedGain, referenceGain } = nodesRef.current
      const context = audioContextRef.current
      if (!source || !processedGain || !referenceGain || !context) return false
      const now = context.currentTime
      processedGain.gain.cancelScheduledValues(now)
      referenceGain.gain.cancelScheduledValues(now)
      processedGain.gain.setTargetAtTime(mode === 'processed' ? dbToGain(deltaDb) : 0, now, MIX_FADE)
      referenceGain.gain.setTargetAtTime(mode === 'reference' ? 1 : 0, now, MIX_FADE)
      return true
    },
    [deltaDb],
  )

  const startPlayback = useCallback(async () => {
    const buffer = bufferRef.current
    if (!buffer) return

    const context = ensureContext()
    await context.resume()

    stopPlayback()

    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = isLoopingRef.current

    const processedGain = context.createGain()
    processedGain.gain.value = dbToGain(deltaDb)

    const referenceGain = context.createGain()
    referenceGain.gain.value = 1

    source.connect(processedGain).connect(context.destination)
    source.connect(referenceGain).connect(context.destination)

    nodesRef.current = { source, processedGain, referenceGain }
    applyMonitorMode(monitorModeRef.current)

    source.start()
    setIsPlaying(true)

    source.onended = () => {
      nodesRef.current = { source: null, processedGain: null, referenceGain: null }
      setIsPlaying(false)
    }
  }, [applyMonitorMode, ensureContext, stopPlayback])

  useEffect(() => {
    applyMonitorMode(monitorModeRef.current)
  }, [applyMonitorMode])

  const monitor = useCallback(
    async (mode: MonitorMode) => {
      if (status !== 'ready') return
      monitorModeRef.current = mode
      setMonitorMode(mode)

      const applied = applyMonitorMode(mode)
      if (applied) return

      await startPlayback()
      applyMonitorMode(mode)
    },
    [applyMonitorMode, startPlayback, status],
  )

  const restartPlayback = useCallback(() => {
    if (status !== 'ready') return
    startPlayback()
  }, [startPlayback, status])

  const setLooping = useCallback((loop: boolean) => {
    setIsLooping(loop)
    isLoopingRef.current = loop
    if (nodesRef.current.source) {
      nodesRef.current.source.loop = loop
    }
  }, [])

  return {
    status,
    isPlaying,
    isLooping,
    monitorMode,
    monitor,
    setLooping,
    restartPlayback,
    stopPlayback,
  }
}
