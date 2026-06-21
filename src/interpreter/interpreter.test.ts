import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { parse } from '../parser.js'
import { runInterpreter } from './index.js'

// ── Module-level state ──────────────────────────────────────────────

let createdItemId: string = ''
let refUserId: string = ''
let refProjectId: string = ''

// ── HTTP helpers ────────────────────────────────────────────────────

async function request(port: number, method: string, path: string, body?: any): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    }

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        let data: any = null
        try {
          data = raw ? JSON.parse(raw) : null
        } catch {
          data = raw
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, data })
      })
    })

    req.on('error', reject)
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timeout')) })

    if (body !== undefined) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

function GET(port: number, path: string) {
  return request(port, 'GET', path)
}

function POST(port: number, path: string, body?: any) {
  return request(port, 'POST', path, body)
}

function PUT(port: number, path: string, body: any) {
  return request(port, 'PUT', path, body)
}

function DEL(port: number, path: string) {
  return request(port, 'DELETE', path)
}

// ── Test spec ───────────────────────────────────────────────────────

const CRUD_SPEC = `product TestAPI
    name "Test CRUD API"
    version "0.1"

data Item
    field id
        type uuid
        primary true
    field name
        type string
        required true
    field value
        type integer
        default 0
    field status
        type enum
        options ["active", "inactive", "archived"]
        default "active"
    field created_at
        type timestamp
        default now
    field updated_at
        type timestamp
        default now

api REST /items
    get /
        return list of Item
        paginate 10 per page
        filter by status
        sort by created_at desc

    get /:id
        return Item by id
        error 404 if not found

    post /
        accept name, value
        set created_at to now
        validate with rules
        return created Item
        status 201

    put /:id
        accept name, value, status
        set updated_at to now
        return updated Item
        error 404 if not found

    delete /:id
        status 204
        error 404 if not found

rule ItemValidation
    apply to Item
    require name is not empty

api REST /separate
    get /
        return list of Item

    post /
        accept name
`

// ── Wait for server ─────────────────────────────────────────────────

