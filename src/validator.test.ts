import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from './parser.js'
import { validate } from './validator.js'

// ── Helpers ─────────────────────────────────────────────────────────

function assertValid(source: string, filename = 'test.clear') {
  const parseResult = parse(source, filename)
  assert.ok(parseResult.ast !== null, `Parse failed: ${parseResult.errors.map(e => e.message).join(', ')}`)
  const result = validate(parseResult.ast)
  assert.ok(result.valid, `Expected valid, got errors: ${result.errors.map(e => e.message).join(', ')}`)
  return result
}

function assertErrors(source: string, expectedCount: number, filename = 'test.clear') {
  const parseResult = parse(source, filename)
  assert.ok(parseResult.ast !== null, `Parse failed: ${parseResult.errors.map(e => e.message).join(', ')}`)
  const result = validate(parseResult.ast)
  assert.equal(result.errors.length, expectedCount,
    `Expected ${expectedCount} validation errors, got ${result.errors.length}: ${result.errors.map(e => e.message).join(', ')}`)
  return result
}

function assertWarnings(source: string, expectedCount: number, filename = 'test.clear') {
  const parseResult = parse(source, filename)
  assert.ok(parseResult.ast !== null, `Parse failed: ${parseResult.errors.map(e => e.message).join(', ')}`)
  const result = validate(parseResult.ast)
  assert.equal(result.warnings.length, expectedCount,
    `Expected ${expectedCount} warnings, got ${result.warnings.length}: ${result.warnings.join(', ')}`)
  return result
}

// ── Duplicate detection ─────────────────────────────────────────────

describe('duplicate detection', () => {
  it('detects duplicate block names', () => {
    const r = assertErrors(`product MyApp

data User
    field id
        type uuid

data User
    field id
        type uuid`, 1)
    assert.ok(r.errors[0].message.includes("Duplicate block name 'User'"))
  })

  it('detects duplicate block names across different types', () => {
    const r = assertErrors(`product MyApp

data User
    field id
        type uuid

flow User
    step x
        log "hi"`, 1)
    assert.ok(r.errors[0].message.includes("Duplicate block name 'User'"))
  })

  it('detects duplicate field names in data block', () => {
    const r = assertErrors(`product MyApp

data Item
    field id
        type uuid
    field id
        type string`, 1)
    assert.ok(r.errors[0].message.includes("Duplicate field 'id' in data block 'Item'"))
  })

  it('detects duplicate step names in flow block', () => {
    const r = assertErrors(`product MyApp

flow Process
    step init
        log "start"
    step init
        log "again"
    step done
        log "end"`, 1)
    assert.ok(r.errors[0].message.includes("Duplicate step 'init' in flow 'Process'"))
  })

  it('passes with unique block names', () => {
    const r = assertValid(`product MyApp

data User
    field id
        type uuid

data Product
    field id
        type uuid

data Order
    field id
        type uuid`)
    assert.equal(r.errors.length, 0)
  })

  it('passes with unique field names', () => {
    const r = assertValid(`product MyApp

data Item
    field id
        type uuid
    field name
        type string
    field price
        type float`)
    assert.equal(r.errors.length, 0)
  })

  it('passes with unique step names', () => {
    const r = assertValid(`product MyApp

flow Process
    step start
        log "begin"
    step process
        log "processing"
    step finish
        log "done"`)
    assert.equal(r.errors.length, 0)
  })
})

// ── Missing properties ──────────────────────────────────────────────

