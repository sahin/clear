import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from './parser.js'

// ── Helper ──────────────────────────────────────────────────────────

function assertSuccess(source: string, filename = 'test.clear') {
  const result = parse(source, filename)
  assert.ok(result.ast !== null, `Parse failed: ${result.errors.map(e => e.message).join(', ')}`)
  assert.equal(result.errors.length, 0, `Unexpected errors: ${result.errors.map(e => e.message).join(', ')}`)
  return result.ast
}

function assertErrors(source: string, expectedCount: number, filename = 'test.clear') {
  const result = parse(source, filename)
  assert.equal(result.errors.length, expectedCount,
    `Expected ${expectedCount} errors, got ${result.errors.length}: ${result.errors.map(e => e.message).join(', ')}`)
  return result
}

// ── Product ─────────────────────────────────────────────────────────

describe('product', () => {
  it('parses a minimal product', () => {
    const ast = assertSuccess('product MyApp')
    assert.equal(ast.product.name, 'MyApp')
    assert.equal(ast.product.properties.length, 0)
    assert.equal(ast.blocks.length, 0)
  })

  it('parses a product with properties', () => {
    const ast = assertSuccess(`product MyApp
    name "My Application"
    version "1.0"
    description "A cool app"`)
    assert.equal(ast.product.name, 'MyApp')
    assert.equal(ast.product.properties.length, 3)
    assert.equal(ast.product.properties[0].key, 'name')
    assert.equal(ast.product.properties[0].value?.type, 'string')
    assert.equal((ast.product.properties[0].value as any).value, 'My Application')
  })

  it('requires file to begin with product', () => {
    const r = assertErrors('data User', 1)
    assert.ok(r.errors[0].message.includes('begin with'))
    assert.equal(r.ast, null)
  })

  it('reports error when file is empty', () => {
    const r = assertErrors('', 1)
    assert.ok(r.errors[0].message.includes('begin with'))
    assert.equal(r.ast, null)
  })

  it('skips comments before product', () => {
    const ast = assertSuccess('// This is a comment\nproduct MyApp')
    assert.equal(ast.product.name, 'MyApp')
  })

  it('skips blank lines before product', () => {
    const ast = assertSuccess('\n\n  \nproduct MyApp')
    assert.equal(ast.product.name, 'MyApp')
  })
})

// ── Data block ──────────────────────────────────────────────────────

describe('block: data', () => {
  it('parses a data block with fields', () => {
    const ast = assertSuccess(`product MyApp

data User
    field id
        type uuid
        primary true
    field email
        type string
        required true
        unique true`)
    assert.equal(ast.blocks.length, 1)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'data')
    assert.equal(block.name, 'User')
    assert.equal(block.fields.length, 2)
    assert.equal(block.fields[0].name, 'id')
    assert.equal(block.fields[1].name, 'email')
  })

  it('parses a data block without properties', () => {
    const ast = assertSuccess(`product MyApp

data Empty
    field a
        type string
    field b
        type integer`)
    const block = ast.blocks[0] as any
    assert.equal(block.fields.length, 2)
  })

  it('detects missing field keyword', () => {
    const r = assertErrors(`product MyApp

data Bad
    notfield x
        type string`, 2)
    assert.ok(r.errors[0].message.includes("Expected 'field' keyword"))
    assert.ok(r.errors[1].message.includes("Expected 'field' keyword"))
  })
})

// ── Flow block ──────────────────────────────────────────────────────

describe('block: flow', () => {
  it('parses a flow with steps', () => {
    const ast = assertSuccess(`product MyApp

flow Hello
    description "A simple flow"
    step greet
        log "Hello, world!"
    step done
        log "All done"`)
    assert.equal(ast.blocks.length, 1)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'flow')
    assert.equal(block.name, 'Hello')
    assert.equal(block.properties.length, 1)
    assert.equal(block.steps.length, 2)
    assert.equal(block.steps[0].name, 'greet')
    assert.equal(block.steps[1].name, 'done')
  })

  it('treats non-step lines as flow properties (not errors)', () => {
    // The flow parsing treats non-step lines as properties, not errors
    const ast = assertSuccess(`product MyApp

flow Bad
    notstep x
        type string`)
    const block = ast.blocks[0] as any
    assert.equal(block.steps.length, 0)
    assert.equal(block.properties.length, 1)
    assert.equal(block.properties[0].key, 'notstep')
  })
})

