import glossaryData from '../glossary.json'
import { decode } from 'he'

type GlossaryEntry = Record<string, string[]>
type Direction = { pattern: RegExp; replacements: Map<string, string> }

const SPAN_TAG = /<\/?span(?:\s[^>]*)?>/gi
const SPACE_BEFORE_SPAN = /\s+(?=<span(?:\s[^>]*)?>)/gi
const SPACE_AFTER_SPAN = /(<\/span>)\s+/gi
const SPACE_BEFORE_PUNCTUATION_AFTER_SPAN =
  /(<\/span>)\s+(?=[,.?!;:，。？！；：、．])/gi

export class TranslationGlossary {
  private readonly directions = new Map<string, Direction>()

  constructor(entries: GlossaryEntry[] = glossaryData.entries) {
    this.build(entries)
  }

  prepare(text: string, source: string, target: string): string {
    const escapedText = escapeHtml(text)
    const direction = this.directions.get(directionKey(source, target))
    if (!direction) return escapedText

    return escapedText.replace(direction.pattern, (term) => {
      const targetTerm = direction.replacements.get(term.toLocaleLowerCase())
      return `<span translate="no">${targetTerm}</span>`
    })
  }

  restore(translatedHtml: string, target?: string): string {
    let cleaned = translatedHtml.replace(SPACE_BEFORE_PUNCTUATION_AFTER_SPAN, '$1')
    if (target?.startsWith('zh')) {
      cleaned = cleaned.replace(SPACE_BEFORE_SPAN, '').replace(SPACE_AFTER_SPAN, '$1')
    }
    return decode(cleaned.replace(SPAN_TAG, ''))
  }

  private build(entries: GlossaryEntry[]): void {
    const mappings = new Map<string, Map<string, string>>()
    entries.forEach((entry, index) => {
      validateEntry(entry, index)
      for (const [source, sourceTerms] of Object.entries(entry)) {
        for (const [target, targetTerms] of Object.entries(entry)) {
          if (source === target) continue
          const key = directionKey(source, target)
          const replacements = mappings.get(key) ?? new Map<string, string>()
          mappings.set(key, replacements)
          const targetTerm = escapeHtml(targetTerms[0])
          for (const sourceTerm of sourceTerms) {
            const escapedSource = escapeHtml(sourceTerm)
            const normalized = escapedSource.toLocaleLowerCase()
            const existing = replacements.get(normalized)
            if (existing !== undefined && existing !== targetTerm) {
              throw new Error(`Glossary term ${sourceTerm} has conflicting targets`)
            }
            replacements.set(normalized, targetTerm)
          }
        }
      }
    })

    for (const [key, replacements] of mappings) {
      const [source] = key.split('\0')
      const alternatives = [...replacements.keys()].sort((a, b) => b.length - a.length)
      const terms = alternatives.map(escapeRegExp).join('|')
      const expression = source.startsWith('zh') ? terms : `(?<!\\w)(?:${terms})(?!\\w)`
      this.directions.set(key, {
        pattern: new RegExp(expression, 'giu'),
        replacements,
      })
    }
  }
}

function validateEntry(entry: GlossaryEntry, index: number): void {
  if (!entry || typeof entry !== 'object' || Object.keys(entry).length < 2) {
    throw new Error(`Glossary entry ${index} must define at least two languages`)
  }
  for (const [language, terms] of Object.entries(entry)) {
    if (!language || !Array.isArray(terms) || terms.length === 0 || terms.some((term) => !term)) {
      throw new Error(`Glossary entry ${index} language values must be non-empty string lists`)
    }
  }
}

function directionKey(source: string, target: string): string {
  return `${source}\0${target}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
