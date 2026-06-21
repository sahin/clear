import { ClearFile, Property, Value, TopLevelBlock, ApiBlock, EventBlock, ConfigBlock, DeployBlock } from './ast.js'

type AnyBlock = any

export function format(ast: ClearFile): string {
  const lines: string[] = []

  // Product header
  lines.push(`product ${ast.product.name}`)
  for (const prop of sortProperties(ast.product.properties)) {
    lines.push(...formatProperty(prop, 1))
  }
  lines.push('')

  // Top-level blocks
  for (const block of ast.blocks) {
    lines.push(...formatTopLevelBlock(block))
    lines.push('')
  }

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }
  lines.push('') // End with newline

  return lines.join('\n')
}

function formatTopLevelBlock(block: TopLevelBlock): string[] {
  switch (block.type) {
    case 'data': return formatDataBlock(block)
    case 'screen': return formatScreenBlock(block)
    case 'flow': return formatFlowBlock(block)
    case 'rule': return formatRuleBlock(block)
    case 'example': return formatExampleBlock(block)
    case 'agent': return formatAgentBlock(block)
    case 'skill': return formatSkillBlock(block)
    case 'api': return formatApiBlock(block)
    case 'event': return formatEventBlock(block)
    case 'config': return formatConfigBlock(block)
    case 'deploy': return formatDeployBlock(block)
  }
}

function formatDataBlock(block: AnyBlock): string[] {
  const lines: string[] = []
  lines.push(`data ${block.name}`)
  for (const field of block.fields) {
    lines.push(`    field ${field.name}`)
    for (const prop of sortProperties(field.properties)) {
      lines.push(...formatProperty(prop, 2))
    }
  }
  return lines
}

function formatScreenBlock(block: AnyBlock): string[] {
  const lines: string[] = []
  lines.push(`screen ${block.name}`)
  for (const prop of sortProperties(block.properties)) {
    lines.push(...formatProperty(prop, 1))
  }
  for (const section of block.sections) {
    lines.push(`    section ${section.name}`)
    for (const prop of sortProperties(section.properties)) {
      lines.push(...formatProperty(prop, 2))
    }
  }
  return lines
}

function formatFlowBlock(block: AnyBlock): string[] {
  const lines: string[] = []
  lines.push(`flow ${block.name}`)
  for (const prop of sortProperties(block.properties)) {
    lines.push(...formatProperty(prop, 1))
  }
  for (const step of block.steps) {
    lines.push(`    step ${step.name}`)
    for (const prop of sortProperties(step.properties)) {
      lines.push(...formatProperty(prop, 2))
    }
  }
  return lines
}

function formatRuleBlock(block: any): string[] {
  const lines: string[] = []
  lines.push(`rule ${block.name}`)
  for (const prop of sortProperties(block.properties)) {
    lines.push(...formatProperty(prop, 1))
  }
  return lines
}

function formatExampleBlock(block: any): string[] {
  const lines: string[] = []
  // Handle example names with quotes
  if (block.name.includes(' ')) {
    lines.push(`example "${block.name}"`)
  } else {
    lines.push(`example ${block.name}`)
  }
  for (const prop of sortProperties(block.properties)) {
    lines.push(...formatProperty(prop, 1))
  }
  return lines
}

function formatAgentBlock(block: AnyBlock): string[] {
  const lines: string[] = []
  lines.push(`agent ${block.name}`)
  for (const prop of sortProperties(block.properties)) {
    lines.push(...formatProperty(prop, 1))
  }
  for (const handler of block.handlers) {
    lines.push(`    on ${handler.event}`)
    for (const prop of sortProperties(handler.properties)) {
      lines.push(...formatProperty(prop, 2))
    }
  }
  return lines
}

function formatSkillBlock(block: AnyBlock): string[] {
  const lines: string[] = []
  lines.push(`skill ${block.name}`)
  for (const prop of sortProperties(block.properties)) {
    lines.push(...formatProperty(prop, 1))
  }
  return lines
}

