import { ClearFile, TopLevelBlock, DataBlock, Property, Value, ParseError, FieldDef, FlowStep, ScreenSection, AgentHandler, ApiRoute } from './ast.js'

export interface ValidationResult {
  valid: boolean
  errors: ParseError[]
  warnings: string[]
  symbols: Map<string, TopLevelBlock>
}

export function validate(ast: ClearFile): ValidationResult {
  const errors: ParseError[] = []
  const warnings: string[] = []
  const symbols = new Map<string, TopLevelBlock>()

  // Index all top-level blocks by name
  for (const block of ast.blocks) {
    const name = (block as any).name
    if (name && name !== undefined) {
      if (symbols.has(name)) {
        errors.push({
          message: `Duplicate block name '${name}'. Each block must have a unique name.`,
          span: block.span,
        })
      }
      symbols.set(name, block)
    }
  }

  // Validate each block
  for (const block of ast.blocks) {
    switch (block.type) {
      case 'data':
        validateData(block, errors)
        break
      case 'flow':
        validateFlow(block, errors, symbols)
        break
      case 'rule':
        validateRule(block, errors)
        break
      case 'screen':
        validateScreen(block, errors)
        break
      case 'agent':
        validateAgent(block, errors)
        break
      case 'api':
        validateApi(block, errors)
        break
      case 'config':
        validateConfig(block, errors)
        break
      case 'deploy':
        validateDeploy(block, errors)
        break
      case 'example':
        validateExample(block, errors)
        break
      case 'event':
        validateEvent(block, errors)
        break
      case 'skill':
        validateSkill(block, errors)
        break
    }
  }

  // Check for common naming convention violations
  for (const block of ast.blocks) {
    const name = (block as any).name
    if (name && block.type !== 'config' && block.type !== 'deploy') {
      if (!/^[A-Z]/.test(name)) {
        warnings.push(
          `Block '${name}' (${block.type}) should use PascalCase (e.g., '${name.charAt(0).toUpperCase() + name.slice(1)}')`
        )
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    symbols,
  }
}

function findProperty(props: Property[], key: string): Property | undefined {
  return props.find(p => p.key === key)
}

function hasProperty(props: Property[], key: string): boolean {
  return props.some(p => p.key === key)
}

function validateData(block: DataBlock, errors: ParseError[]) {
  if (!block.name || block.name.trim() === '') {
    errors.push({ message: 'Data block must have a name', span: block.span })
  }
  if (block.fields.length === 0) {
    errors.push({ message: `Data block '${block.name}' has no fields`, span: block.span })
  }
  const fieldNames = new Set<string>()
  for (const field of block.fields) {
    if (fieldNames.has(field.name)) {
      errors.push({
        message: `Duplicate field '${field.name}' in data block '${block.name}'`,
        span: field.span,
      })
    }
    fieldNames.add(field.name)

    // Check for required 'type' property
    if (!hasProperty(field.properties, 'type')) {
      errors.push({
        message: `Field '${field.name}' in '${block.name}' is missing required 'type' property`,
        span: field.span,
      })
    }
  }
}

function validateFlow(block: any, errors: ParseError[], symbols: Map<string, TopLevelBlock>) {
  if (!block.name) {
    errors.push({ message: 'Flow block must have a name', span: block.span })
  }
  if (block.steps && block.steps.length === 0) {
    errors.push({ message: `Flow '${block.name}' has no steps`, span: block.span })
  }

  // Check for step names that might conflict
  if (block.steps) {
    const stepNames = new Set<string>()
    for (const step of block.steps as FlowStep[]) {
      if (stepNames.has(step.name)) {
        errors.push({
          message: `Duplicate step '${step.name}' in flow '${block.name}'`,
          span: step.span,
        })
      }
      stepNames.add(step.name)
    }
  }

  // Validate references in properties
  for (const prop of block.properties) {
    validateReferences(prop, block.name, symbols, errors)
  }
}

function validateRule(block: any, errors: ParseError[]) {
  if (!block.name) {
    errors.push({ message: 'Rule block must have a name', span: block.span })
  }
  if (!hasProperty(block.properties, 'require') && !hasProperty(block.properties, 'apply')) {
    errors.push({ message: `Rule '${block.name}' should have 'apply' and 'require' properties`, span: block.span })
  }
}

function validateScreen(block: any, errors: ParseError[]) {
  if (!block.name) {
    errors.push({ message: 'Screen block must have a name', span: block.span })
  }
}

function validateAgent(block: any, errors: ParseError[]) {
  if (!block.name) {
    errors.push({ message: 'Agent block must have a name', span: block.span })
  }
  if (block.handlers && block.handlers.length === 0) {
    errors.push({ message: `Agent '${block.name}' has no event handlers (use 'on <event>')`, span: block.span })
  }
}

function validateApi(block: any, errors: ParseError[]) {
  if (!block.protocol) {
    errors.push({ message: 'API block must specify a protocol (e.g., REST, MCP)', span: block.span })
  }
  if (block.routes && block.routes.length === 0) {
    errors.push({ message: `API '${block.protocol} ${block.path}' has no routes`, span: block.span })
  }
}

function validateConfig(block: any, errors: ParseError[]) {
  if (!block.name) {
    errors.push({ message: 'Config block must have a name (e.g., production, staging)', span: block.span })
  }
}

function validateDeploy(block: any, errors: ParseError[]) {
  if (!block.target) {
    errors.push({ message: 'Deploy block must specify a target (e.g., cloudflare-workers, docker)', span: block.span })
  }
}

function validateExample(block: any, errors: ParseError[]) {
  if (!block.name) {
    errors.push({ message: 'Example block should have a description', span: block.span })
  }
}

function validateEvent(block: any, errors: ParseError[]) {
  if (!block.name) {
    errors.push({ message: 'Event block must have a name', span: block.span })
  }
}

function validateSkill(block: any, errors: ParseError[]) {
  if (!block.name) {
    errors.push({ message: 'Skill block must have a name', span: block.span })
  }
}

function validateReferences(prop: Property, context: string, symbols: Map<string, TopLevelBlock>, errors: ParseError[]) {
  // Check for type reference patterns
  if (prop.key === 'type' && prop.args.length > 0) {
    const typeStr = prop.args.join(' ')
    // Check if it references another data block (e.g., "reference User")
    if (typeStr.startsWith('reference ')) {
      const refName = typeStr.slice(10).trim()
      if (refName && !symbols.has(refName)) {
        errors.push({
          message: `Reference to unknown block '${refName}' in '${context}'`,
          span: prop.span,
        })
      }
    }
    // Check "list of X" where X should be a known type or data block
    if (typeStr.startsWith('list of ')) {
      const innerType = typeStr.slice(8).trim()
      // Only check if it's PascalCase (user-defined type)
      if (/^[A-Z]/.test(innerType) && !symbols.has(innerType) && !['string', 'integer', 'float', 'boolean', 'timestamp', 'uuid', 'url', 'email', 'list', 'map', 'enum'].includes(innerType)) {
        errors.push({
          message: `Unknown type '${innerType}' (not a primitive type or defined data block) in '${context}'`,
          span: prop.span,
        })
      }
    }
  }

  // Check 'apply' references
  if (prop.key === 'apply' && prop.args.length > 0) {
    const target = prop.args.join(' ')
    const refMatch = target.match(/^(?:to\s+)?(?:(?:data|flow|agent)\s+)?(\S+)$/)
    if (refMatch) {
      const refName = refMatch[1]
      if (!['User', 'Task', 'Product', 'CartItem', 'Variant', 'Ticket', 'Lead', 'Customer', 'SyncLog', 'Metric', 'Report'].includes(refName) && !symbols.has(refName)) {
        // This could be a valid inline reference, just warn
      }
    }
  }

  for (const child of prop.children) {
    validateReferences(child, context, symbols, errors)
  }
}