// ── Screen block ────────────────────────────────────────────────────

describe('block: screen', () => {
  it('parses a screen with sections', () => {
    const ast = assertSuccess(`product MyApp

screen Dashboard
    title "Overview"
    layout "grid"
    section metrics
        show total_users as card
    section activity
        show recent_events as table`)
    assert.equal(ast.blocks.length, 1)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'screen')
    assert.equal(block.name, 'Dashboard')
    assert.equal(block.properties.length, 2)
    assert.equal(block.sections.length, 2)
    assert.equal(block.sections[0].name, 'metrics')
    assert.equal(block.sections[1].name, 'activity')
  })
})

// ── Rule block ──────────────────────────────────────────────────────

describe('block: rule', () => {
  it('parses a rule with properties', () => {
    const ast = assertSuccess(`product MyApp

rule PasswordStrength
    apply to User.password
    require length >= 8
    require contains uppercase`)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'rule')
    assert.equal(block.name, 'PasswordStrength')
    assert.equal(block.properties.length, 3)
  })
})

// ── Example block ───────────────────────────────────────────────────

describe('block: example', () => {
  it('parses an example with quoted name', () => {
    const ast = assertSuccess(`product MyApp

example "New user can sign up"
    given user with email "test@test.com"
    when submit form
    then user created`)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'example')
    assert.equal(block.name, 'New user can sign up')
  })

  it('parses an example with unquoted name', () => {
    const ast = assertSuccess(`product MyApp

example SimpleTest
    given something
    then something happens`)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'example')
    assert.equal(block.name, 'SimpleTest')
  })
})

// ── Agent block ─────────────────────────────────────────────────────

describe('block: agent', () => {
  it('parses an agent with handlers', () => {
    const ast = assertSuccess(`product MyApp

agent SupportBot
    role "Customer support"
    personality "Helpful"
    on new_ticket
        classify intent
    on customer.reply
        draft response`)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'agent')
    assert.equal(block.name, 'SupportBot')
    assert.equal(block.properties.length, 2)
    assert.equal(block.handlers.length, 2)
    assert.equal(block.handlers[0].event, 'new_ticket')
    assert.equal(block.handlers[1].event, 'customer.reply')
  })

  it('treats non-on lines as agent properties (not errors)', () => {
    // The agent parsing treats non-on lines as properties, not errors
    const ast = assertSuccess(`product MyApp

agent Bad
    noton event
        type string`)
    const block = ast.blocks[0] as any
    assert.equal(block.handlers.length, 0)
    assert.equal(block.properties.length, 1)
    assert.equal(block.properties[0].key, 'noton')
  })
})

// ── Skill block ─────────────────────────────────────────────────────

describe('block: skill', () => {
  it('parses a skill with input/output/method', () => {
    const ast = assertSuccess(`product MyApp

skill SummarizeText
    input text (string)
    output summary (string)
    method
        extract key points
        compress to length`)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'skill')
    assert.equal(block.name, 'SummarizeText')
    assert.equal(block.properties.length, 3)
  })
})

// ── API block (REST) ────────────────────────────────────────────────

describe('block: api REST', () => {
  it('parses a REST API with routes', () => {
    const ast = assertSuccess(`product MyApp

api REST /tasks
    get /
        return list of Task
        paginate 20
    get /:id
        return Task by id
        error 404 if not found
    post /
        accept title, description
        return created Task
        status 201
    delete /:id
        status 204`)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'api')
    assert.equal(block.protocol, 'REST')
    assert.equal(block.path, '/tasks')
    assert.equal(block.routes.length, 4)
    assert.equal(block.routes[0].method, 'get')
    assert.equal(block.routes[0].path, '/')
    assert.equal(block.routes[1].method, 'get')
    assert.equal(block.routes[1].path, '/:id')
    assert.equal(block.routes[2].method, 'post')
    assert.equal(block.routes[2].path, '/')
    assert.equal(block.routes[3].method, 'delete')
  })

  it('parses a REST API without explicit path', () => {
    const ast = assertSuccess(`product MyApp

api REST
    get /
        return items`)
    const block = ast.blocks[0] as any
    assert.equal(block.path, '/')
  })
})

