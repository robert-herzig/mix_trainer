import { useCallback, useEffect, useRef, useState } from 'react'
import type { CompressionSettings } from '../types'

export type CompressionMonitorMode = 'target' | 'user'
type EngineStatus = 'loading' | 'ready' | 'error'

const MIX_FADE = 0.015

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const dbToGain = (db: number) => Math.pow(10, db / 20)

const applyCompressorSettings = (node: DynamicsCompressorNode, settings: CompressionSettings) => {
  node.threshold.value = clamp(settings.threshold, -100, 0)
  node.ratio.value = clamp(settings.ratio, 1, 20)
  node.attack.value = clamp(settings.attack / 1000, 0.001, 1)
  node.release.value = clamp(settings.release / 1000, 0.01, 1)
}

const applyMakeup = (gainNode: GainNode | null, makeup: number, isActive: boolean) => {
  if (!gainNode) return
  const base = dbToGain(clamp(makeup, -24, 24))
  gainNode.gain.value = isActive ? base : 0
}

export const useCompressorEngine = (
  audioUrl: string,
  targetSettings: CompressionSettings,
  userSettings: CompressionSettings,
) => {
  const audioContextRef = useRef<AudioContext | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const targetRef = useRef(targetSettings)
  const userRef = useRef(userSettings)
  const monitorModeRef = useRef<CompressionMonitorMode>('target')
  const isLoopingRef = useRef(true)

  const nodesRef = useRef<{
    source: AudioBufferSourceNode | null
    targetComp: DynamicsCompressorNode | null
    userComp: DynamicsCompressorNode | null
    targetGain: GainNode | null
    userGain: GainNode | null
  }>({ source: null, targetComp: null, userComp: null, targetGain: null, userGain: null })

  const [status, setStatus] = useState<EngineStatus>('loading')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLooping, setIsLooping] = useState(true)
  const [monitorMode, setMonitorMode] = useState<CompressionMonitorMode>('target')

  const ensureContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    return audioContextRef.current
  }, [])

  const stopPlayback = useCallback(() => {
    const { source, targetComp, userComp, targetGain, userGain } = nodesRef.current

    if (source) {
      source.onended = null
      try {
        source.stop()
      } catch (error) {
        // source might already be stopped
      }
      source.disconnect()
    }

    targetComp?.disconnect()
    userComp?.disconnect()
    targetGain?.disconnect()
    userGain?.disconnect()

    nodesRef.current = { source: null, targetComp: null, userComp: null, targetGain: null, userGain: null }
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    targetRef.current = targetSettings
    if (nodesRef.current.targetComp) {
      applyCompressorSettings(nodesRef.current.targetComp, targetSettings)
    }
    applyMakeup(nodesRef.current.targetGain, targetSettings.makeup, monitorModeRef.current === 'target')
  }, [targetSettings])

  useEffect(() => {
    userRef.current = userSettings
    if (nodesRef.current.userComp) {
      applyCompressorSettings(nodesRef.current.userComp, userSettings)
    }
    applyMakeup(nodesRef.current.userGain, userSettings.makeup, monitorModeRef.current === 'user')
  }, [userSettings])

  useEffect(() => {
    let cancelled = false

    const loadBuffer = async () => {
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

    loadBuffer()

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

    const targetComp = context.createDynamicsCompressor()
    const userComp = context.createDynamicsCompressor()
    applyCompressorSettings(targetComp, targetRef.current)
    applyCompressorSettings(userComp, userRef.current)

    const targetGain = context.createGain()
    const userGain = context.createGain()
    applyMakeup(targetGain, targetRef.current.makeup, monitorModeRef.current === 'target')
    applyMakeup(userGain, userRef.current.makeup, monitorModeRef.current === 'user')

    source.connect(targetComp).connect(targetGain).connect(context.destination)
    source.connect(userComp).connect(userGain).connect(context.destination)

    nodesRef.current = { source, targetComp, userComp, targetGain, userGain }

    source.start()
    setIsPlaying(true)

    source.onended = () => {
      nodesRef.current = { source: null, targetComp: null, userComp: null, targetGain: null, userGain: null }
      setIsPlaying(false)
    }
  }, [ensureContext, stopPlayback])

  const monitor = useCallback(
    async (mode: CompressionMonitorMode) => {
      if (status !== 'ready') return
      monitorModeRef.current = mode
      setMonitorMode(mode)

      const { source, targetGain, userGain } = nodesRef.current
      const context = audioContextRef.current
      if (source && targetGain && userGain && context) {
        const now = context.currentTime
        targetGain.gain.cancelScheduledValues(now)
        userGain.gain.cancelScheduledValues(now)
        const targetLevel = dbToGain(targetRef.current.makeup)
        const userLevel = dbToGain(userRef.current.makeup)
        targetGain.gain.setTargetAtTime(mode === 'target' ? targetLevel : 0, now, MIX_FADE)
        userGain.gain.setTargetAtTime(mode === 'user' ? userLevel : 0, now, MIX_FADE)
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
