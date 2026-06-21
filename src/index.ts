#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { parse } from './parser.js'
import { validate } from './validator.js'
import { generateCode, CodegenOptions } from './codegen/index.js'
import { runInterpreter } from './interpreter/index.js'
import { ClearFile, ParseError } from './ast.js'

const VERSION = '0.2.0'

function formatError(error: ParseError, source: string, filename: string): string {
  const lines = source.split(/\r?\n/)
  const line = error.span.start.line
  const col = error.span.start.col
  const contextLine = lines[line - 1] || ''
  return [
    `Error: ${error.message}`,
    `  --> ${filename}:${line}:${col}`,
    `  ${line} | ${contextLine}`,
    `  ${' '.repeat(String(line).length + 3 + col - 1)}^`,
  ].join('\n')
}

function formatWarning(warning: string): string {
  return `Warning: ${warning}`
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    showHelp()
    return
  }

  if (command === '--version' || command === '-v') {
    console.log(`Clear v${VERSION}`)
    return
  }

  switch (command) {
    case 'check':
      await cmdCheck(args.slice(1))
      break
    case 'build':
      await cmdBuild(args.slice(1))
      break
    case 'run':
      await cmdRun(args.slice(1))
      break
    case 'init':
      await cmdInit(args.slice(1))
      break
    default:
      if (command.endsWith('.clear')) {
        await cmdRun(args)
      } else {
        console.error(`Unknown command: ${command}`)
        console.error('Run `clear --help` for usage')
        process.exit(1)
      }
  }
}

function showHelp() {
  console.log(`
Clear v${VERSION} — English to Machine Code. Nothing between.

USAGE:
  clear check <file.clear>         Parse and validate a .clear file
  clear build <file.clear> [opts]  Generate code from a .clear file
  clear run <file.clear>           Run a .clear file (direct execution)
  clear init <name>                Create a new Clear project
  clear --help                     Show this help
  clear --version                  Show version

OPTIONS (build):
  --target <ts|hono|express|fastify|koa>   Code generation target (default: ts)
  --out <file>                             Output file path (default: stdout)

OPTIONS (run):
  --port <number>   Port to run the interpreter on (default: 8080)
  --watch           Watch file for changes and hot reload
  --verbose         Log all HTTP requests with status codes and timing

EXAMPLES:
  clear check app.clear
  clear build app.clear --target express --out app.ts
  clear run app.clear
  clear run app.clear --port 3000 --verbose
  clear init my-project
`)
}

async function cmdCheck(files: string[]) {
  if (files.length === 0) {
    console.error('Usage: clear check <file.clear>')
    process.exit(1)
  }

  let hasErrors = false
  for (const filepath of files) {
    const result = processFile(filepath)
    if (!result) { hasErrors = true; continue }

    const validation = validate(result.ast)
    const isErrorFile = path.basename(filepath)

    // Print errors
    for (const err of result.errors) {
      console.error(formatError(err, result.source, isErrorFile))
      hasErrors = true
    }
    for (const err of validation.errors) {
      console.error(formatError(err, result.source, isErrorFile))
      hasErrors = true
    }

    // Print warnings
    for (const warn of validation.warnings) {
      console.warn(formatWarning(warn))
    }

    if (!hasErrors && validation.valid) {
      console.log(`\x1b[32m✓ ${filepath} — valid\x1b[0m`)
    } else if (!hasErrors) {
      console.log(`\x1b[33m⚠ ${filepath} — valid with warnings\x1b[0m`)
    }
  }

  if (hasErrors) process.exit(1)
}

async function cmdBuild(args: string[]) {
  const filepathArg = args.find(a => !a.startsWith('--'))
  const targetFlag = args.indexOf('--target')
  const outFlag = args.indexOf('--out')

  if (!filepathArg) {
    console.error('Usage: clear build <file.clear> [--target ts|hono|express] [--out <file>]')
    process.exit(1)
  }
  const filepath: string = filepathArg

  const options: CodegenOptions = {
    target: 'typescript',
  }

  if (targetFlag >= 0 && args[targetFlag + 1]) {
    const t = args[targetFlag + 1]
    if (t === 'hono') options.target = 'hono'
    else if (t === 'express') options.target = 'express'
    else options.target = 'typescript'
  }

  const result = processFile(filepath)
  if (!result) process.exit(1)

  const validation = validate(result.ast)
  if (!validation.valid) {
    for (const err of result.errors) console.error(formatError(err, result.source, filepath))
    for (const err of validation.errors) console.error(formatError(err, result.source, filepath))
    process.exit(1)
  }

  const code = generateCode(result.ast, options)

  if (outFlag >= 0 && args[outFlag + 1]) {
    const outPath = args[outFlag + 1]
    fs.writeFileSync(outPath, code, 'utf-8')
    console.log(`\x1b[32m✓ Generated ${outPath}\x1b[0m`)
  } else {
    console.log(code)
  }
}

