import { useCallback, useEffect, useRef, useState } from 'react'
import type { FilterSettings } from '../types'

type EngineStatus = 'loading' | 'ready' | 'error'
export type MonitorMode = 'target' | 'user'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const MIX_FADE = 0.015

const applyFilterSettings = (filter: BiquadFilterNode, settings: FilterSettings) => {
  filter.frequency.value = clamp(settings.frequency, 20, 20000)
  filter.Q.value = clamp(settings.q, 0.1, 18)

  switch (settings.type) {
    case 'highpass':
      filter.type = 'highpass'
      filter.gain.value = 0
      break
    case 'lowpass':
      filter.type = 'lowpass'
      filter.gain.value = 0
      break
    default:
      filter.type = 'peaking'
      filter.gain.value = clamp(settings.gain, -24, 24)
  }
}

export const useEqEngine = (
  audioUrl: string,
  targetFilter: FilterSettings,
  userFilter: FilterSettings,
) => {
  const audioContextRef = useRef<AudioContext | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const targetRef = useRef(targetFilter)
  const userRef = useRef(userFilter)
  const monitorModeRef = useRef<MonitorMode>('target')
  const isLoopingRef = useRef(false)
  const nodesRef = useRef<{
    source: AudioBufferSourceNode | null
    targetFilter: BiquadFilterNode | null
    userFilter: BiquadFilterNode | null
    targetGain: GainNode | null
    userGain: GainNode | null
  }>({
    source: null,
    targetFilter: null,
    userFilter: null,
    targetGain: null,
    userGain: null,
  })

  const [status, setStatus] = useState<EngineStatus>('loading')
  const [isPlaying, setIsPlaying] = useState(false)
  const [monitorMode, setMonitorMode] = useState<MonitorMode>('target')
  const [isLooping, setIsLooping] = useState(false)

  const ensureContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    return audioContextRef.current
  }, [])

  const stopPlayback = useCallback(() => {
    const { source, targetFilter: targetNode, userFilter: userNode, targetGain, userGain } = nodesRef.current

    if (source) {
      source.onended = null
      try {
        source.stop()
      } catch (error) {
        // Source may already be stopped, ignore.
      }
      source.disconnect()
    }

    targetNode?.disconnect()
    userNode?.disconnect()
    targetGain?.disconnect()
    userGain?.disconnect()

    nodesRef.current = {
      source: null,
      targetFilter: null,
      userFilter: null,
      targetGain: null,
      userGain: null,
    }
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    targetRef.current = targetFilter
    if (nodesRef.current.targetFilter) {
      applyFilterSettings(nodesRef.current.targetFilter, targetFilter)
    }
  }, [targetFilter])

  useEffect(() => {
    userRef.current = userFilter
    if (nodesRef.current.userFilter) {
      applyFilterSettings(nodesRef.current.userFilter, userFilter)
    }
  }, [userFilter])

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

  const startPlayback = useCallback(async () => {
    const buffer = bufferRef.current
    if (!buffer) return

    const context = ensureContext()
    await context.resume()

    stopPlayback()

    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = isLoopingRef.current

    const targetNode = context.createBiquadFilter()
    const userNode = context.createBiquadFilter()
    applyFilterSettings(targetNode, targetRef.current)
    applyFilterSettings(userNode, userRef.current)

    const targetGain = context.createGain()
    const userGain = context.createGain()
    targetGain.gain.value = monitorModeRef.current === 'target' ? 1 : 0
    userGain.gain.value = monitorModeRef.current === 'user' ? 1 : 0

    source.connect(targetNode).connect(targetGain).connect(context.destination)
    source.connect(userNode).connect(userGain).connect(context.destination)

    nodesRef.current = {
      source,
      targetFilter: targetNode,
      userFilter: userNode,
      targetGain,
      userGain,
    }

    source.start()
    setIsPlaying(true)

    source.onended = () => {
      nodesRef.current = {
        source: null,
        targetFilter: null,
        userFilter: null,
        targetGain: null,
        userGain: null,
      }
      setIsPlaying(false)
    }
  }, [ensureContext, stopPlayback])

  const monitor = useCallback(
    async (mode: MonitorMode) => {
      if (status !== 'ready') return
      monitorModeRef.current = mode
      setMonitorMode(mode)

      const { source, targetGain, userGain } = nodesRef.current
      const context = audioContextRef.current
      if (source && targetGain && userGain && context) {
        const now = context.currentTime
        targetGain.gain.cancelScheduledValues(now)
        userGain.gain.cancelScheduledValues(now)
        targetGain.gain.setTargetAtTime(mode === 'target' ? 1 : 0, now, MIX_FADE)
        userGain.gain.setTargetAtTime(mode === 'user' ? 1 : 0, now, MIX_FADE)
        return
      }

      await startPlayback()
    },
    [startPlayback, status],
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