// ── API block (MCP) ─────────────────────────────────────────────────

describe('block: api MCP', () => {
  it('parses an MCP API with tools/resources/prompts', () => {
    const ast = assertSuccess(`product MyApp

api MCP
    tool query_data
        description "Query data"
    resource data://example
        description "Example resource"
    prompt analyze
        description "Analyze trends"`)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'api')
    assert.equal(block.protocol, 'MCP')
    assert.equal(block.routes.length, 3)
    assert.equal(block.routes[0].method, 'tool')
    assert.equal(block.routes[0].path, 'query_data')
    assert.equal(block.routes[1].method, 'resource')
    assert.equal(block.routes[1].path, 'data://example')
    assert.equal(block.routes[2].method, 'prompt')
    assert.equal(block.routes[2].path, 'analyze')
  })
})

// ── Event block ─────────────────────────────────────────────────────

describe('block: event', () => {
  it('parses an event with properties', () => {
    const ast = assertSuccess(`product MyApp

event UserCreated
    payload user_id, email, created_at`)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'event')
    assert.equal(block.name, 'UserCreated')
  })
})

// ── Config block ────────────────────────────────────────────────────

describe('block: config', () => {
  it('parses a config block', () => {
    const ast = assertSuccess(`product MyApp

config production
    database url from env DATABASE_URL
    port 8080
    log_level "info"`)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'config')
    assert.equal(block.name, 'production')
    assert.equal(block.properties.length, 3)
  })
})

// ── Deploy block ────────────────────────────────────────────────────

describe('block: deploy', () => {
  it('parses a deploy block', () => {
    const ast = assertSuccess(`product MyApp

deploy cloudflare-workers
    routes /api/*
    memory 128mb
    timeout 30 seconds`)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'deploy')
    assert.equal(block.target, 'cloudflare-workers')
    assert.equal(block.properties.length, 3)
  })
})

// ── All 12 blocks in one file ───────────────────────────────────────

describe('multiple blocks', () => {
  it('parses a file with all block types', () => {
    const ast = assertSuccess(`product BigApp
    name "Big App"

data User
    field id
        type uuid

flow Process
    step start
        log "begin"

rule Rule1
    require x is valid

screen Page
    title "Page"

agent Bot
    on event
        do thing

skill SomeSkill
    input x (string)

api REST /items
    get /
        return items

event Something
    payload x

config dev
    port 3000

deploy docker
    port 3000`)
    assert.ok(ast.blocks.length >= 8, `Expected 8+ blocks, got ${ast.blocks.length}`)
    const types = ast.blocks.map(b => b.type)
    const expected = ['data', 'flow', 'rule', 'screen', 'agent', 'skill', 'api', 'event', 'config', 'deploy']
    for (const t of expected) {
      assert.ok((types as string[]).includes(t), `Missing block type: ${t}. Got: ${types.join(', ')}`)
    }
  })
})

// ── Value parsing ───────────────────────────────────────────────────