async function cmdRun(args: string[]) {
  const filepathArg = args[0]
  if (!filepathArg) {
    console.error('Usage: clear run <file.clear>')
    process.exit(1)
  }
  const filepath: string = filepathArg

  const result = processFile(filepath)
  if (!result) process.exit(1)

  const validation = validate(result.ast)
  if (!validation.valid) {
    for (const err of result.errors) console.error(formatError(err, result.source, filepath))
    for (const err of validation.errors) console.error(formatError(err, result.source, filepath))
    process.exit(1)
  }

  // Check for interpretable blocks
  const apiBlocks = result.ast.blocks.filter(b => b.type === 'api' && (b as any).protocol === 'REST')
  const flowBlocks = result.ast.blocks.filter(b => b.type === 'flow')

  if (apiBlocks.length === 0 && flowBlocks.length === 0) {
    // Print structure info for non-executable files
    console.log(`\x1b[36mClear v${VERSION} — ${result.ast.product.name}\x1b[0m`)
    console.log(`File: ${filepath}`)
    console.log('')

    function blockName(block: any): string {
      if (block.type === 'api') return `${block.protocol} ${block.path}`
      if (block.type === 'deploy') return block.target
      if (block.type === 'config') return block.name
      return block.name ?? '?'
    }

    console.log(`Product: ${result.ast.product.name}`)
    console.log('')

    for (const block of result.ast.blocks) {
      const b = block as any
      console.log(`  ${block.type}: ${blockName(b)}`)

      if (block.type === 'data' && b.fields) {
        for (const f of b.fields) {
          const typeProp = f.properties.find((p: any) => p.key === 'type')
          const typeStr = typeProp ? typeProp.args.join(' ') : 'unknown'
          console.log(`    field ${f.name}: ${typeStr}`)
        }
      }
      if (block.type === 'flow' && b.steps) {
        for (const s of b.steps) {
          console.log(`    step ${s.name}`)
        }
      }
      if (block.type === 'agent' && b.handlers) {
        for (const h of b.handlers) {
          console.log(`    on ${h.event}`)
        }
      }
      if (block.type === 'api' && b.routes) {
        for (const r of b.routes) {
          console.log(`    ${r.method} ${r.path}`)
        }
      }
      if (block.type === 'screen' && b.sections) {
        for (const s of b.sections) {
          console.log(`    section ${s.name}`)
        }
      }
      console.log('')
    }

    const hints: string[] = []
    if (result.ast.blocks.some(b => b.type === 'flow')) hints.push('flows can be run with the interpreter')
    if (result.ast.blocks.some(b => b.type === 'api')) hints.push('add "REST" protocol to enable API server')
    if (hints.length === 0) hints.push('try adding a "data" block and "api REST" block')
    console.log(`\x1b[33m⚠ No executable blocks found — ${hints.join(', ')}\x1b[0m`)
    return
  }

  // Parse flags
  const portFlag = args.indexOf('--port')
  const port = portFlag >= 0 && args[portFlag + 1] ? parseInt(args[portFlag + 1], 10) : undefined
  const watch = args.includes('--watch')
  const verbose = args.includes('--verbose')

  // Resolve the file path for watching
  const resolvedPath = path.resolve(filepath)

  // Run the interpreter
  try {
    runInterpreter(result.ast, { port, watch: watch ? resolvedPath : undefined, verbose })
  } catch (err: any) {
    console.error('Interpreter error:', err.message)
    process.exit(1)
  }
}

async function cmdInit(args: string[]) {
  const name = args[0] || 'my-app'
  const dir = path.resolve(process.cwd(), name)

  if (fs.existsSync(dir)) {
    console.error(`Directory '${name}' already exists`)
    process.exit(1)
  }

  fs.mkdirSync(dir, { recursive: true })

  const template = `product ${name.charAt(0).toUpperCase() + name.slice(1)}
    name "${name}"
    version "0.1"
    description "A Clear project"

data Item
    field id
        type uuid
        primary true
    field name
        type string
        required true
    field created_at
        type timestamp
        default now

flow Hello
    step greet
        log "Hello from Clear!"
    step done
        log "Flow complete"

config development
    log_level "debug"

deploy cloudflare-workers
    memory 128mb
`

  fs.writeFileSync(path.join(dir, 'main.clear'), template, 'utf-8')
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\ndist/\n.clear-tmp.ts\n')

  console.log(`\x1b[32m✓ Initialized Clear project '${name}'\x1b[0m`)
  console.log(`  cd ${name}`)
  console.log(`  clear check main.clear`)
  console.log(`  clear run main.clear`)
}

function processFile(filepath: string): { source: string; ast: ClearFile; errors: ParseError[] } | null {
  try {
    const resolvedPath = path.resolve(process.cwd(), filepath)
    const source = fs.readFileSync(resolvedPath, 'utf-8')
    const result = parse(source, filepath)
    if (result.ast === null) {
      for (const err of result.errors) {
        console.error(formatError(err, source, filepath))
      }
      return null
    }
    return { source, ast: result.ast, errors: result.errors }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.error(`File not found: ${filepath}`)
    } else {
      console.error(`Error reading file: ${err.message}`)
    }
    return null
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
