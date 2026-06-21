// Clear Interpreter — executes .clear files directly at runtime
// Parses the AST, creates in-memory data stores, and starts an HTTP server

import fs from 'fs'
import path from 'path'
import { parse } from '../parser.js'
import { validate } from '../validator.js'
import { ClearFile, Property, ApiRoute } from '../ast.js'
import { Store, FilterQuery, SortConfig, PaginationConfig, PaginatedResult } from './store.js'
import { HttpServer, RequestContext } from './server.js'
import { registerFlows, stopAllFlows } from './flow.js'

// ── Field info extraction (mirrors codegen/common.ts patterns) ─────

interface FieldInfo {
  name: string
  type: string
  required: boolean
  defaultValue: any
  isReference: boolean
  referenceTarget: string | null
  enumOptions: string[]
}

interface DataModel {
  name: string
  storeName: string
  store: Store<any>
  fields: FieldInfo[]
}

// ── Property parsers ────────────────────────────────────────────────

function parseAcceptFields(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function parseFilterFields(raw: string): string[] {
  const cleaned = raw.replace(/^by\s+/i, '')
  return cleaned.split(',').map(s => s.trim()).filter(Boolean)
}

function parseSort(raw: string): { field: string; direction: string } | null {
  const cleaned = raw.replace(/^by\s+/i, '')
  const parts = cleaned.split(/\s+/)
  if (parts.length === 0) return null
  const field = parts[0]
  if (!field) return null
  const direction = parts[1] === 'asc' || parts[1] === 'desc' ? parts[1] : 'asc'
  return { field, direction }
}

function parsePageLimit(raw: string): number {
  const match = raw.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 20
}

/** Parse pagination limit from a property that may have the value as a number literal */
function parsePageLimitFromProp(paginateProp: Property | undefined): number {
  if (!paginateProp) return 20
  if (paginateProp.value?.type === 'number') return paginateProp.value.value
  return parsePageLimit(paginateProp.args.join(' '))
}

/** Parse error code+message from error property that may have value as number literal */
function parseErrorProps(errorProps: Property[]): { code: number; message: string } {
  if (errorProps.length === 0) return { code: 404, message: 'Not found' }
  const prop = errorProps[0]
  // When args is empty, the value was parsed as a number literal (e.g., `error 404`)
  // When args is non-empty, use args for both code and message (e.g., `error 404 if not found`)
  if (prop.args.length === 0 && prop.value?.type === 'number') {
    return { code: prop.value.value, message: 'Not found' }
  }
  const raw = prop.args.join(' ')
  return { code: parseErrorCode(raw), message: parseErrorMsg(raw) }
}

function parseSetValue(raw: string): { field: string; value: any } | null {
  const parts = raw.split(/\s+/)
  if (parts.length < 3) return null
  const field = parts[0]
  if (!field) return null
  const valueRest = parts.slice(2).join(' ')
  if (!valueRest) return null
  if (valueRest === 'now') return { field, value: new Date().toISOString() }
  if (valueRest === 'true') return { field, value: true }
  if (valueRest === 'false') return { field, value: false }
  if (valueRest === 'null') return { field, value: null }
  if (!isNaN(Number(valueRest))) return { field, value: Number(valueRest) }
  return { field, value: valueRest }
}

function parseErrorCode(raw: string): number {
  const match = raw.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 500
}

/** Parse status from a property that may have the value as a number literal */
function parseStatusCode(statusProp: Property | undefined): number {
  if (!statusProp) return 0
  if (statusProp.value?.type === 'number') return statusProp.value.value
  return parseErrorCode(statusProp.args.join(' '))
}

function parseErrorMsg(raw: string): string {
  return raw.replace(/^\d+\s+/, '').replace(/^if\s+/, '').trim() || 'Not found'
}

// Sentinel value for 'now' — evaluated lazily at record creation time
const NOW_SENTINEL = { __now: true }

function extractDefaultValue(prop: Property): any {
  if (prop.value) {
    switch (prop.value.type) {
      case 'string': return prop.value.value
      case 'number': return prop.value.value
      case 'boolean': return prop.value.value
      case 'special':
        if (prop.value.keyword === 'now') return NOW_SENTINEL
        return prop.value.keyword
      default: return null
    }
  }
  if (prop.args.length > 0) {
    const first = prop.args[0]
    if (first === 'true') return true
    if (first === 'false') return false
    if (!isNaN(Number(first))) return Number(first)
    return first
  }
  return null
}

function resolveDefaultValue(value: any): any {
  if (value === NOW_SENTINEL) return new Date().toISOString()
  return value
}

function collectDataModels(ast: ClearFile): Map<string, DataModel> {
  const models = new Map<string, DataModel>()
  for (const block of ast.blocks) {
    if (block.type === 'data') {
      const b = block as any
      const storeName = b.name.toLowerCase() + 's'
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
      models.set(b.name, {
        name: b.name,
        storeName,
        store: new Store(),
        fields,
      })
    }
  }
  return models
}

function resolveDataModel(
  prop: Property | undefined,
  models: Map<string, DataModel>,
  apiPrefix: string,
): DataModel | null {
  if (prop) {
    const str = prop.args.join(' ')
    for (const [name] of models) {
      if (str.includes(name)) {
        return models.get(name)!
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
    if (m) return m
  }
  return null
}

/**
 * Auto-resolve all reference fields on an item, replacing reference IDs with
 * the full referenced records from their respective stores.
 */
function resolveItem(
  item: Record<string, any>,
  dataModel: DataModel,
  models: Map<string, DataModel>,
): Record<string, any> {
  const result = { ...item }
  for (const field of dataModel.fields) {
    if (field.isReference && result[field.name] !== undefined && result[field.name] !== null) {
      const refModel = models.get(field.referenceTarget!)
      if (refModel) {
        const refRecord = refModel.store.findById(result[field.name])
        if (refRecord) {
          result[field.name] = refRecord
        }
      }
    }
  }
  return result
}

/**
 * Resolve reference fields on multiple items.
 */
function resolveItems(
  items: Record<string, any>[],
  dataModel: DataModel,
  models: Map<string, DataModel>,
): Record<string, any>[] {
  return items.map(item => resolveItem(item, dataModel, models))
}

/**
 * Auto-resolve reference fields on an item that came from Store.create/update.
 * Pass-through if dataModel is null.
 */
function resolveItemSafe(
  item: Record<string, any> | null | undefined,
  dataModel: DataModel | null,
  models: Map<string, DataModel>,
): Record<string, any> | null | undefined {
  if (!item || !dataModel) return item
  return resolveItem(item, dataModel, models)
}

// ── Rule evaluation ─────────────────────────────────────────────────

function evaluateRules(block: any, data: Record<string, any>): string[] {
  const errors: string[] = []
  for (const prop of block.properties) {
    if (prop.key === 'apply') continue
    if (prop.key === 'require') {
      const ruleStr = prop.args.join(' ')
      const err = evaluateRule(ruleStr, data)
      if (err) errors.push(err)
    }
  }
  return errors
}

function evaluateRule(rule: string, data: Record<string, any>): string | null {
  // "title is not empty"
  const isEmpty = rule.match(/^(\w+)\s+is\s+not\s+empty$/i)
  if (isEmpty) {
    const val = data[isEmpty[1]]
    if (!val || String(val).trim() === '') return `${isEmpty[1]} is required`
    return null
  }

  // "due_date is in the future when creating"
  const isFuture = rule.match(/^(\w+)\s+is\s+in\s+the\s+future\s+when\s+creating$/i)
  if (isFuture) {
    const val = data[isFuture[1]]
    if (val && new Date(val).getTime() <= Date.now()) return `${isFuture[1]} must be in the future`
    return null
  }

  // "assignee exists in User" — can't validate without cross-store checks in runtime
  // silently pass for now

  return null
}

// ── Route registration ──────────────────────────────────────────────

function registerApiRoutes(
  apiBlock: any,
  models: Map<string, DataModel>,
  ruleBlocks: any[],
  server: HttpServer,
): void {
  const apiPrefix = (apiBlock.path || '/').replace(/\/$/, '') || ''
  const routes = apiBlock.routes as ApiRoute[]

  for (const route of routes) {
    const method = route.method.toLowerCase()
    const routePath = route.path || '/'
    const fullPath = apiPrefix + (routePath.startsWith('/') ? routePath : '/' + routePath)
    const normalizedPath = fullPath.replace(/\/$/, '') || '/'

    // Resolve the data model
    const returnProp = route.properties.find((p: Property) => p.key === 'return')
    const removeProp = route.properties.find((p: Property) => p.key === 'remove')
    const dataModel = resolveDataModel(returnProp || removeProp, models, apiPrefix)

    // Pre-parse all relevant properties
    const acceptProp = route.properties.find((p: Property) => p.key === 'accept')
    const statusProp = route.properties.find((p: Property) => p.key === 'status')
    const errorProps = route.properties.filter((p: Property) => p.key === 'error')
    const filterProp = route.properties.find((p: Property) => p.key === 'filter')
    const sortProp = route.properties.find((p: Property) => p.key === 'sort')
    const paginateProp = route.properties.find((p: Property) => p.key === 'paginate')
    const validateProp = route.properties.find((p: Property) => p.key === 'validate')
    const setProps = route.properties.filter((p: Property) => p.key === 'set')

    const { code: errCode, message: errMsg } = parseErrorProps(errorProps)

    const isList = routePath === '/' || routePath === ''

    server.on(method, normalizedPath, async (ctx) => {
      if (method === 'options') return

      if (method === 'get') {
        if (isList) {
          handleList(ctx, dataModel, filterProp, sortProp, paginateProp, models)
        } else {
          handleGetById(ctx, dataModel, models, errCode, errMsg)
        }
      } else if (method === 'post') {
        handleCreate(ctx, dataModel, acceptProp, setProps, validateProp, statusProp, ruleBlocks, errCode, errMsg, models)
      } else if (method === 'put') {
        handleUpdate(ctx, dataModel, acceptProp, setProps, validateProp, statusProp, ruleBlocks, errCode, errMsg, models)
      } else if (method === 'delete') {
        handleDelete(ctx, dataModel, statusProp, errCode, errMsg)
      }
    })
  }
}

// ── Handler implementations ─────────────────────────────────────────

function handleList(
  ctx: RequestContext,
  dataModel: DataModel | null,
  filterProp: Property | undefined,
  sortProp: Property | undefined,
  paginateProp: Property | undefined,
  models: Map<string, DataModel>,
): void {
  if (!dataModel) {
    ctx.responseBody = []
    ctx.status = 200
    return
  }

  // Build filters from query params
  const filters: FilterQuery[] = []
  if (filterProp) {
    const fields = parseFilterFields(filterProp.args.join(' '))
    for (const field of fields) {
      if (ctx.query[field] !== undefined) {
        filters.push({ field, value: ctx.query[field] })
      }
    }
  }

  // Build sort config
  let sort: SortConfig | null = null
  if (sortProp) {
    const parsed = parseSort(sortProp.args.join(' '))
    if (parsed) {
      sort = { field: parsed.field, direction: parsed.direction as 'asc' | 'desc' }
    }
  }

  // Build pagination
  let pagination: PaginationConfig | null = null
  if (paginateProp) {
    const limit = parseInt(ctx.query.limit as string) || parsePageLimitFromProp(paginateProp)
    const page = parseInt(ctx.query.page as string) || 1
    pagination = { page, limit }
  }

  const result = dataModel.store.findAll({ filters, sort, pagination })    // Auto-resolve reference fields if applicable
  if (Array.isArray(result)) {
    ctx.responseBody = resolveItems(result, dataModel, models)
  } else {
    // Paginated result: resolve references within the data array
    const paginated = result as PaginatedResult<any>
    ctx.responseBody = {
      ...paginated,
      data: resolveItems(paginated.data, dataModel, models),
    }
  }
  ctx.status = 200
}

function handleGetById(
  ctx: RequestContext,
  dataModel: DataModel | null,
  models: Map<string, DataModel>,
  errCode: number,
  errMsg: string,
): void {
  if (!dataModel) {
    ctx.status = errCode
    ctx.responseBody = { error: errMsg }
    return
  }

  const item = dataModel.store.findById(ctx.params.id)
  if (!item) {
    ctx.status = errCode
    ctx.responseBody = { error: errMsg }
    return
  }

  // Auto-resolve all reference fields
  ctx.responseBody = resolveItem(item, dataModel, models)
  ctx.status = 200
}

function handleCreate(
  ctx: RequestContext,
  dataModel: DataModel | null,
  acceptProp: Property | undefined,
  setProps: Property[],
  validateProp: Property | undefined,
  statusProp: Property | undefined,
  ruleBlocks: any[],
  errCode: number,
  errMsg: string,
  models: Map<string, DataModel>,
): void {
  if (!dataModel) {
    ctx.status = errCode
    ctx.responseBody = { error: errMsg }
    return
  }

  const fields = acceptProp ? parseAcceptFields(acceptProp.args.join(' ')) : []

  // Build the record
  const record: Record<string, any> = {}

  // Copy accepted fields from body
  if (fields.length > 0) {
    for (const field of fields) {
      const cleanName = field.replace(/,/g, '').trim()
      if (ctx.body?.[cleanName] !== undefined) {
        record[cleanName] = ctx.body[cleanName]
      }
    }
  } else if (ctx.body && typeof ctx.body === 'object') {
    Object.assign(record, ctx.body)
  }

  // Apply defaults from data model
  if (dataModel) {
    for (const f of dataModel.fields) {
      if (f.name === 'id') continue
      if (record[f.name] === undefined && f.defaultValue !== null) {
        record[f.name] = resolveDefaultValue(f.defaultValue)
      }
    }
  }

  // Apply set properties
  for (const sp of setProps) {
    const parsed = parseSetValue(sp.args.join(' '))
    if (parsed) {
      record[parsed.field] = parsed.value
    }
  }

  // Auto-timestamps
  if (dataModel) {
    if (dataModel.fields.some(f => f.name === 'created_at') && record.created_at === undefined) {
      record.created_at = new Date().toISOString()
    }
    if (dataModel.fields.some(f => f.name === 'updated_at') && record.updated_at === undefined) {
      record.updated_at = new Date().toISOString()
    }
  }

  // Validate rules
  if (validateProp && ruleBlocks.length > 0) {
    const allErrors: string[] = []
    for (const ruleBlock of ruleBlocks) {
      const errors = evaluateRules(ruleBlock, record)
      allErrors.push(...errors)
    }
    if (allErrors.length > 0) {
      ctx.status = 400
      ctx.responseBody = { errors: allErrors }
      return
    }
  }

  const created = dataModel.store.create(record)
  const statusCode = parseStatusCode(statusProp) || 201
  ctx.status = statusCode
  ctx.responseBody = resolveItemSafe(created, dataModel, models) ?? created
}

function handleUpdate(
  ctx: RequestContext,
  dataModel: DataModel | null,
  acceptProp: Property | undefined,
  setProps: Property[],
  validateProp: Property | undefined,
  statusProp: Property | undefined,
  ruleBlocks: any[],
  errCode: number,
  errMsg: string,
  models: Map<string, DataModel>,
): void {
  if (!dataModel) {
    ctx.status = errCode
    ctx.responseBody = { error: errMsg }
    return
  }

  const existing = dataModel.store.findById(ctx.params.id)
  if (!existing) {
    ctx.status = errCode
    ctx.responseBody = { error: errMsg }
    return
  }

  const updates: Record<string, any> = {}

  if (acceptProp) {
    const fields = parseAcceptFields(acceptProp.args.join(' '))
    for (const field of fields) {
      const cleanName = field.replace(/,/g, '').trim()
      if (ctx.body?.[cleanName] !== undefined) {
        updates[cleanName] = ctx.body[cleanName]
      }
    }
  } else if (ctx.body && typeof ctx.body === 'object') {
    Object.assign(updates, ctx.body)
    delete updates.id
  }

  // Apply set properties
  for (const sp of setProps) {
    const parsed = parseSetValue(sp.args.join(' '))
    if (parsed) {
      updates[parsed.field] = parsed.value
    }
  }

  // Auto-update timestamp
  if (dataModel.fields.some(f => f.name === 'updated_at') && updates.updated_at === undefined) {
    updates.updated_at = new Date().toISOString()
  }

  const updated = dataModel.store.update(ctx.params.id, updates)
  const statusCode = parseStatusCode(statusProp) || 200
  ctx.status = statusCode
  ctx.responseBody = resolveItemSafe(updated, dataModel, models) ?? updated
}

function handleDelete(
  ctx: RequestContext,
  dataModel: DataModel | null,
  statusProp: Property | undefined,
  errCode: number,
  errMsg: string,
): void {
  if (!dataModel) {
    ctx.status = errCode
    ctx.responseBody = { error: errMsg }
    return
  }

  const deleted = dataModel.store.delete(ctx.params.id)
  if (!deleted) {
    ctx.status = errCode
    ctx.responseBody = { error: errMsg }
    return
  }

  const statusCode = parseStatusCode(statusProp) || 204
  ctx.status = statusCode
  if (statusCode === 204) {
    ctx.responseBody = null
  } else {
    ctx.responseBody = deleted
  }
}

// ── Server lifecycle helpers ───────────────────────────────────────

function setupServer(
  ast: ClearFile,
  server: HttpServer,
): Map<string, DataModel> {
  server.clearRoutes()

  // Collect data models and create fresh stores
  const models = collectDataModels(ast)

  // Collect rule blocks for validation
  const ruleBlocks = ast.blocks.filter(b => b.type === 'rule')

  // Register API routes
  const apiBlocks = ast.blocks.filter(b => b.type === 'api')
  for (const block of apiBlocks) {
    const b = block as any
    if (b.protocol !== 'REST') continue
    registerApiRoutes(b, models, ruleBlocks, server)
  }

  return models
}

function printRoutes(ast: ClearFile): { modelCount: number; routeCount: number } {
  const models = collectDataModels(ast)
  const apiBlocks = ast.blocks.filter(b => b.type === 'api')

  let routeCount = 0
  console.log(`\n  ${'_'.repeat(40)}`)
  console.log(`  📦 Clear Interpreter v0.4`)
  console.log(`  Product: ${ast.product.name}`)
  console.log(`  Models:  ${models.size} data types`)

  for (const block of apiBlocks) {
    const b = block as any
    if (b.protocol !== 'REST') continue
    const routes = (b.routes || []) as ApiRoute[]
    routeCount += routes.length
    for (const route of routes) {
      const prefix = (b.path || '/').replace(/\/$/, '') || ''
      const rp = route.path || '/'
      const full = prefix + (rp.startsWith('/') ? rp : '/' + rp)
      console.log(`  ${' '.repeat(8)}${route.method.toUpperCase().padEnd(6)} ${full}`)
    }
  }
  console.log(`  Routes:  ${routeCount} API endpoints`)
  console.log(`  ${'_'.repeat(40)}\n`)

  return { modelCount: models.size, routeCount }
}

// ── Main interpreter function ───────────────────────────────────────

export interface InterpreterOptions {
  port?: number
  watch?: string  // file path to watch for changes
  verbose?: boolean  // log all HTTP requests
}

export function runInterpreter(ast: ClearFile, options: InterpreterOptions = {}): HttpServer {
  const port = options.port ?? 8080

  // Create HTTP server
  const server = new HttpServer(options.verbose)

  // Register routes and start
  const models = setupServer(ast, server)
  printRoutes(ast)

  // Register flow executors (if any)
  registerFlows(ast, models)

  console.log(`🚀  http://localhost:${port}`)
  server.listen(port)

  // Set up file watching if requested
  if (options.watch) {
    const filepath = options.watch
    const resolvedPath = path.resolve(filepath)

    console.log(`👀  Watching ${path.basename(filepath)} for changes...`)

    let timeout: ReturnType<typeof setTimeout> | null = null
    fs.watch(resolvedPath, (eventType) => {
      if (eventType !== 'change') return

      // Debounce rapid changes (e.g., editor saves multiple times)
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(async () => {
        try {
          const source = fs.readFileSync(resolvedPath, 'utf-8')
          const parseResult = parse(source, filepath)

          if (parseResult.ast === null) {
            console.log(`\n⚠️  Parse error in ${path.basename(filepath)} — keeping current server running`)
            for (const err of parseResult.errors) {
              console.log(`   ${err.message} (${err.span.start.line}:${err.span.start.col})`)
            }
            return
          }

          const validation = validate(parseResult.ast)
          if (!validation.valid) {
            console.log(`\n⚠️  Validation error — keeping current server running`)
            for (const err of validation.errors) {
              console.log(`   ${err.message} (${err.span.start.line}:${err.span.start.col})`)
            }
            return
          }

          // Hot reload: close server, rebuild routes, restart
          // Note: in-memory data stores and flow timers are reset on reload
          const startTime = Date.now()
          stopAllFlows()
          await server.close()
          const freshModels = setupServer(parseResult.ast, server)
          registerFlows(parseResult.ast, freshModels)
          console.log(`\n🔄  Reloaded ${path.basename(filepath)} (${Date.now() - startTime}ms — stores reset)`)
          server.listen(port, () => {
            console.log(`👀  Watching ${path.basename(filepath)} for changes...`)
          })
        } catch (err: any) {
          console.log(`\n⚠️  Error reloading: ${err.message}`)
        }
      }, 300)
    })
  }

  return server
}