describe('value parsing', () => {
  it('parses string values', () => {
    const ast = assertSuccess(`product MyApp

data Item
    field name
        type "string"
    field desc
        type "custom"`)
    const block = ast.blocks[0] as any
    const nameType = block.fields[0].properties.find((p: any) => p.key === 'type')
    assert.ok(nameType?.value !== null, 'type property should have a value')
    assert.equal(nameType?.value?.type, 'string')
    assert.equal((nameType?.value as any).value, 'string')
    const descType = block.fields[1].properties.find((p: any) => p.key === 'type')
    assert.equal((descType?.value as any).value, 'custom')
  })

  it('parses number values', () => {
    const ast = assertSuccess(`product MyApp

config c
    port 8080
    rate 99
    pi 3.14`)
    const block = ast.blocks[0] as any
    const port = block.properties.find((p: any) => p.key === 'port')
    const rate = block.properties.find((p: any) => p.key === 'rate')
    const pi = block.properties.find((p: any) => p.key === 'pi')
    assert.equal(port?.value?.type, 'number')
    assert.equal((port?.value as any).value, 8080)
    assert.equal((rate?.value as any).value, 99)
    assert.equal((pi?.value as any).value, 3.14)
  })

  it('parses boolean values', () => {
    const ast = assertSuccess(`product MyApp

data Item
    field active
        type boolean
        required true
        unique false`)
    const block = ast.blocks[0] as any
    const required = block.fields[0].properties.find((p: any) => p.key === 'required')
    const unique = block.fields[0].properties.find((p: any) => p.key === 'unique')
    assert.equal(required?.value?.type, 'boolean')
    assert.equal((required?.value as any).value, true)
    assert.equal(unique?.value?.type, 'boolean')
    assert.equal((unique?.value as any).value, false)
  })

  it('parses special values: now, auto, null', () => {
    const ast = assertSuccess(`product MyApp

data Item
    field created
        type timestamp
        default now
    field auto_field
        default auto
    field nullable
        default null`)
    const block = ast.blocks[0] as any
    const now = block.fields[0].properties.find((p: any) => p.key === 'default')
    const auto = block.fields[1].properties.find((p: any) => p.key === 'default')
    const nul = block.fields[2].properties.find((p: any) => p.key === 'default')
    assert.equal(now?.value?.type, 'special')
    assert.equal((now?.value as any).keyword, 'now')
    assert.equal((auto?.value as any).keyword, 'auto')
    assert.equal((nul?.value as any).keyword, 'null')
  })

  it('parses env references', () => {
    const ast = assertSuccess(`product MyApp

config c
    api_key from env API_KEY
    db_url from env DATABASE_URL`)
    const block = ast.blocks[0] as any
    const apiKey = block.properties.find((p: any) => p.key === 'api_key')
    const dbUrl = block.properties.find((p: any) => p.key === 'db_url')
    assert.equal(apiKey?.value?.type, 'env')
    assert.equal((apiKey?.value as any).name, 'API_KEY')
    assert.equal((dbUrl?.value as any).name, 'DATABASE_URL')
  })

  it('parses list literals', () => {
    const ast = assertSuccess(`product MyApp

data Item
    field tags
        type enum
        options ["urgent", "normal", "low"]`)
    const block = ast.blocks[0] as any
    const opts = block.fields[0].properties.find((p: any) => p.key === 'options')
    assert.equal(opts?.value?.type, 'list')
    const list = (opts?.value as any).value
    assert.equal(list.length, 3)
    assert.equal(list[0].value, 'urgent')
    assert.equal(list[1].value, 'normal')
    assert.equal(list[2].value, 'low')
  })

  it('parses list literals with unquoted words', () => {
    const ast = assertSuccess(`product MyApp

config c
    items [a, b, c]`)
    const block = ast.blocks[0] as any
    const items = block.properties.find((p: any) => p.key === 'items')
    assert.equal(items?.value?.type, 'list')
    const list = (items?.value as any).value
    assert.equal(list.length, 3)
    assert.equal(list[0].value, 'a')
    assert.equal(list[1].value, 'b')
    assert.equal(list[2].value, 'c')
  })
})

// ── String parsing ──────────────────────────────────────────────────

describe('string parsing', () => {
  it('parses escape sequences: \\n, \\t, \\r, \\\\, \\"', () => {
    const ast = assertSuccess(`product MyApp

data Item
    field desc
        type string
        default "line1\\nline2\\ttabbed\\\\backslash\\"quote"`)
    const block = ast.blocks[0] as any
    const def = block.fields[0].properties.find((p: any) => p.key === 'default')
    const val = (def?.value as any).value
    assert.equal(val, 'line1\nline2\ttabbed\\backslash"quote')
  })

  it('reports unterminated string', () => {
    const r = assertErrors(`product MyApp

data Item
    field name
        type "unterminated`, 1)
    assert.ok(r.errors[0].message.includes('Unterminated string'))
  })

  it('parses strings with special characters', () => {
    const ast = assertSuccess(`product MyApp

config c
    greeting "Hello, 世界! @#$%^&*()"`)
    const block = ast.blocks[0] as any
    const g = block.properties.find((p: any) => p.key === 'greeting')
    assert.equal((g?.value as any).value, 'Hello, 世界! @#$%^&*()')
  })
})

