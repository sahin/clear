// Flow executor for the Clear interpreter
// Handles ETL pipeline flows with scheduled triggers, step execution, and data operations

import { FlowBlock, FlowStep, Property } from '../ast.js'
import { Store } from './store.js'

// ── Types ───────────────────────────────────────────────────────────

interface DataModel {
  name: string
  storeName: string
  store: Store<any>
  fields: { name: string; type: string; defaultValue: any }[]
}

interface FlowContext {
  models: Map<string, DataModel>
  counters: Record<string, number>
  currentRecord: Record<string, any> | null
  records: Record<string, any>[]
  logs: string[]
}

// ── Timer management ────────────────────────────────────────────────

const activeTimers: NodeJS.Timeout[] = []

export function stopAllFlows(): void {
  for (const t of activeTimers) clearTimeout(t)
  activeTimers.length = 0
}

// ── Schedule parsing ───────────────────────────────────────────────

function parseSchedule(flow: FlowBlock): { interval: number; unit: string } | null {
  const triggerProp = flow.properties.find(p => p.key === 'trigger')
  if (!triggerProp) return null

  const scheduleStr = triggerProp.args.join(' ')
  const match = scheduleStr.match(/schedule\s+every\s+(\d+)\s+(hour|minute|hours|minutes)/i)
  if (!match) return null

  return { interval: parseInt(match[1], 10), unit: match[2].toLowerCase() }
}

function scheduleToMs(interval: number, unit: string): number {
  if (unit.startsWith('hour')) return interval * 60 * 60 * 1000
  return interval * 60 * 1000
}

// ── Helper: find store by name ─────────────────────────────────────

function findStore(name: string, models: Map<string, DataModel>): DataModel | null {
  if (models.has(name)) return models.get(name)!
  const storeName = name.toLowerCase().endsWith('s') ? name.toLowerCase() : name.toLowerCase() + 's'
  for (const [, model] of models) {
    if (model.storeName === storeName) return model
  }
  for (const [, model] of models) {
    if (model.name.toLowerCase() === name.toLowerCase()) return model
  }
  return null
}

// ── Mock data generation for extract steps ─────────────────────────

function generateMockData(model: DataModel, count: number): Record<string, any>[] {
  const records: Record<string, any>[] = []
  const domains = ['example.com', 'test.org', 'demo.net', 'sample.io', 'corp.com']
  const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank']

  for (let i = 0; i < count; i++) {
    const record: Record<string, any> = {}
    for (const field of model.fields) {
      if (field.name === 'id') {
        record.id = Store.generateId()
      } else if (field.name === 'email') {
        record.email = `${names[i % names.length].toLowerCase()}.${i}@${domains[i % domains.length]}`
      } else if (field.name === 'name') {
        record.name = `${names[i % names.length]} ${['Smith', 'Jones', 'Lee', 'Kim', 'Brown', 'Davis'][i % 6]}`
      } else if (field.name === 'source') {
        record.source = ['stripe', 'hubspot', 'intercom', 'manual'][i % 4]
      } else if (field.name === 'metadata') {
        record.metadata = {}
      } else if (field.name === 'synced_at') {
        record.synced_at = new Date().toISOString()
      } else if (field.type === 'timestamp') {
        record[field.name] = new Date().toISOString()
      } else if (field.type === 'boolean') {
        record[field.name] = true
      } else if (field.type === 'number' || field.type === 'integer' || field.type === 'float') {
        record[field.name] = i * 10
      } else if (field.defaultValue !== null) {
        record[field.name] = field.defaultValue
      } else {
        record[field.name] = `mock_${field.name}_${i}`
      }
    }
    records.push(record)
  }
  return records
}

// ── Condition evaluation ───────────────────────────────────────────

function evaluateCondition(condition: string, ctx: FlowContext): boolean {
  const existsMatch = condition.match(/^(\w+)\s+exists\s+with\s+(\S+)/)
  if (existsMatch) {
    const modelName = existsMatch[1]
    const field = existsMatch[2]
    const model = findStore(modelName, ctx.models)
    if (!model || !ctx.currentRecord) return false

    const val = ctx.currentRecord[field]
    if (!val) return false

    const allRecords = model.store.findAll() as any[]
    const existing = allRecords.find((r: any) => r[field] === val)
    return !!existing
  }

  return false
}

// ── Step property execution ────────────────────────────────────────

