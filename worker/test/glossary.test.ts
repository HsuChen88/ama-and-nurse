import { describe, expect, it } from 'vitest'
import { TranslationGlossary } from '../src/glossary'

const entries = [{ id: ['Nenek'], 'zh-TW': ['阿嬤', '阿媽', '阿罵'] }]

describe('TranslationGlossary', () => {
  it('matches Indonesian aliases case-insensitively at word boundaries', () => {
    const glossary = new TranslationGlossary(entries)
    expect(glossary.prepare('nenek, NENEKku dan Nenek.', 'id', 'zh-TW')).toBe(
      '<span translate="no">阿嬤</span>, NENEKku dan <span translate="no">阿嬤</span>.',
    )
  })

  it('maps every Chinese alias to the canonical Indonesian term', () => {
    const glossary = new TranslationGlossary(entries)
    expect(glossary.prepare('阿嬤、阿媽和阿罵', 'zh-TW', 'id')).toBe(
      '<span translate="no">Nenek</span>、<span translate="no">Nenek</span>和<span translate="no">Nenek</span>',
    )
  })

  it('preserves HTML special characters through prepare and restore', () => {
    const glossary = new TranslationGlossary(entries)
    const protectedText = glossary.prepare('Nenek < sehat & aman', 'id', 'zh-TW')
    expect(protectedText).toBe('<span translate="no">阿嬤</span> &lt; sehat &amp; aman')
    expect(glossary.restore(protectedText)).toBe('阿嬤 < sehat & aman')
    expect(glossary.restore('Nenek&nbsp;sakit')).toBe('Nenek\u00a0sakit')
  })

  it.each([',', '.', '?', '!', ';', ':', '，', '。', '？', '！', '；', '：', '、', '．'])(
    'removes span-generated space before %s',
    (punctuation) => {
      const glossary = new TranslationGlossary(entries)
      expect(
        glossary.restore(
          `<span translate="no">Nenek</span> ${punctuation} apakah sudah makan?`,
          'id',
        ),
      ).toBe(`Nenek${punctuation} apakah sudah makan?`)
    },
  )

  it('keeps normal Indonesian spacing and removes Chinese span spacing', () => {
    const glossary = new TranslationGlossary(entries)
    expect(glossary.restore('<span translate="no">Nenek</span> sudah makan?', 'id')).toBe(
      'Nenek sudah makan?',
    )
    expect(glossary.restore('請問 <span translate="no">阿嬤</span> 哪裡痛？', 'zh-TW')).toBe(
      '請問阿嬤哪裡痛？',
    )
    expect(glossary.restore('Hari ini cerah , tetapi besok hujan.', 'id')).toBe(
      'Hari ini cerah , tetapi besok hujan.',
    )
  })
})