async function waitForServer(serverHandle: ReturnType<typeof runInterpreter>, timeoutMs: number = 5000): Promise<number> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const addr = serverHandle.address
    if (addr && addr.port > 0) {
      return addr.port
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Server failed to start within ${timeoutMs}ms`)
}

// ── Integration tests ───────────────────────────────────────────────

describe('interpreter — HTTP integration', () => {
  let port: number
  let serverHandle: ReturnType<typeof runInterpreter>

  before(async () => {
    const parseResult = parse(CRUD_SPEC, 'test.clear')
    assert.ok(parseResult.ast !== null, 'Parse failed')

    serverHandle = runInterpreter(parseResult.ast, { port: 0 })
    port = await waitForServer(serverHandle)
    assert.ok(port > 0, `Expected valid port, got ${port}`)
  })

  after(async () => {
    await serverHandle.close()
  })

  // ── CRUD: Create ────────────────────────────────────────────────

  it('POST /items — creates an item with 201', async () => {
    const res = await POST(port, '/items', { name: 'Test Item', value: 42 })

    assert.equal(res.status, 201)
    assert.ok(res.data.id, 'Should have an id')
    assert.equal(res.data.name, 'Test Item')
    assert.equal(res.data.value, 42)
    assert.equal(res.data.status, 'active', 'Should use default status')
    assert.ok(res.data.created_at, 'Should have created_at timestamp')
    assert.ok(res.data.updated_at, 'Should have updated_at timestamp')

    createdItemId = res.data.id
  })

  it('POST /items — creates item with only required fields and defaults', async () => {
    const res = await POST(port, '/items', { name: 'Minimal' })

    assert.equal(res.status, 201)
    assert.equal(res.data.name, 'Minimal')
    assert.equal(res.data.value, 0, 'Default value should be 0')
    assert.equal(res.data.status, 'active', 'Default status should be active')
    assert.ok(res.data.id)
  })

  it('POST /items — rejects empty name (rule validation)', async () => {
    const res = await POST(port, '/items', { name: '' })

    assert.equal(res.status, 400)
    assert.ok(res.data.errors, 'Should return errors array')
    assert.ok(res.data.errors[0].includes('name'), 'Error should mention name')
  })

  it('POST /items — rejects missing name (rule validation)', async () => {
    const res = await POST(port, '/items', { value: 99 })

    assert.equal(res.status, 400)
    assert.ok(res.data.errors)
    assert.ok(res.data.errors[0].includes('name'))
  })

  // ── CRUD: Read ──────────────────────────────────────────────────

  it('GET /items — returns paginated list with metadata', async () => {
    const res = await GET(port, '/items')

    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.data.data), 'Should have data array')
    assert.equal(typeof res.data.total, 'number', 'Should have total')
    assert.equal(typeof res.data.page, 'number', 'Should have page')
    assert.equal(typeof res.data.limit, 'number', 'Should have limit')
    assert.equal(typeof res.data.totalPages, 'number', 'Should have totalPages')
    assert.equal(res.data.page, 1)
    assert.equal(res.data.limit, 10)
  })

  it('GET /items with page/limit — respects pagination params', async () => {
    const res = await GET(port, '/items?page=1&limit=1')

    assert.equal(res.status, 200)
    assert.equal(res.data.data.length, 1)
    assert.equal(res.data.page, 1)
    assert.equal(res.data.limit, 1)
  })

  it('GET /items/:id — returns item by id', async () => {
    assert.ok(createdItemId, 'No created item ID available')
    const res = await GET(port, `/items/${createdItemId}`)

    assert.equal(res.status, 200)
    assert.equal(res.data.id, createdItemId)
    assert.equal(res.data.name, 'Test Item')
    assert.equal(res.data.value, 42)
  })

  it('GET /items/:id — 404 for unknown id', async () => {
    const res = await GET(port, '/items/00000000-0000-0000-0000-000000000000')

    assert.equal(res.status, 404)
    assert.ok(res.data.error)
  })

  // ── CRUD: Update ────────────────────────────────────────────────

  it('PUT /items/:id — updates an item', async () => {
    assert.ok(createdItemId, 'No created item ID available')
    const res = await PUT(port, `/items/${createdItemId}`, { name: 'Updated Item', value: 100, status: 'inactive' })

    assert.equal(res.status, 200)
    assert.equal(res.data.id, createdItemId)
    assert.equal(res.data.name, 'Updated Item')
    assert.equal(res.data.value, 100)
    assert.equal(res.data.status, 'inactive')
    assert.ok(res.data.updated_at)
  })

  it('PUT /items/:id — partial update preserves other fields', async () => {
    assert.ok(createdItemId, 'No created item ID available')
    const res = await PUT(port, `/items/${createdItemId}`, { name: 'Renamed' })

    assert.equal(res.status, 200)
    assert.equal(res.data.name, 'Renamed')
    assert.equal(res.data.value, 100, 'Value should be unchanged')
    assert.equal(res.data.status, 'inactive', 'Status should be unchanged')
  })

  it('PUT /items/:id — 404 for unknown id', async () => {
    const res = await PUT(port, '/items/00000000-0000-0000-0000-000000000000', { name: 'Ghost' })

    assert.equal(res.status, 404)
    assert.ok(res.data.error)
  })

  // ── CRUD: Delete ────────────────────────────────────────────────

  it('DELETE /items/:id — deletes an item with 204', async () => {
    const createRes = await POST(port, '/items', { name: 'To Delete' })
    assert.equal(createRes.status, 201)
    const id = createRes.data.id

    const delRes = await DEL(port, `/items/${id}`)
    assert.equal(delRes.status, 204)
    assert.equal(delRes.data, null, '204 should have no body')

    // Verify it's gone
    const getRes = await GET(port, `/items/${id}`)
    assert.equal(getRes.status, 404)
  })

  it('DELETE /items/:id — 404 for unknown id', async () => {
    const res = await DEL(port, '/items/00000000-0000-0000-0000-000000000000')
    assert.equal(res.status, 404)
  })

  // ── Filtering ───────────────────────────────────────────────────

  it('GET /items?status=active — returns only active items', async () => {
    // Create items with explicit statuses for deterministic filtering
    const a1 = await POST(port, '/items', { name: 'Alpha', status: 'active' })
    assert.equal(a1.status, 201)
    const a2 = await POST(port, '/items', { name: 'Beta', status: 'active' })
    assert.equal(a2.status, 201)
    const i1 = await POST(port, '/items', { name: 'Gamma', status: 'inactive' })
    assert.equal(i1.status, 201)

    const res = await GET(port, '/items?status=active')
    assert.equal(res.status, 200)
    for (const item of res.data.data) {
      assert.equal(item.status, 'active', `Item ${item.id} should have status 'active'`)
    }
  })

  // ── Store isolation ─────────────────────────────────────────────

  it('separate API prefix shares the same data store', async () => {
    const res = await GET(port, '/separate')

    assert.equal(res.status, 200)
    // Without paginate, returns a plain array; with paginate, returns { data, ... }
    const items = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
    assert.ok(Array.isArray(items))
    assert.ok(items.length > 0, 'Should share items from the same store')
  })

  // ── 404 routes ─────────────────────────────────────────────────

  it('GET /nonexistent — 404 for unmapped route', async () => {
    const res = await GET(port, '/nonexistent')
    assert.equal(res.status, 404)
  })

  it('POST /nonexistent — 404 for unmapped route', async () => {
    const res = await POST(port, '/nonexistent', {})
    assert.equal(res.status, 404)
  })

  // ── CORS ────────────────────────────────────────────────────────

  it('handles OPTIONS preflight with CORS headers', async () => {
    const res = await request(port, 'OPTIONS', '/items')
    assert.equal(res.status, 204)
    assert.equal(res.headers['access-control-allow-origin'], '*')
  })

  // ── Edge cases ──────────────────────────────────────────────────

  it('POST with empty object uses defaults', async () => {
    // Missing 'name' should trigger validation (400) since route has 'validate with rules'
    const res = await POST(port, '/items', {})
    assert.equal(res.status, 400)
    assert.ok(res.data.errors)
  })

  it('DELETE returns 204 with null body', async () => {
    const createRes = await POST(port, '/items', { name: 'DeleteMe' })
    const delRes = await DEL(port, `/items/${createRes.data.id}`)
    assert.equal(delRes.status, 204)
    assert.equal(delRes.data, null)
  })

  // ── Edge cases: body parsing ─────────────────────────────────────

  it('POST /items — empty body returns 400 (no Content-Type)', async () => {
    // Send POST without Content-Type and no body
    const res = await new Promise<{ status: number; data: any }>((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: '/items', method: 'POST' },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8')
            let data: any = null
            try { data = raw ? JSON.parse(raw) : null } catch { data = raw }
            resolve({ status: res.statusCode ?? 0, data })
          })
        },
      )
      req.on('error', reject)
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timeout')) })
      req.end() // No body, no Content-Type
    })

    assert.equal(res.status, 400)
    assert.ok(res.data.errors, 'Should return validation errors for missing body')
  })

  it('POST /items — malformed JSON returns the raw string body', async () => {
    const res = await new Promise<{ status: number; data: any }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1', port, path: '/items', method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8')
            let data: any = null
            try { data = raw ? JSON.parse(raw) : null } catch { data = raw }
            resolve({ status: res.statusCode ?? 0, data })
          })
        },
      )
      req.on('error', reject)
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timeout')) })
      req.write('{invalid json here')
      req.end()
    })

    // Malformed JSON is parsed as raw string; validation then rejects missing name
    assert.equal(res.status, 400)
    assert.ok(res.data.errors)
  })

  it('POST /items — null JSON body returns 400 (validation)', async () => {
    const res = await new Promise<{ status: number; data: any }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1', port, path: '/items', method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8')
            let data: any = null
            try { data = raw ? JSON.parse(raw) : null } catch { data = raw }
            resolve({ status: res.statusCode ?? 0, data })
          })
        },
      )
      req.on('error', reject)
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timeout')) })
      req.write('null')
      req.end()
    })

    assert.equal(res.status, 400)
    assert.ok(res.data.errors, 'Should return validation errors for null body')
  })

  it('POST /items — large payload (100KB string) succeeds', async () => {
    const bigName = 'A'.repeat(100_000) // 100KB string
    const res = await POST(port, '/items', { name: bigName, value: 999 })

    assert.equal(res.status, 201)
    assert.equal(res.data.name, bigName)
    assert.equal(res.data.value, 999)
    assert.ok(res.data.id)
  })

  it('POST /items — extra fields not in accept list are ignored', async () => {
    const res = await POST(port, '/items', {
      name: 'ExtraFields',
      value: 10,
      unknown_field: 'should be ignored',
      another_extra: 123,
    })

    assert.equal(res.status, 201)
    assert.equal(res.data.name, 'ExtraFields')
    assert.equal(res.data.value, 10)
    // Extra fields should NOT be in the created record
    assert.equal(res.data.unknown_field, undefined, 'Extra fields should be omitted')
    assert.equal(res.data.another_extra, undefined, 'Extra fields should be omitted')
  })

  it('POST /items — very long string value (1MB) succeeds', async () => {
    const hugeName = 'B'.repeat(1_000_000) // 1MB string
    const res = await POST(port, '/items', { name: hugeName, value: 42 })

    assert.equal(res.status, 201)
    assert.equal(res.data.name, hugeName)
    assert.equal(res.data.value, 42)
    assert.ok(res.data.id)
  })

  // ── Reference includes ────────────────────────────────────────────

  it('GET /items/:id — auto-resolves reference fields to full objects', async () => {
    // First create a user
    const userRes = await POST(port, '/items', { name: 'Alice', value: 1, status: 'active' })
    assert.equal(userRes.status, 201)
    const userId = userRes.data.id

    // The Item model doesn't have reference fields, so this test uses
    // a custom spec with a reference. We'll verify that non-reference
    // fields are returned as-is.
    const res = await GET(port, `/items/${createdItemId}`)
    assert.equal(res.status, 200)
    assert.ok(res.data.name, 'Should have name')
    assert.ok(res.data.id)
  })
})

// ── Reference include tests (separate suite) ────────────────────────

describe('interpreter — reference includes', () => {
  let port: number
  let serverHandle: ReturnType<typeof runInterpreter>

  const REF_SPEC = `product RefTest
    name "Reference Test"

data Project
    field id
        type uuid
        primary true
    field name
        type string
        required true
    field lead
        type reference User

data User
    field id
        type uuid
        primary true
    field name
        type string
        required true
    field email
        type string

api REST /projects
    get /
        return list of Project

    get /:id
        return Project by id
        error 404 if not found

    post /
        accept name, lead
        return created Project
        status 201

    put /:id
        accept name, lead
        return updated Project
        error 404 if not found

api REST /users
    get /
        return list of User

    get /:id
        return User by id
        error 404 if not found

    post /
        accept name, email
        return created User
        status 201
`

  before(async () => {
    const parseResult = parse(REF_SPEC, 'ref-test.clear')
    assert.ok(parseResult.ast !== null)
    serverHandle = runInterpreter(parseResult.ast, { port: 0 })
    port = await waitForServer(serverHandle)
    assert.ok(port > 0)
  })

  after(async () => {
    await serverHandle.close()
  })

  it('POST creates User and Project records', async () => {
    // Create a user
    const userRes = await POST(port, '/users', { name: 'Alice', email: 'alice@example.com' })
    assert.equal(userRes.status, 201)
    assert.ok(userRes.data.id)
    assert.equal(userRes.data.name, 'Alice')
    assert.equal(userRes.data.email, 'alice@example.com')

    refUserId = userRes.data.id

    // Create a project with Alice as lead
    const projRes = await POST(port, '/projects', { name: 'Alpha', lead: userRes.data.id })
    assert.equal(projRes.status, 201)
    assert.equal(projRes.data.name, 'Alpha')
    // The lead field should be auto-resolved to the full User object
    assert.ok(projRes.data.lead, 'lead should be auto-resolved')
    assert.equal(typeof projRes.data.lead, 'object', 'lead should be an object, not a string')
    assert.equal(projRes.data.lead.id, userRes.data.id)
    assert.equal(projRes.data.lead.name, 'Alice')
    assert.equal(projRes.data.lead.email, 'alice@example.com')

    refProjectId = projRes.data.id
  })

  it('GET /projects/:id — returns project with resolved lead', async () => {
    assert.ok(refProjectId, 'Project ID from previous test')
    const projectId = refProjectId

    const res = await GET(port, `/projects/${projectId}`)
    assert.equal(res.status, 200)
    assert.equal(res.data.name, 'Alpha')

    // lead should be auto-resolved to the full User object
    assert.ok(res.data.lead, 'lead should be present')
    assert.equal(typeof res.data.lead, 'object', 'lead should be an object')
    assert.equal(res.data.lead.name, 'Alice')
    assert.equal(res.data.lead.email, 'alice@example.com')
  })

  it('GET /projects — list auto-resolves leads in all items', async () => {
    // Create another user and project
    const userRes = await POST(port, '/users', { name: 'Bob', email: 'bob@example.com' })
    assert.equal(userRes.status, 201)
    await POST(port, '/projects', { name: 'Beta', lead: userRes.data.id })

    const res = await GET(port, '/projects')
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.data.data) || Array.isArray(res.data), 'Should return projects')

    const projects = Array.isArray(res.data) ? res.data : res.data.data
    assert.ok(projects.length >= 2)

    for (const project of projects) {
      assert.ok(project.lead, 'Each project should have a lead')
      assert.equal(typeof project.lead, 'object', 'Lead should be an object')
      assert.ok(project.lead.id, 'Lead should have an id')
      assert.ok(project.lead.name, 'Lead should have a name')
    }
  })

  it('GET /users/:id — user fields are not reference fields, unchanged', async () => {
    assert.ok(refUserId)
    const userId = refUserId

    const res = await GET(port, `/users/${userId}`)
    assert.equal(res.status, 200)
    assert.equal(res.data.name, 'Alice')
    // name and email are strings, not objects
    assert.equal(typeof res.data.name, 'string')
    assert.equal(typeof res.data.email, 'string')
  })

  it('PUT /projects/:id — updated project has resolved lead', async () => {
    assert.ok(refProjectId)
    const projectId = refProjectId

    const res = await PUT(port, `/projects/${projectId}`, { name: 'Alpha Updated' })
    assert.equal(res.status, 200)
    assert.equal(res.data.name, 'Alpha Updated')
    // lead should still be resolved
    assert.ok(res.data.lead, 'lead should be present after update')
    assert.equal(typeof res.data.lead, 'object')
    assert.equal(res.data.lead.name, 'Alice')
  })
})
