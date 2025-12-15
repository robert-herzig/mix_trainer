import { useMemo, useRef } from 'react'
import './knob.css'

interface KnobProps {
  label: string
  min: number
  max: number
  step?: number
  value: number
  suffix?: string
  formatValue?: (value: number) => string
  onChange: (value: number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getPrecision = (step?: number) => {
  if (!step) return 2
  const decimals = step.toString().split('.')[1]?.length ?? 0
  return Math.min(4, Math.max(0, decimals))
}

export const Knob = ({
  label,
  min,
  max,
  step = 0.01,
  value,
  suffix = '',
  formatValue,
  onChange,
}: KnobProps) => {
  const pointerState = useRef({ startY: 0, startValue: value })
  const precision = useMemo(() => getPrecision(step), [step])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    pointerState.current = { startY: event.clientY, startValue: value }

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      const delta = pointerState.current.startY - moveEvent.clientY
      const sensitivity = (max - min) / 180
      const next = clamp(pointerState.current.startValue + delta * sensitivity, min, max)
      onChange(Number(next.toFixed(precision)))
    }

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  const percent = ((value - min) / (max - min)) * 270 - 135

  const renderedValue = formatValue ? formatValue(value) : `${value.toFixed(precision)}${suffix}`

  return (
    <div className="knob">
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={renderedValue}
        className="knob__dial"
        onPointerDown={handlePointerDown}
      >
        <div className="knob__dial__indicator" style={{ transform: `rotate(${percent}deg)` }} />
      </div>
      <div className="knob__label">{label}</div>
      <div className="knob__value">{renderedValue}</div>
    </div>
  )
}
