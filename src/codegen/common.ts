import { Value } from '../ast.js'

export class ImportMap {
  private map = new Map<string, string>()

  add(key: string, statement: string): void {
    if (!this.map.has(key)) this.map.set(key, statement)
  }

  toString(): string {
    return Array.from(this.map.values()).join('\n')
  }
}

export function renderValue(value: Value): string {
  switch (value.type) {
    case 'string':
      return `'${value.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
    case 'number':
      return String(value.value)
    case 'boolean':
      return value.value ? 'true' : 'false'
    case 'list':
      return `[${value.value.map(v => renderValue(v)).join(', ')}]`
    case 'special':
      if (value.keyword === 'now') return 'new Date().toISOString()'
      if (value.keyword === 'null') return 'null'
      if (value.keyword === 'auto') return 'undefined'
      return 'undefined'
    case 'env':
      return `process.env['${value.name}'] ?? ''`
    case 'identifier':
      return value.value
    case 'reference':
      return value.name
    case 'map':
      return `{ ${value.value.map(e => `${e.key}: ${renderValue(e.value)}`).join(', ')} }`
  }
}