// ── Error handling ──────────────────────────────────────────────────

describe('error handling', () => {
  it('reports unknown keywords', () => {
    const r = assertErrors(`product MyApp

badkeyword something`, 1)
    assert.ok(r.errors[0].message.includes("Unknown keyword 'badkeyword'"))
  })

  it('reports bad indentation (not multiple of 4)', () => {
    const r = assertErrors(`product MyApp
   three-spaces`, 1)
    assert.ok(r.errors[0].message.includes('Indentation must be multiples of 4 spaces'))
  })

  it('reports bad indentation with 7 spaces', () => {
    const r = assertErrors(`product MyApp
       seven-spaces`, 1)
    assert.ok(r.errors[0].message.includes('Indentation must be multiples of 4 spaces'))
  })

  it('allows 0 indentation (no error)', () => {
    const ast = assertSuccess('product MyApp')
    assert.equal(ast.product.name, 'MyApp')
  })

  it('allows 4-space indentation (no error)', () => {
    const ast = assertSuccess(`product MyApp
    name "Test"`)
    assert.equal(ast.product.properties.length, 1)
  })

  it('allows 8-space indentation (no error)', () => {
    const ast = assertSuccess(`product MyApp
data Item
        field id
            type uuid`)
    assert.equal(ast.blocks.length, 1)
  })
})

// ── Comments ────────────────────────────────────────────────────────

describe('comments', () => {
  it('skips comments', () => {
    const ast = assertSuccess(`// Top comment
product MyApp
    // Product description
    name "Test"
    // Another comment

// Block comment
data Item
    // Field comment
    field id
        // Property comment
        type uuid`)
    assert.equal(ast.product.name, 'MyApp')
    assert.equal(ast.blocks.length, 1)
  })

  it('skips inline comments', () => {
    const ast = assertSuccess(`product MyApp
    name "Test"  // inline comment`)
    assert.equal(ast.product.properties.length, 1)
  })
})

// ── Edge cases ──────────────────────────────────────────────────────

