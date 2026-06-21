import { ClearFile, Property, ApiRoute } from '../ast.js'
import { ImportMap } from './common.js'

// ── Data model helpers ──────────────────────────────────────────────

interface FieldInfo {
  name: string
  type: string
  required: boolean
  defaultValue: string | null
  isReference: boolean
  referenceTarget: string | null
  enumOptions: string[]
}

interface DataModel {
  name: string
  storeName: string
  fields: FieldInfo[]
}

function collectDataModels(ast: ClearFile): Map<string, DataModel> {
  const models = new Map<string, DataModel>()
  for (const block of ast.blocks) {
    if (block.type === 'data') {
      const b = block as any
      const fields: FieldInfo[] = (b.fields || []).map((f: any) => {
        const typeProp = f.properties.find((p: Property) => p.key === 'type')
        const typeStr = typeProp ? typeProp.args.join(' ') : 'string'
        const required = f.properties.some((p: Property) =>
          p.key === 'required' && (p.args.includes('true') || p.value?.type === 'boolean' && p.value.value === true)
        )
        const defaultProp = f.properties.find((p: Property) => p.key === 'default')
        const defaultValue = defaultProp ? extractDefaultValue(defaultProp) : null
        const optionsProp = f.properties.find((p: Property) => p.key === 'options')
        const enumOptions: string[] = optionsProp?.value?.type === 'list'
          ? optionsProp.value.value.map((v: any) => v.value)
          : []
        const isReference = typeStr.startsWith('reference ')
        const referenceTarget = isReference ? typeStr.slice(10).trim() : null
        return { name: f.name, type: typeStr, required, defaultValue, isReference, referenceTarget, enumOptions }
      })
      models.set(b.name, { name: b.name, storeName: b.name.toLowerCase() + 's', fields })
    }
  }
  return models
}

function extractDefaultValue(prop: Property): string | null {
  if (prop.value) {
    switch (prop.value.type) {
      case 'string': return `'${prop.value.value.replace(/'/g, "\\'")}'`
      case 'number': return String(prop.value.value)
      case 'boolean': return prop.value.value ? 'true' : 'false'
      case 'special': return prop.value.keyword === 'now' ? 'new Date().toISOString()' : prop.value.keyword
      default: return null
    }
  }
  if (prop.args.length > 0) {
    const first = prop.args[0]
    if (first === 'true') return 'true'
    if (first === 'false') return 'false'
    if (!isNaN(Number(first))) return first
    return `'${first.replace(/'/g, "\\'")}'`
  }
  return null
}

// ── Property string parsers ─────────────────────────────────────────