describe('missing properties', () => {
  it('requires data block to have a name', () => {
    // The parser won't produce a nameless data block, but we test the validator path
    // A data block with an empty-ish name from parser
    const r = assertErrors(`product MyApp

data 
    field id
        type uuid`, 1)
    assert.ok(r.errors[0].message.includes('Data block must have a name'))
  })

  it('requires data block to have fields', () => {
    const r = assertErrors(`product MyApp

data Empty`, 1)
    assert.ok(r.errors[0].message.includes("Data block 'Empty' has no fields"))
  })

  it('requires each field to have a type property', () => {
    const r = assertErrors(`product MyApp

data Item
    field name
        required true`, 1)
    assert.ok(r.errors[0].message.includes("Field 'name' in 'Item' is missing required 'type' property"))
  })

  it('reports multiple fields missing type', () => {
    const r = assertErrors(`product MyApp

data Item
    field a
        required true
    field b
        unique true
    field c
        type string`, 2)
    // Only a and b are missing type; c has it
    assert.ok(r.errors.some(e => e.message.includes("Field 'a'")))
    assert.ok(r.errors.some(e => e.message.includes("Field 'b'")))
  })

  it('requires flow block to have a name', () => {
    const r = assertErrors(`product MyApp

flow 
    step x
        log "hi"`, 1)
    assert.ok(r.errors[0].message.includes('Flow block must have a name'))
  })

  it('requires flow block to have steps', () => {
    const r = assertErrors(`product MyApp

flow EmptyFlow`, 1)
    assert.ok(r.errors[0].message.includes("Flow 'EmptyFlow' has no steps"))
  })

  it('requires rule block to have a name', () => {
    const r = assertErrors(`product MyApp

rule 
    require x is not empty`, 1)
    assert.ok(r.errors[0].message.includes('Rule block must have a name'))
  })

  it('requires rule block to have require and apply properties', () => {
    const r = assertErrors(`product MyApp

rule R1`, 1)
    assert.ok(r.errors[0].message.includes("Rule 'R1' should have 'apply' and 'require' properties"))
  })

  it('passes rule with both require and apply', () => {
    const r = assertValid(`product MyApp

rule R1
    apply to User
    require x is not empty`)
    assert.equal(r.errors.length, 0)
  })

  it('passes rule with only require', () => {
    // The validator says "should have 'apply' and 'require'" - only errors if NEITHER exists
    const r = assertValid(`product MyApp

rule R1
    require x is not empty`)
    assert.equal(r.errors.length, 0)
  })

  it('requires screen block to have a name', () => {
    const r = assertErrors(`product MyApp

screen`, 1)
    assert.ok(r.errors[0].message.includes('Screen block must have a name'))
  })

  it('requires agent block to have a name', () => {
    const r = assertErrors(`product MyApp

agent`, 2)
    assert.ok(r.errors[0].message.includes('Agent block must have a name'))
    assert.ok(r.errors[1].message.includes("Agent 'undefined' has no event handlers"))
  })

  it('requires agent block to have handlers', () => {
    const r = assertErrors(`product MyApp

agent EmptyAgent`, 1)
    assert.ok(r.errors[0].message.includes("Agent 'EmptyAgent' has no event handlers"))
  })

  it('requires api block to specify a protocol', () => {
    const r = assertErrors(`product MyApp

api`, 2)
    assert.ok(r.errors[0].message.includes('API block must specify a protocol'))
    assert.ok(r.errors[1].message.includes("API 'undefined /' has no routes"))
  })

  it('requires api block to have routes', () => {
    const r = assertErrors(`product MyApp

api REST /empty`, 1)
    assert.ok(r.errors[0].message.includes("API 'REST /empty' has no routes"))
  })

  it('requires config block to have a name', () => {
    const r = assertErrors(`product MyApp

config`, 1)
    assert.ok(r.errors[0].message.includes('Config block must have a name'))
  })

  it('requires deploy block to have a target', () => {
    const r = assertErrors(`product MyApp

deploy`, 1)
    assert.ok(r.errors[0].message.includes('Deploy block must specify a target'))
  })

  it('requires event block to have a name', () => {
    const r = assertErrors(`product MyApp

event`, 1)
    assert.ok(r.errors[0].message.includes('Event block must have a name'))
  })

  it('requires skill block to have a name', () => {
    const r = assertErrors(`product MyApp

skill`, 1)
    assert.ok(r.errors[0].message.includes('Skill block must have a name'))
  })

  it('requires example block to have a description', () => {
    const r = assertErrors(`product MyApp

example`, 1)
    assert.ok(r.errors[0].message.includes('Example block should have a description'))
  })
})

// ── Reference resolution ────────────────────────────────────────────