function formatApiBlock(block: ApiBlock): string[] {
  const lines: string[] = []
  lines.push(`api ${block.protocol} ${block.path}`)
  for (const prop of sortProperties(block.properties)) {
    lines.push(...formatProperty(prop, 1))
  }
  for (const route of block.routes) {
    lines.push(`    ${route.method} ${route.path}`)
    for (const prop of sortProperties(route.properties)) {
      lines.push(...formatProperty(prop, 2))
    }
  }
  return lines
}

function formatEventBlock(block: EventBlock): string[] {
  const lines: string[] = []
  lines.push(`event ${block.name}`)
  for (const prop of sortProperties(block.properties)) {
    lines.push(...formatProperty(prop, 1))
  }
  return lines
}

function formatConfigBlock(block: ConfigBlock): string[] {
  const lines: string[] = []
  lines.push(`config ${block.name}`)
  for (const prop of sortProperties(block.properties)) {
    lines.push(...formatProperty(prop, 1))
  }
  return lines
}

function formatDeployBlock(block: DeployBlock): string[] {
  const lines: string[] = []
  lines.push(`deploy ${block.target}`)
  for (const prop of sortProperties(block.properties)) {
    lines.push(...formatProperty(prop, 1))
  }
  return lines
}

function formatProperty(prop: Property, indent: number): string[] {
  const lines: string[] = []
  const prefix = '    '.repeat(indent)

  if (prop.children.length > 0) {
    // Multi-line property with sub-properties
    if (prop.args.length > 0 || prop.value) {
      lines.push(`${prefix}${prop.key} ${formatPropValue(prop)}`)
    } else {
      lines.push(`${prefix}${prop.key}`)
    }
    for (const child of sortProperties(prop.children)) {
      lines.push(...formatProperty(child, indent + 1))
    }
  } else {
    // Leaf property
    lines.push(`${prefix}${prop.key}${formatPropArgs(prop)}`)
  }

  return lines
}

function formatPropValue(prop: Property): string {
  if (prop.value) {
    return formatValue(prop.value)
  }
  return prop.args.join(' ')
}

function formatPropArgs(prop: Property): string {
  if (prop.value) {
    if (prop.args.length > 0) {
      return ` ${prop.args.join(' ')} ${formatValue(prop.value)}`
    }
    return ` ${formatValue(prop.value)}`
  }
  if (prop.args.length > 0) {
    return ` ${prop.args.join(' ')}`
  }
  return ''
}

function formatValue(value: Value): string {
  switch (value.type) {
    case 'string':
      // Check if the string needs quoting
      if (value.value.includes('"') || value.value.includes('\n')) {
        return `"""\n${value.value}\n"""`
      }
      return `"${value.value}"`
    case 'number':
      return String(value.value)
    case 'boolean':
      return value.value ? 'true' : 'false'
    case 'list':
      return `[${value.value.map(v => formatValue(v)).join(', ')}]`
    case 'special':
      return value.keyword
    case 'env':
      return `from env ${value.name}`
    case 'identifier':
      return value.value
    case 'reference':
      return value.name
    case 'map':
      return `{ ${value.value.map(e => `${e.key}: ${formatValue(e.value)}`).join(', ')} }`
  }
}

function sortProperties(props: Property[]): Property[] {
  const order: Record<string, number> = {
    'name': 1,
    'version': 2,
    'description': 3,
    'type': 4,
    'required': 5,
    'default': 6,
    'unique': 7,
    'primary': 8,
    'min': 9,
    'max': 10,
    'min_length': 11,
    'max_length': 12,
    'format': 13,
    'options': 14,
    'role': 15,
    'personality': 16,
    'goal': 17,
    'knowledge': 18,
    'title': 19,
    'layout': 20,
  }

  return [...props].sort((a, b) => {
    const oa = order[a.key] ?? 99
    const ob = order[b.key] ?? 99
    if (oa !== ob) return oa - ob
    return a.key.localeCompare(b.key)
  })
}