function parseAcceptFields(raw: string): string[] {
  // "title, description, priority, assignee, due_date" → ["title", "description", "priority", "assignee", "due_date"]
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function parseFilterFields(raw: string): string[] {
  // "by status, priority, assignee" → ["status", "priority", "assignee"]
  const cleaned = raw.replace(/^by\s+/i, '')
  return cleaned.split(',').map(s => s.trim()).filter(Boolean)
}

function parseSort(raw: string): { field: string; direction: string } | null {
  // "by created_at desc" → { field: "created_at", direction: "desc" }
  const cleaned = raw.replace(/^by\s+/i, '')
  const parts = cleaned.split(/\s+/)
  if (parts.length === 0) return null
  const field = parts[0]
  if (!field) return null
  const direction = parts[1] === 'asc' || parts[1] === 'desc' ? parts[1] : 'asc'
  return { field, direction }
}

function parsePageLimit(raw: string): number {
  // "20 per page" → 20, "10" → 10
  const match = raw.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 20
}

function parseIncludeField(raw: string): string {
  // "assignee details" → "assignee"
  return raw.split(/\s+/)[0] || raw.trim()
}

function parseSetValue(raw: string): { field: string; value: string } | null {
  // "created_at to now" → { field: "created_at", value: "new Date().toISOString()" }
  // "status to \"done\"" → { field: "status", value: "'done'" }
  const parts = raw.split(/\s+/)
  if (parts.length < 3) return null
  // parts[0] is field, parts[1] is "to", rest is value
  const field = parts[0]
  if (!field) return null
  const valueRest = parts.slice(2).join(' ')
  if (!valueRest) return null
  if (valueRest === 'now') return { field, value: 'new Date().toISOString()' }
  if (valueRest === 'true') return { field, value: 'true' }
  if (valueRest === 'false') return { field, value: 'false' }
  if (valueRest === 'null') return { field, value: 'null' }
  if (!isNaN(Number(valueRest))) return { field, value: valueRest }
  // String value
  return { field, value: `'${valueRest.replace(/'/g, "\\'")}'` }
}

function parseErrorCode(raw: string): number {
  // "404 if not found" → 404, "201" → 201
  const match = raw.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 500
}

function parseErrorMsg(raw: string): string {
  // "404 if not found" → "Not found"
  // Remove status code prefix
  return raw.replace(/^\d+\s+/, '').replace(/^if\s+/, '').trim() || 'Not found'
}

function extractStatusOrError(raw: string, prop: Property | undefined, fallback: number): number {
  if (!prop) return fallback
  // Property may have the value in `args` (e.g., "404 if not found") or in `value` (e.g., 201 as number)
  if (raw) return parseErrorCode(raw)
  if (prop.value?.type === 'number') return prop.value.value
  return fallback
}

// ── Main generator ──────────────────────────────────────────────────

export function generateExpressCode(ast: ClearFile): string {
  const parts: string[] = []

  parts.push(`// Auto-generated by Clear v0.2 — Express.js`)
  parts.push(`// Source: ${ast.product.name}`)
  parts.push(`// Do not edit — changes should be made to the .clear file`)
  parts.push('')

  const imports = new ImportMap()
  imports.add('express', `import express, { Request, Response, NextFunction } from 'express'`)
  imports.add('cors', `import cors from 'cors'`)

  const models = collectDataModels(ast)
  const hasTimestamps = Array.from(models.values()).some(m =>
    m.fields.some(f => f.type === 'timestamp')
  )
  if (hasTimestamps || models.size > 0) {
    imports.add('uuid', `import { v4 as uuidv4 } from 'uuid'`)
  }

  parts.push(imports.toString())
  parts.push('')

  // Data blocks → interfaces
  for (const [, model] of models) {
    parts.push(generateExpressData(model))
    parts.push('')
  }

  // In-memory stores
  if (models.size > 0) {
    parts.push('// In-memory stores')
    for (const [, model] of models) {
      parts.push(`const ${model.storeName}: ${model.name}[] = []`)
    }
    parts.push('')
  }

  // Rule blocks → validation functions
  const ruleNames: string[] = []
  for (const block of ast.blocks) {
    if (block.type === 'rule') {
      const ruleName = (block as any).name
      ruleNames.push(ruleName)
      parts.push(generateRuleBlock(block, models))
      parts.push('')
    }
  }

  // App setup
  parts.push('// App setup')
  parts.push('const app = express()')
  parts.push('app.use(cors())')
  parts.push('app.use(express.json())')
  parts.push('')

  // API blocks → routes
  const apiBlocks = ast.blocks.filter(b => b.type === 'api')
  for (const block of apiBlocks) {
    const b = block as any
    if (b.protocol !== 'REST') continue
    parts.push(...generateApiRoutes(b, models, ruleNames))
  }

  // Error handling
  parts.push('// Error handling')
  parts.push('app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {')
  parts.push('  console.error("Error:", err.message)')
  parts.push('  res.status(500).json({ error: err.message })')
  parts.push('})')
  parts.push('')

  // Config for port
  const configBlock = ast.blocks.find(b => b.type === 'config')
  const port = configBlock
    ? (configBlock as any).properties.find((p: Property) => p.key === 'port')?.args[0] ?? '8080'
    : '8080'

  parts.push(`const PORT = process.env.PORT ?? ${port}`)
  parts.push('app.listen(PORT, () => {')
  parts.push('  console.log(`Server running on port ${PORT}`)')
  parts.push('})')
  parts.push('')
  parts.push('export default app')

  return parts.join('\n')
}

// ── Data interface generation ───────────────────────────────────────

function generateExpressData(model: DataModel): string {
  const lines: string[] = []
  lines.push(`// Data: ${model.name}`)
  lines.push(`export interface ${model.name} {`)
  for (const field of model.fields) {
    const tsType = inferTsType(field)
    lines.push(`  ${field.name}${field.required ? '' : '?'}: ${tsType}`)
  }
  lines.push('}')
  return lines.join('\n')
}

function inferTsType(field: FieldInfo): string {
  const t = field.type
  if (t.startsWith('list of ')) {
    const inner = t.slice(8).trim()
    if (['string', 'integer', 'float', 'boolean'].includes(inner)) return `${mapPrim(inner)}[]`
    return `${inner}[]`
  }
  if (t === 'map') return 'Record<string, any>'
  if (t === 'enum') {
    if (field.enumOptions.length > 0) return field.enumOptions.map(v => `'${v}'`).join(' | ')
    return 'string'
  }
  if (t.startsWith('reference ')) return t.slice(10).trim()
  return mapPrim(t)
}

function mapPrim(type: string): string {
  const m: Record<string, string> = {
    string: 'string', integer: 'number', float: 'number', boolean: 'boolean',
    timestamp: 'string', uuid: 'string', url: 'string', email: 'string',
  }
  return m[type] ?? type
}

// ── Rule / validation generation ───────────────────────────────────

function generateRuleBlock(block: any, models: Map<string, DataModel>): string {
  const lines: string[] = []
  const name = block.name
  lines.push(`// Rule: ${name}`)
  lines.push(`function validate${name}(data: Record<string, any>): string[] {`)
  lines.push(`  const errors: string[] = []`)
  for (const prop of block.properties) {
    if (prop.key === 'apply') continue
    if (prop.key === 'require') {
      const ruleStr = prop.args.join(' ')
      const validationCode = generateValidationCode(ruleStr, models)
      if (validationCode) {
        lines.push(`  ${validationCode}`)
      }
    }
  }
  lines.push(`  return errors`)
  lines.push('}')
  return lines.join('\n')
}

function generateValidationCode(rule: string, models: Map<string, DataModel>): string | null {
  // Pattern: "title is not empty"
  const isEmpty = rule.match(/^(\w+)\s+is\s+not\s+empty$/i)
  if (isEmpty) {
    return `if (!data['${isEmpty[1]}'] || String(data['${isEmpty[1]}']).trim() === '') errors.push('${isEmpty[1]} is required')`
  }

  // Pattern: "due_date is in the future when creating"
  const isFuture = rule.match(/^(\w+)\s+is\s+in\s+the\s+future\s+when\s+creating$/i)
  if (isFuture) {
    return `if (data['${isFuture[1]}'] && new Date(data['${isFuture[1]}']).getTime() <= Date.now()) errors.push('${isFuture[1]} must be in the future')`
  }

  // Pattern: "assignee exists in User"
  const exists = rule.match(/^(\w+)\s+exists\s+in\s+(\w+)$/i)
  if (exists) {
    return `// TODO: validate ${exists[1]} exists in ${exists[2]}`
  }

  // Pattern: "length >= 8"
  const lengthMin = rule.match(/^(\w+)\s+length\s*>=\s*(\d+)$/i)
  if (lengthMin) {
    return `if (data['${lengthMin[1]}'] && data['${lengthMin[1]}'].length < ${lengthMin[2]}) errors.push('${lengthMin[1]} must be at least ${lengthMin[2]} characters')`
  }

  // Pattern: "contains uppercase", "contains number"
  const contains = rule.match(/^(\w+)\s+contains\s+(.+)$/i)
  if (contains) {
    if (contains[2].toLowerCase() === 'uppercase') {
      return `if (data['${contains[1]}'] && !/[A-Z]/.test(data['${contains[1]}'])) errors.push('${contains[1]} must contain uppercase letter')`
    }
    if (contains[2].toLowerCase() === 'number') {
      return `if (data['${contains[1]}'] && !/[0-9]/.test(data['${contains[1]}'])) errors.push('${contains[1]} must contain a number')`
    }
  }

  // Fallback: emit as comment
  return `// TODO: implement — ${rule}`
}

// ── Route generation ────────────────────────────────────────────────

function generateApiRoutes(apiBlock: any, models: Map<string, DataModel>, ruleNames: string[]): string[] {
  const lines: string[] = []
  const apiPrefix = (apiBlock.path || '/').replace(/\/$/, '') || ''
  const routes = apiBlock.routes as ApiRoute[]

  if (routes.length === 0) return lines

  lines.push(`// API: ${apiBlock.protocol} ${apiPrefix || '/'}`)

  for (const route of routes) {
    lines.push(...generateRoute(apiBlock, route, apiPrefix, models, ruleNames))
  }
  lines.push('')

  return lines
}

function generateRoute(
  apiBlock: any,
  route: ApiRoute,
  apiPrefix: string,
  models: Map<string, DataModel>,
  ruleNames: string[],
): string[] {
  const lines: string[] = []
  const method = route.method.toLowerCase()
  const routePath = route.path || '/'
  const expressPath = apiPrefix + routePath.replace(/\/$/, '') || '/'

  // Resolve the data model from "return" or "remove" property
  const returnProp = route.properties.find((p: Property) => p.key === 'return')
  const removeProp = route.properties.find((p: Property) => p.key === 'remove')
  const dataModel = resolveDataModel(returnProp || removeProp, models, routePath, apiPrefix)

  // Pre-parse all relevant properties
  const acceptProp = route.properties.find((p: Property) => p.key === 'accept')
  const statusProp = route.properties.find((p: Property) => p.key === 'status')
  const errorProps = route.properties.filter((p: Property) => p.key === 'error')
  const includeProp = route.properties.find((p: Property) => p.key === 'include')
  const filterProp = route.properties.find((p: Property) => p.key === 'filter')
  const sortProp = route.properties.find((p: Property) => p.key === 'sort')
  const paginateProp = route.properties.find((p: Property) => p.key === 'paginate')
  const validateProp = route.properties.find((p: Property) => p.key === 'validate')
  const setProps = route.properties.filter((p: Property) => p.key === 'set')

  // Error message / code
  const errRaw = errorProps.length > 0 ? errorProps[0].args.join(' ') : ''
  const errCode = errorProps.length > 0 ? extractStatusOrError(errRaw, errorProps[0], 404) : 404
  const errMsg = errorProps.length > 0 ? parseErrorMsg(errRaw) : 'Not found'

  lines.push(`app.${method}('${expressPath}', (req: Request, res: Response) => {`)
  lines.push(`  try {`)

  if (method === 'get') {
    const isList = routePath === '/' || routePath === ''
    if (isList) {
      generateListHandler(lines, dataModel, filterProp, sortProp, paginateProp)
    } else {
      generateGetByIdHandler(lines, dataModel, includeProp, errCode, errMsg)
    }
  } else if (method === 'post') {
    generateCreateHandler(lines, dataModel, acceptProp, setProps, validateProp, statusProp, ruleNames, errCode, errMsg)
  } else if (method === 'put') {
    generateUpdateHandler(lines, dataModel, acceptProp, setProps, validateProp, statusProp, ruleNames, errCode, errMsg)
  } else if (method === 'delete') {
    generateDeleteHandler(lines, dataModel, statusProp, errCode, errMsg)
  } else {
    lines.push(`    res.json({ message: '${method.toUpperCase()} ${expressPath}' })`)
  }

  lines.push(`  } catch (err: any) {`)
  lines.push(`    console.error(err)`)
  lines.push(`    res.status(500).json({ error: err.message })`)
  lines.push(`  }`)
  lines.push('})')

  return lines
}

function resolveDataModel(
  prop: Property | undefined,
  models: Map<string, DataModel>,
  routePath: string,
  apiPrefix: string,
): { model: DataModel | null; storeName: string; typeName: string } {
  if (prop) {
    const str = prop.args.join(' ')
    for (const [name] of models) {
      if (str.includes(name)) {
        const m = models.get(name)!
        return { model: m, storeName: m.storeName, typeName: m.name }
      }
    }
  }
  // Fallback: derive from API prefix (e.g., /tasks → Task)
  const prefixSegments = apiPrefix.split('/').filter(Boolean)
  if (prefixSegments.length > 0) {
    const candidate = prefixSegments[prefixSegments.length - 1]
    const singular = candidate.endsWith('s') ? candidate.slice(0, -1) : candidate
    const pascalName = singular.charAt(0).toUpperCase() + singular.slice(1)
    const m = models.get(pascalName)
    if (m) return { model: m, storeName: m.storeName, typeName: m.name }
  }
  // Ultimate fallback
  return { model: null, storeName: 'items', typeName: 'Item' }
}

// ── Handler generators ──────────────────────────────────────────────

function generateListHandler(
  lines: string[],
  dataModel: { model: DataModel | null; storeName: string; typeName: string },
  filterProp: Property | undefined,
  sortProp: Property | undefined,
  paginateProp: Property | undefined,
): void {
  lines.push(`    let result = [...${dataModel.storeName}]`)

  if (filterProp) {
    const fields = parseFilterFields(filterProp.args.join(' '))
    for (const field of fields) {
      lines.push(`    if (req.query['${field}']) result = result.filter(i => String(i['${field}']) === req.query['${field}'])`)
    }
  }

  if (sortProp) {
    const parsed = parseSort(sortProp.args.join(' '))
    if (parsed) {
      if (parsed.direction === 'desc') {
        lines.push(`    result.sort((a: any, b: any) => {`)
        lines.push(`      const av = a['${parsed.field}']`)
        lines.push(`      const bv = b['${parsed.field}']`)
        lines.push(`      if (!av && !bv) return 0`)
        lines.push(`      if (!av) return 1`)
        lines.push(`      if (!bv) return -1`)
        lines.push(`      return av < bv ? 1 : av > bv ? -1 : 0`)
        lines.push(`    })`)
      } else {
        lines.push(`    result.sort((a: any, b: any) => {`)
        lines.push(`      const av = a['${parsed.field}']`)
        lines.push(`      const bv = b['${parsed.field}']`)
        lines.push(`      if (!av && !bv) return 0`)
        lines.push(`      if (!av) return 1`)
        lines.push(`      if (!bv) return -1`)
        lines.push(`      return av < bv ? -1 : av > bv ? 1 : 0`)
        lines.push(`    })`)
      }
    }
  }

  if (paginateProp) {
    const limit = parsePageLimit(paginateProp.args.join(' '))
    lines.push(`    const page = parseInt(req.query.page as string) || 1`)
    lines.push(`    const start = (page - 1) * ${limit}`)
    lines.push(`    res.json({`)
    lines.push(`      data: result.slice(start, start + ${limit}),`)
    lines.push(`      total: result.length,`)
    lines.push(`      page,`)
    lines.push(`      limit: ${limit},`)
    lines.push(`      totalPages: Math.ceil(result.length / ${limit})`)
    lines.push(`    })`)
  } else {
    lines.push(`    res.json(result)`)
  }
}

function generateGetByIdHandler(
  lines: string[],
  dataModel: { model: DataModel | null; storeName: string; typeName: string },
  includeProp: Property | undefined,
  errCode: number,
  errMsg: string,
): void {
  lines.push(`    const item = ${dataModel.storeName}.find(i => i.id === req.params.id)`)
  lines.push(`    if (!item) {`)
  lines.push(`      res.status(${errCode}).json({ error: '${errMsg}' })`)
  lines.push(`      return`)
  lines.push(`    }`)

  if (includeProp) {
    const includeField = parseIncludeField(includeProp.args.join(' '))
    // Find which model this field references
    let refStore = 'null'
    if (dataModel.model) {
      const refField = dataModel.model.fields.find(f => f.name === includeField)
      if (refField && refField.referenceTarget) {
        const refModelName = refField.referenceTarget
        const refStoreName = refModelName.charAt(0).toLowerCase() + refModelName.slice(1) + 's'
        refStore = refStoreName
      }
    }
    lines.push(`    const result = { ...item }`)
    if (refStore !== 'null') {
      lines.push(`    result['${includeField}'] = ${refStore}.find((r: any) => r.id === item['${includeField}']) ?? null`)
    } else {
      lines.push(`    // TODO: include ${includeField} details`)
    }
    lines.push(`    res.json(result)`)
  } else {
    lines.push(`    res.json(item)`)
  }
}

function generateCreateHandler(
  lines: string[],
  dataModel: { model: DataModel | null; storeName: string; typeName: string },
  acceptProp: Property | undefined,
  setProps: Property[],
  validateProp: Property | undefined,
  statusProp: Property | undefined,
  ruleNames: string[],
  errCode: number,
  errMsg: string,
): void {
  const fields = acceptProp ? parseAcceptFields(acceptProp.args.join(' ')) : []

  // Destructure from body
  if (fields.length > 0) {
    lines.push(`    const { ${fields.join(', ')} } = req.body`)
  } else {
    lines.push(`    const data = req.body`)
  }

  // Validation
  if (validateProp && ruleNames.length > 0) {
    lines.push(`    const validationErrors: string[] = []`)
    for (const ruleName of ruleNames) {
      lines.push(`    validationErrors.push(...validate${ruleName}(req.body))`)
    }
    lines.push(`    if (validationErrors.length > 0) {`)
    lines.push(`      res.status(400).json({ errors: validationErrors })`)
    lines.push(`      return`)
    lines.push(`    }`)
  }

  // Build the item
  lines.push(`    const item: ${dataModel.typeName} = {`)
  lines.push(`      id: uuidv4(),`)

  if (fields.length > 0) {
    for (const field of fields) {
      const cleanName = field.replace(/,/g, '').trim()
      lines.push(`      ${cleanName},`)
    }
  }

  // Apply defaults from data model
  if (dataModel.model) {
    for (const f of dataModel.model.fields) {
      if (f.name === 'id') continue
      if (!fields.includes(f.name) && f.name !== 'created_at' && f.name !== 'updated_at') {
        // Add default for fields not in accept list
        if (f.defaultValue) {
          lines.push(`      ${f.name}: ${f.defaultValue},`)
        }
      }
    }
  }

  // Track which fields are already set via set properties
  const alreadySetFields = new Set<string>()
  for (const sp of setProps) {
    const parsed = parseSetValue(sp.args.join(' '))
    if (parsed) {
      lines.push(`      ${parsed.field}: ${parsed.value},`)
      alreadySetFields.add(parsed.field)
    }
  }

  // Auto timestamp if model has created_at (unless already set)
  if (dataModel.model && dataModel.model.fields.some(f => f.name === 'created_at' && !fields.includes('created_at'))) {
    if (!alreadySetFields.has('created_at')) {
      lines.push(`      created_at: new Date().toISOString(),`)
    }
  }
  if (dataModel.model && dataModel.model.fields.some(f => f.name === 'updated_at' && !fields.includes('updated_at'))) {
    if (!alreadySetFields.has('updated_at')) {
      lines.push(`      updated_at: new Date().toISOString(),`)
    }
  }

  lines.push(`    }`)
  lines.push(`    ${dataModel.storeName}.push(item)`)

  const statusRaw = statusProp ? statusProp.args.join(' ') : ''
  const statusCode = extractStatusOrError(statusRaw, statusProp, 201)
  lines.push(`    res.status(${statusCode}).json(item)`)
}

function generateUpdateHandler(
  lines: string[],
  dataModel: { model: DataModel | null; storeName: string; typeName: string },
  acceptProp: Property | undefined,
  setProps: Property[],
  validateProp: Property | undefined,
  statusProp: Property | undefined,
  ruleNames: string[],
  errCode: number,
  errMsg: string,
): void {
  lines.push(`    const index = ${dataModel.storeName}.findIndex(i => i.id === req.params.id)`)
  lines.push(`    if (index === -1) {`)
  lines.push(`      res.status(${errCode}).json({ error: '${errMsg}' })`)
  lines.push(`      return`)
  lines.push(`    }`)

  if (acceptProp) {
    const fields = parseAcceptFields(acceptProp.args.join(' '))
    lines.push(`    const updates: Partial<${dataModel.typeName}> = {}`)
    for (const field of fields) {
      const cleanName = field.replace(/,/g, '').trim()
      lines.push(`    if (req.body['${cleanName}'] !== undefined) updates['${cleanName}'] = req.body['${cleanName}']`)
    }
    // Apply set properties
    for (const sp of setProps) {
      const parsed = parseSetValue(sp.args.join(' '))
      if (parsed) {
        lines.push(`    updates['${parsed.field}'] = ${parsed.value}`)
      }
    }
    lines.push(`    ${dataModel.storeName}[index] = { ...${dataModel.storeName}[index], ...updates, id: req.params.id }`)
  } else {
    lines.push(`    ${dataModel.storeName}[index] = { ...${dataModel.storeName}[index], ...req.body, id: req.params.id }`)
  }

  const statusRaw = statusProp ? statusProp.args.join(' ') : ''
  const statusCode = extractStatusOrError(statusRaw, statusProp, 200)
  lines.push(`    res.status(${statusCode}).json(${dataModel.storeName}[index])`)
}

function generateDeleteHandler(
  lines: string[],
  dataModel: { model: DataModel | null; storeName: string; typeName: string },
  statusProp: Property | undefined,
  errCode: number,
  errMsg: string,
): void {
  lines.push(`    const index = ${dataModel.storeName}.findIndex(i => i.id === req.params.id)`)
  lines.push(`    if (index === -1) {`)
  lines.push(`      res.status(${errCode}).json({ error: '${errMsg}' })`)
  lines.push(`      return`)
  lines.push(`    }`)
  lines.push(`    const deleted = ${dataModel.storeName}.splice(index, 1)[0]`)

  const statusRaw = statusProp ? statusProp.args.join(' ') : ''
  const statusCode = extractStatusOrError(statusRaw, statusProp, 204)
  if (statusCode === 204) {
    lines.push(`    res.status(204).send()`)
  } else {
    lines.push(`    res.status(${statusCode}).json(deleted)`)
  }
}