describe('reference resolution', () => {
  // validateReferences is called from validateFlow on block-level properties.
  // It only checks prop.key === 'type' for 'reference X' and 'list of X' patterns,
  // and prop.key === 'apply' for apply-target validation.
  // Tests must use flow block properties with key 'type' to trigger these checks.

  it('detects reference to unknown data block', () => {
    const r = assertErrors(`product MyApp

data User
    field id
        type uuid

flow Test
    trigger schedule
    step x
        log "hi"
    type reference Task`, 1)
    assert.ok(r.errors[0].message.includes("Reference to unknown block 'Task'"))
  })

  it('passes reference to known data block', () => {
    const r = assertValid(`product MyApp

data User
    field id
        type uuid

flow Test
    trigger schedule
    step x
        log "hi"
    type reference User`)
    assert.equal(r.errors.length, 0)
  })

  it('detects unknown PascalCase type in list of', () => {
    const r = assertErrors(`product MyApp

flow Test
    trigger schedule
    step x
        log "hi"
    type list of UnknownType`, 1)
    assert.ok(r.errors[0].message.includes("Unknown type 'UnknownType'"))
  })

  it('passes list of primitive type', () => {
    const r = assertValid(`product MyApp

flow A
    trigger x
    step x
        log "hi"
    type list of string

flow B
    trigger x
    step x
        log "hi"
    type list of integer

flow C
    trigger x
    step x
        log "hi"
    type list of float

flow D
    trigger x
    step x
        log "hi"
    type list of boolean`)
    assert.equal(r.errors.length, 0)
  })

  it('passes list of known data block', () => {
    const r = assertValid(`product MyApp

data User
    field id
        type uuid

flow Test
    trigger schedule
    step x
        log "hi"
    type list of User`)
    assert.equal(r.errors.length, 0)
  })

  it('passes list of special primitives (timestamp/uuid/url/email/map/enum)', () => {
    const r = assertValid(`product MyApp

flow A
    trigger a
    step x
        log "hi"
    type list of timestamp

flow B
    trigger b
    step x
        log "hi"
    type list of uuid

flow C
    trigger c
    step x
        log "hi"
    type list of url

flow D
    trigger d
    step x
        log "hi"
    type list of email`)
    assert.equal(r.errors.length, 0)
  })

  it('ignores lowercase types in list of (not PascalCase, skipped)', () => {
    // lowercaseCustom is not PascalCase, so it won't be checked as a reference
    const r = assertValid(`product MyApp

flow Test
    trigger x
    step x
        log "hi"
    type list of lowercaseCustom`)
    assert.equal(r.errors.length, 0)
  })

  it('detects unknown PascalCase type in nested children', () => {
    const r = assertErrors(`product MyApp

flow Test
    trigger schedule
        type list of UnknownType
    step x
        log "hi"`, 1)
    // validateReferences recurses into children, catching this nested reference
    assert.ok(r.errors[0].message.includes("Unknown type 'UnknownType'"))
  })
})

// ── Naming conventions (warnings) ───────────────────────────────────

describe('naming conventions', () => {
  it('warns on lowercase block names for data', () => {
    const r = assertWarnings(`product MyApp

data user
    field id
        type uuid`, 1)
    assert.ok(r.warnings[0].includes('user'))
    assert.ok(r.warnings[0].includes('PascalCase'))
  })

  it('warns on lowercase block names for flow', () => {
    const r = assertWarnings(`product MyApp

flow process
    step x
        log "hi"`, 1)
    assert.ok(r.warnings[0].includes('process'))
  })

  it('warns on lowercase block names for multiple blocks', () => {
    const r = assertWarnings(`product MyApp

data user
    field id
        type uuid

data product
    field id
        type uuid`, 2)
    assert.equal(r.warnings.length, 2)
  })

  it('does not warn on PascalCase blocks', () => {
    const r = assertWarnings(`product MyApp

data User
    field id
        type uuid

flow ProcessData
    step x
        log "hi"

rule CheckIt
    require x is not empty`, 0)
    assert.equal(r.warnings.length, 0)
  })

  it('does not warn on config block lowercase name', () => {
    const r = assertWarnings(`product MyApp

config production
    port 8080`, 0)
    assert.equal(r.warnings.length, 0)
  })

  it('does not warn on deploy block lowercase target', () => {
    const r = assertWarnings(`product MyApp

deploy docker`, 0)
    assert.equal(r.warnings.length, 0)
  })

  it('warns on mixed-case block names that start lowercase', () => {
    const r = assertWarnings(`product MyApp

data myData
    field id
        type uuid`, 1)
    assert.ok(r.warnings[0].includes('myData'))
  })
})

// ── All 12 block type validations ───────────────────────────────────