function executeProperty(prop: Property, ctx: FlowContext, indent: number = 0, siblings?: Property[]): void {
  const pad = '  '.repeat(indent)
  const text = prop.args.join(' ')

  switch (prop.key) {
    // ── External fetch simulation ──
    case 'fetch': {
      const match = text.match(/^(\w+)\s+from\s+(.+)/i)
      const entity = match ? match[1] : 'records'
      const source = match ? match[2] : 'external API'
      ctx.logs.push(`${pad}📡 Fetching ${entity} from ${source}...`)

      const modelName = entity.charAt(0).toUpperCase() + entity.slice(1).replace(/s$/, '')
      const model = findStore(modelName, ctx.models)
      if (model) {
        const mockCount = 3 + Math.floor(Math.random() * 5)
        const mockData = generateMockData(model, mockCount)
        ctx.records = mockData
        ctx.logs.push(`${pad}   → Retrieved ${mockCount} ${entity} (simulated)`)
      } else {
        ctx.logs.push(`${pad}   → Unknown model '${modelName}', skipping fetch`)
      }
      break
    }

    case 'paginate': {
      ctx.logs.push(`${pad}📄 Paginating through results...`)
      break
    }

    case 'store': {
      ctx.logs.push(`${pad}💾 Storing raw records...`)
      break
    }

    case 'filter': {
      if (/^modified\s+since\s+last\s+sync/i.test(text)) {
        ctx.logs.push(`${pad}🔍 Filtering records modified since last sync...`)
      }
      break
    }

    // ── Data transformation ──
    case 'map': {
      const mapMatch = text.match(/^(\S+)\s+to\s+(\S+)/)
      if (mapMatch) {
        const targetField = mapMatch[2].split('.').pop() || mapMatch[2]
        ctx.logs.push(`${pad}🔄 Mapping ${mapMatch[1]} → ${targetField}`)
        for (const record of ctx.records) {
          if (record[mapMatch[1]] !== undefined) {
            record[targetField] = record[mapMatch[1]]
          }
        }
      } else {
        ctx.logs.push(`${pad}🔄 Mapping: ${text}`)
      }
      break
    }

    case 'merge': {
      ctx.logs.push(`${pad}🔀 Merging fields: ${text}`)
      break
    }

    // ── Data operations ──
    case 'set': {
      const setMatch = text.match(/^(\S+)\s+to\s+(.+)/)
      if (setMatch) {
        const field = setMatch[1]
        let value: any = setMatch[2].replace(/^['"]|['"]$/g, '')
        if (value === 'now') value = new Date().toISOString()
        else if (value === 'true') value = true
        else if (value === 'false') value = false
        else if (!isNaN(Number(value))) value = Number(value)

        for (const record of ctx.records) {
          record[field] = value
        }
      }
      break
    }

    case 'create': {
      const createMatch = text.match(/^(?:new\s+)?(\w+)/)
      if (createMatch) {
        const modelName = createMatch[1]
        const model = findStore(modelName, ctx.models)
        if (model) {
          const record: Record<string, any> = {}
          if (ctx.records.length > 0) {
            for (const f of model.fields) {
              if (f.name === 'id') continue
              if (ctx.currentRecord && ctx.currentRecord[f.name] !== undefined) {
                record[f.name] = ctx.currentRecord[f.name]
              } else if (ctx.records[0][f.name] !== undefined) {
                record[f.name] = ctx.records[0][f.name]
              }
            }
          }
          const created = model.store.create(record)
          ctx.currentRecord = created
          ctx.logs.push(`${pad}✅ Created ${modelName} (${created.id?.slice(0, 8)}...)`)
        } else {
          ctx.logs.push(`${pad}✅ Creating ${text}`)
        }
      }
      break
    }

    case 'update': {
      if (ctx.currentRecord && /^existing\s+record/.test(text)) {
        ctx.logs.push(`${pad}📝 Updating existing record`)
      } else {
        ctx.logs.push(`${pad}📝 ${text}`)
      }
      break
    }

    case 'upsert': {
      const upsertMatch = text.match(/^into\s+(\w+)/)
      if (upsertMatch) {
        const modelName = upsertMatch[1]
        const model = findStore(modelName, ctx.models)
        if (model && ctx.records.length > 0) {
          const allRecords = model.store.findAll() as any[]
          for (const record of ctx.records) {
            const existing = allRecords.find((r: any) => r.email === record.email || r.name === record.name)
            if (existing) {
              model.store.update(existing.id, record)
              ctx.counters.records_updated = (ctx.counters.records_updated || 0) + 1
            } else {
              model.store.create(record)
              ctx.counters.records_created = (ctx.counters.records_created || 0) + 1
            }
          }
          ctx.logs.push(`${pad}📥 Upserted ${ctx.records.length} records into ${modelName}`)
        }
      } else {
        ctx.logs.push(`${pad}📥 ${text}`)
      }
      break
    }

    case 'increment': {
      const counter = text.trim()
      ctx.counters[counter] = (ctx.counters[counter] || 0) + 1
      ctx.logs.push(`${pad}🔢 ${counter}: ${ctx.counters[counter]}`)
      break
    }

    // ── Dedup & merge operations ──
    case 'deduplicate': {
      const dedupMatch = text.match(/^by\s+(\S+)/)
      if (dedupMatch) {
        const field = dedupMatch[1]
        ctx.logs.push(`${pad}🧹 Deduplicating by ${field}...`)
        const seen = new Set<string>()
        ctx.records = ctx.records.filter(r => {
          const val = r[field]
          if (seen.has(val)) return false
          seen.add(val)
          return true
        })
      }
      break
    }

    case 'group': {
      ctx.logs.push(`${pad}📊 Grouping: ${text}`)
      break
    }

    case 'keep': {
      ctx.logs.push(`${pad}🏆 ${text}`)
      break
    }

    // ── Control flow ──
    case 'for': {
      if (text.includes('each')) {
        const iteratingOver = ctx.records.length > 0 ? [...ctx.records] : []
        ctx.logs.push(`${pad}🔄 Iterating over ${iteratingOver.length} records...`)

        for (let i = 0; i < iteratingOver.length; i++) {
          ctx.currentRecord = iteratingOver[i]
          ctx.logs.push(`${pad}  → Record ${i + 1}/${iteratingOver.length}:`)

          // Execute children, passing the children array as siblings for if/else resolution
          for (let j = 0; j < prop.children.length; j++) {
            const child = prop.children[j]
            // Skip 'else' — it's handled inside the 'if' case
            if (child.key === 'else') continue
            executeProperty(child, ctx, indent + 2, prop.children)
          }
        }
        ctx.currentRecord = null
      }
      break
    }

    case 'if': {
      const conditionMet = evaluateCondition(text, ctx)
      ctx.logs.push(`${pad}🔀 If ${text}: ${conditionMet ? '✓' : '✗'}`)

      if (conditionMet) {
        for (const child of prop.children) {
          executeProperty(child, ctx, indent + 1)
        }
      } else if (siblings) {
        // Find the next sibling 'else' property
        const thisIndex = siblings.indexOf(prop)
        const elseProp = thisIndex >= 0 ? siblings.slice(thisIndex + 1).find(s => s.key === 'else') : null
        if (elseProp) {
          for (const child of elseProp.children) {
            executeProperty(child, ctx, indent + 1)
          }
        }
      }
      break
    }

    // ── Logging and reporting ──
    case 'log': {
      ctx.logs.push(`${pad}📋 ${text}`)
      break
    }

    case 'notify': {
      const notifyMatch = text.match(/^(\w+)\s+if\s+(.+)/)
      if (notifyMatch) {
        ctx.logs.push(`${pad}🔔 Notify ${notifyMatch[1]} if ${notifyMatch[2]}`)
      } else {
        ctx.logs.push(`${pad}🔔 ${text}`)
      }
      break
    }

    // ── Unknown step types (pass through with children) ──
    default: {
      ctx.logs.push(`${pad}⚙️  ${prop.key} ${text}`)
      for (const child of prop.children) {
        executeProperty(child, ctx, indent + 1)
      }
    }
  }
}

// ── Step and flow execution ────────────────────────────────────────

function executeStep(step: FlowStep, ctx: FlowContext, indent: number = 0): void {
  for (const prop of step.properties) {
    executeProperty(prop, ctx, indent, step.properties)
  }
}

function executeFlow(flow: FlowBlock, models: Map<string, DataModel>): void {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  console.log(`\n  ═══════════════════════════════════════`)
  console.log(`  🔄 Flow: ${flow.name}`)
  console.log(`  ⏱  ${timestamp}`)
  console.log(`  ═══════════════════════════════════════`)

  const ctx: FlowContext = {
    models,
    counters: {},
    currentRecord: null,
    records: [],
    logs: [],
  }

  for (const step of flow.steps) {
    console.log(`\n  ── Step: ${step.name} ──`)
    executeStep(step, ctx, 1)
  }

  for (const log of ctx.logs) {
    console.log(log)
  }

  console.log(`\n  ── Summary ──`)
  if (ctx.counters.records_created) console.log(`  ✅ ${ctx.counters.records_created} records created`)
  if (ctx.counters.records_updated) console.log(`  📝 ${ctx.counters.records_updated} records updated`)
}

// ── Public API ──────────────────────────────────────────────────────

export function registerFlows(ast: { blocks: any[] }, models: Map<string, DataModel>): void {
  const flowBlocks = ast.blocks.filter((b: any) => b.type === 'flow') as FlowBlock[]

  if (flowBlocks.length === 0) return

  console.log(`\n  ${'_'.repeat(40)}`)
  console.log(`  🔄 Flow Scheduler`)

  for (const flow of flowBlocks) {
    const schedule = parseSchedule(flow)
    if (schedule) {
      const ms = scheduleToMs(schedule.interval, schedule.unit)
      const label = schedule.unit.startsWith('hour') ? 'hour' : 'minute'
      console.log(`  ${flow.name.padEnd(20)} ⏱ Every ${schedule.interval} ${label}${schedule.interval > 1 ? 's' : ''}`)

      // Run immediately on startup, then on schedule
      setTimeout(() => executeFlow(flow, models), 500)
      const timer = setInterval(() => executeFlow(flow, models), ms)
      activeTimers.push(timer)
    } else {
      console.log(`  ${flow.name.padEnd(20)} ⏸ No schedule (run manually)`)
    }
  }
  console.log(`  ${'_'.repeat(40)}`)
}
