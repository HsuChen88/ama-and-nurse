import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { IndonesiaFlag, TaiwanFlag } from './flags'

afterEach(() => cleanup())

describe('speaker flags', () => {
  it('renders a decorative 3:2 Taiwan flag with twelve sun rays', () => {
    const { container } = render(<TaiwanFlag />)
    const flag = container.querySelector('svg')

    expect(flag?.getAttribute('viewBox')).toBe('0 0 72 48')
    expect(flag?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('[data-sun-ray]')).toHaveLength(12)
  })

  it('renders a decorative 3:2 Indonesia flag', () => {
    const { container } = render(<IndonesiaFlag />)
    const flag = container.querySelector('svg')

    expect(flag?.getAttribute('viewBox')).toBe('0 0 3 2')
    expect(flag?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('rect')).toHaveLength(2)
  })
})
