export type FilterShape = 'peaking' | 'highpass' | 'lowpass'

export interface FilterSettings {
  type: FilterShape
  frequency: number
  gain: number
  q: number
}