describe('edge cases', () => {
  it('parses with blank lines between properties', () => {
    const ast = assertSuccess(`product MyApp

    name "Test"

    version "1.0"`)
    assert.equal(ast.product.name, 'MyApp')
    assert.equal(ast.product.properties.length, 2)
  })

  it('parses deeply nested properties', () => {
    const ast = assertSuccess(`product MyApp

data Deep
    field nested
        type string
        validation
            min_length 1
            max_length 100
            pattern
                regex "^[a-z]+$"
                message "Only lowercase"`)
    const block = ast.blocks[0] as any
    const field = block.fields[0]
    const validation = field.properties.find((p: any) => p.key === 'validation')
    assert.ok(validation, 'validation property should exist')
    assert.equal(validation.children.length, 3, 'validation should have 3 children')
    const pattern = validation.children.find((c: any) => c.key === 'pattern')
    assert.ok(pattern, 'pattern child should exist')
    assert.equal(pattern.children.length, 2, 'pattern should have 2 children')
  })

  it('parses properties with args containing special characters', () => {
    const ast = assertSuccess(`product MyApp

flow Example
    step test
        check email matches ^[a-z]+@example\\.com$`)
    const block = ast.blocks[0] as any
    assert.equal(block.steps.length, 1)
    const check = block.steps[0].properties[0]
    assert.equal(check.key, 'check')
  })

  it('parses multiple blocks of the same type', () => {
    const ast = assertSuccess(`product MyApp

data User
    field id
        type uuid

data Product
    field id
        type uuid

data Order
    field id
        type uuid`)
    assert.equal(ast.blocks.length, 3)
    assert.equal((ast.blocks[0] as any).name, 'User')
    assert.equal((ast.blocks[1] as any).name, 'Product')
    assert.equal((ast.blocks[2] as any).name, 'Order')
  })

  it('parses a minimal skill block', () => {
    const ast = assertSuccess(`product MyApp

skill MySkill
    method
        do something`)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'skill')
    assert.equal(block.name, 'MySkill')
  })

  it('handles CRLF line endings', () => {
    const ast = assertSuccess('product MyApp\r\n    name "Test"\r\n\r\ndata Item\r\n    field id\r\n        type uuid\r\n')
    assert.equal(ast.product.name, 'MyApp')
    assert.equal(ast.blocks.length, 1)
  })

  it('errors on comments-only file', () => {
    const r = assertErrors('// just a comment\n// another comment', 1)
    assert.ok(r.errors[0].message.includes('begin with'))
    assert.equal(r.ast, null)
  })

  it('parses product name with spaces (only first word)', () => {
    // The parser only takes the first word after 'product' as the name
    const ast = assertSuccess('product My Cool App')
    assert.equal(ast.product.name, 'My')
    assert.equal(ast.blocks.length, 0)
  })

  it('parses deeply nested flow properties', () => {
    const ast = assertSuccess(`product MyApp

flow ProcessData
    trigger schedule every 1 hour
    step extract
        fetch data from API
        paginate through all results
        store raw records
    step transform
        map field_a to field_b
        set source to "api"
        merge metadata
            dedup by id
            sort by timestamp
    step load
        for each record
            if exists
                update existing
            else
                create new
        log completion
    step notify
        send email to admin
            include summary
            attach report`)
    const block = ast.blocks[0] as any
    assert.equal(block.type, 'flow')
    assert.equal(block.name, 'ProcessData')
    assert.equal(block.properties.length, 1, 'flow should have 1 property (trigger)')
    assert.equal(block.properties[0].key, 'trigger')
    assert.equal(block.steps.length, 4, 'flow should have 4 steps')
    assert.equal(block.steps[0].name, 'extract')
    assert.equal(block.steps[1].name, 'transform')
    assert.equal(block.steps[2].name, 'load')
    assert.equal(block.steps[3].name, 'notify')
    // Verify nested children in steps
    const transformStep = block.steps[1]
    const mergeProp = transformStep.properties.find((p: any) => p.key === 'merge')
    assert.ok(mergeProp, 'step transform should have merge property')
    assert.ok(mergeProp.children.length >= 2, 'merge should have child properties')
    const notifyStep = block.steps[3]
    const sendProp = notifyStep.properties.find((p: any) => p.key === 'send')
    assert.ok(sendProp, 'step notify should have send property')
    assert.ok(sendProp.children.length >= 2, 'send should have child properties')
  })
})

// ── Example files round-trip ────────────────────────────────────────

describe('example files', () => {
  const examples: Array<{ file: string; product: string; blockCount: number }> = [
    { file: 'rest-api', product: 'TaskAPI', blockCount: 9 },
    { file: 'product-page', product: 'StoreFront', blockCount: 8 },
    { file: 'support-agent', product: 'SupportAgent', blockCount: 6 },
    { file: 'data-pipeline', product: 'DataSync', blockCount: 9 },
    { file: 'lead-qualification', product: 'LeadQualifier', blockCount: 7 },
    { file: 'mcp-server', product: 'AnalyticsMCP', blockCount: 8 },
  ]

  for (const ex of examples) {
    it(`parses ${ex.file}.clear`, async () => {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const source = fs.readFileSync(
        path.resolve(process.cwd(), 'examples', `${ex.file}.clear`),
        'utf-8',
      )
      const result = parse(source, `${ex.file}.clear`)
      assert.ok(result.ast !== null, `Parse failed: ${result.errors.map(e => e.message).join(', ')}`)
      assert.equal(result.errors.length, 0, `Unexpected errors: ${result.errors.map(e => `${e.message} (${e.span.start.line}:${e.span.start.col})`).join(', ')}`)
      assert.equal(result.ast.product.name, ex.product)
      assert.equal(result.ast.blocks.length, ex.blockCount,
        `Expected ${ex.blockCount} blocks in ${ex.file}.clear, got ${result.ast.blocks.length}`)
    })
  }
})

// ── Product with only properties (no blocks) ────────────────────────

describe('edge: product only', () => {
  it('parses a product with just properties', () => {
    const ast = assertSuccess(`product MyApp
    name "My App"
    version "1.0"
    description "Just metadata, no blocks"`)
    assert.equal(ast.blocks.length, 0)
    assert.equal(ast.product.properties.length, 3)
  })
})