describe('block type validations', () => {
  it('validates a data block successfully', () => {
    const r = assertValid(`product MyApp

data User
    field id
        type uuid
        primary true
    field email
        type string
        required true
    field created_at
        type timestamp
        default now`)
    assert.equal(r.errors.length, 0)
    assert.equal(r.warnings.length, 0)
  })

  it('validates a flow block successfully', () => {
    const r = assertValid(`product MyApp

flow Onboarding
    description "New user onboarding"
    step send_email
        log "sending..."
    step verify
        log "verifying..."
    step complete
        log "done"`)
    assert.equal(r.errors.length, 0)
    assert.equal(r.warnings.length, 0)
  })

  it('validates a rule block successfully', () => {
    const r = assertValid(`product MyApp

rule PasswordStrength
    apply to User.password
    require length >= 8
    require contains uppercase`)
    assert.equal(r.errors.length, 0)
    assert.equal(r.warnings.length, 0)
  })

  it('validates a screen block successfully', () => {
    const r = assertValid(`product MyApp

screen Dashboard
    title "Overview"
    layout "grid"
    section metrics
        show total_users as card
    section activity
        show recent_events as table`)
    assert.equal(r.errors.length, 0)
    assert.equal(r.warnings.length, 0)
  })

  it('validates an agent block successfully', () => {
    const r = assertValid(`product MyApp

agent SupportBot
    role "Customer support"
    personality "Helpful"
    on new_ticket
        classify intent
    on customer.reply
        draft response`)
    assert.equal(r.errors.length, 0)
    assert.equal(r.warnings.length, 0)
  })

  it('validates a skill block successfully', () => {
    const r = assertValid(`product MyApp

skill SummarizeText
    input text (string)
    output summary (string)
    method
        extract key points
        compress to length`)
    assert.equal(r.errors.length, 0)
    assert.equal(r.warnings.length, 0)
  })

  it('validates a REST API block successfully', () => {
    const r = assertValid(`product MyApp

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
        status 201`)
    assert.equal(r.errors.length, 0)
  })

  it('validates an MCP API block successfully', () => {
    const r = assertValid(`product MyApp

api MCP
    tool query_data
        description "Query data"
    resource data://example
        description "Example resource"
    prompt analyze
        description "Analyze trends"`)
    assert.equal(r.errors.length, 0)
  })

  it('validates an event block successfully', () => {
    const r = assertValid(`product MyApp

event UserCreated
    payload user_id, email, created_at`)
    assert.equal(r.errors.length, 0)
    assert.equal(r.warnings.length, 0)
  })

  it('validates a config block successfully', () => {
    const r = assertValid(`product MyApp

config production
    database url from env DATABASE_URL
    port 8080
    log_level "info"`)
    assert.equal(r.errors.length, 0)
    assert.equal(r.warnings.length, 0)
  })

  it('validates a deploy block successfully', () => {
    const r = assertValid(`product MyApp

deploy cloudflare-workers
    routes /api/*
    memory 128mb
    timeout 30 seconds`)
    assert.equal(r.errors.length, 0)
    assert.equal(r.warnings.length, 0)
  })

  it('validates an example block successfully', () => {
    const r = assertValid(`product MyApp

example "New user can sign up"
    given user with email "test@test.com"
    when submit form
    then user created`)
    assert.equal(r.errors.length, 0)
    assert.equal(r.warnings.length, 0)
  })
})

// ── Combined validation ─────────────────────────────────────────────

describe('combined validation', () => {
  it('validates a file with all 10 block types', () => {
    const r = assertValid(`product BigApp
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
    port 3000

example "Basic example"
    given something
    then result`)
    assert.equal(r.errors.length, 0)
    // At least the data blocks (User, Page, Bot, SomeSkill, etc.) are PascalCase
    // 'dev' is lowercase config (exempt), 'docker' is lowercase deploy (exempt)
    // 'event' handler 'Something' is PascalCase
  })

  it('reports multiple validation errors at once', () => {
    const r = assertErrors(`product MyApp

data User
    field id
        type uuid

data User
    field id
        type uuid

data Empty

flow
    step x
        log "hi"`, 3)
    // 1: duplicate User, 2: Empty has no fields, 3: flow must have name
    // (no "has no steps" error because flow has 1 step)
    assert.equal(r.errors.length, 3)
  })
})

// ── Example files round-trip ────────────────────────────────────────

describe('example files validation', () => {
  const examples = [
    'rest-api', 'product-page', 'support-agent',
    'data-pipeline', 'lead-qualification', 'mcp-server',
  ]

  for (const ex of examples) {
    it(`validates ${ex}.clear`, async () => {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const source = fs.readFileSync(
        path.resolve(process.cwd(), 'examples', `${ex}.clear`),
        'utf-8',
      )
      const parseResult = parse(source, `${ex}.clear`)
      assert.ok(parseResult.ast !== null, `Parse failed for ${ex}`)
      const result = validate(parseResult.ast)
      assert.ok(result.valid, `Validation failed for ${ex}: ${result.errors.map(e => e.message).join(', ')}`)
    })
  }
})

// ── Symbols map ─────────────────────────────────────────────────────

describe('symbols map', () => {
  it('populates symbols map with all blocks', () => {
    const r = assertValid(`product MyApp

data User
    field id
        type uuid

data Product
    field id
        type uuid

flow Process
    step x
        log "hi"

rule Rule1
    require x is not empty

screen Page
    title "Page"`)
    assert.equal(r.symbols.size, 5)
    assert.ok(r.symbols.has('User'))
    assert.ok(r.symbols.has('Product'))
    assert.ok(r.symbols.has('Process'))
    assert.ok(r.symbols.has('Rule1'))
    assert.ok(r.symbols.has('Page'))
    assert.equal(r.symbols.get('User')?.type, 'data')
    assert.equal(r.symbols.get('Process')?.type, 'flow')
    assert.equal(r.symbols.get('Rule1')?.type, 'rule')
    assert.equal(r.symbols.get('Page')?.type, 'screen')
  })
})
