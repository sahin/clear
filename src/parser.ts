import {
  ClearFile, ProductBlock, TopLevelBlock, Property, Value,
  FieldDef, ScreenSection, FlowStep, AgentHandler,
  ApiRoute, Span, Location, ParseResult, ParseError,
} from './ast.js'

export function parse(source: string, filename: string = '<stdin>'): ParseResult {
  const errors: ParseError[] = []
  const lines = source.split(/\r?\n/)

  let pos = 0

  function loc(): Location {
    const line = pos < lines.length ? pos : lines.length - 1
    return { line: line + 1, col: 1 }
  }

  function spanFrom(start: Location): Span {
    return { start, end: loc() }
  }

  function currentLine(): string {
    return pos < lines.length ? lines[pos] : ''
  }

  function isEOF(): boolean {
    return pos >= lines.length
  }

  function skipEmpty(): boolean {
    while (!isEOF()) {
      const trimmed = currentLine().trim()
      if (trimmed === '' || trimmed.startsWith('//')) {
        pos++
      } else {
        return true
      }
    }
    return false
  }

  function getIndent(line: string): number {
    let i = 0
    while (i < line.length && line[i] === ' ') i++
    if (i > 0 && line[i] !== ' ' && i % 4 !== 0) {
      errors.push({
        message: `Indentation must be multiples of 4 spaces (found ${i} spaces)`,
        span: { start: { line: pos + 1, col: 1 }, end: { line: pos + 1, col: i + 1 } },
      })
    }
    return i
  }

  function parseString(line: string, startIdx: number): { value: string; endIdx: number } | null {
    let i = startIdx
    while (i < line.length && line[i] === ' ') i++
    if (i >= line.length || line[i] !== '"') return null
    i++
    let result = ''
    while (i < line.length) {
      if (line[i] === '"' && (i === 0 || line[i - 1] !== '\\')) {
        return { value: result, endIdx: i + 1 }
      }
      if (line[i] === '\\' && i + 1 < line.length) {
        const next = line[i + 1]
        if (next === 'n') result += '\n'
        else if (next === 't') result += '\t'
        else if (next === 'r') result += '\r'
        else if (next === '\\') result += '\\'
        else if (next === '"') result += '"'
        else result += next
        i += 2
      } else {
        result += line[i]
        i++
      }
    }
    errors.push({
      message: 'Unterminated string literal',
      span: { start: { line: pos + 1, col: startIdx + 1 }, end: { line: pos + 1, col: line.length } },
    })
    return null
  }

  function parseValueOnLine(line: string, startIdx: number): Value | null {
    let i = startIdx
    while (i < line.length && line[i] === ' ') i++
    if (i >= line.length) return null

    // String
    if (line[i] === '"') {
      const r = parseString(line, i)
      if (!r) return null
      return { type: 'string', value: r.value }
    }

    // Boolean
    if (line.startsWith('true', i)) return { type: 'boolean', value: true }
    if (line.startsWith('false', i)) return { type: 'boolean', value: false }

    // Special keywords
    if (line.startsWith('now', i) && (i + 3 >= line.length || line[i + 3] === ' ' || line[i + 3] === '\r')) {
      return { type: 'special', keyword: 'now' }
    }
    if (line.startsWith('auto', i) && (i + 4 >= line.length || line[i + 4] === ' ' || line[i + 4] === '\r')) {
      return { type: 'special', keyword: 'auto' }
    }
    if (line.startsWith('null', i) && (i + 4 >= line.length || line[i + 4] === ' ' || line[i + 4] === '\r')) {
      return { type: 'special', keyword: 'null' }
    }

    // env <NAME>
    if (line.startsWith('from env ', i)) {
      const name = line.slice(i + 9).trim()
      return { type: 'env', name }
    }

    // Number (integer or float)
    const numMatch = line.slice(i).match(/^(\d+(?:\.\d+)?)\b/)
    if (numMatch) {
      return { type: 'number', value: parseFloat(numMatch[1]) }
    }

    // List literal [...]
    if (line[i] === '[') {
      const values: Value[] = []
      let j = i + 1
      while (j < line.length) {
        if (line[j] === ']') {
          j++
          break
        }
        if (line[j] === ',') { j++; continue }
        if (line[j] === ' ') { j++; continue }
        const rest = line.slice(j)
        if (rest.startsWith('"')) {
          const r = parseString(line, j)
          if (r) {
            values.push({ type: 'string', value: r.value })
            j = r.endIdx
            continue
          }
        }
        const word = rest.match(/^(\S+?)(?:,|\s|\])/)
        if (word) {
          values.push({ type: 'string', value: word[1] })
          j += word[0].length
        } else {
          j++
        }
      }
      return { type: 'list', value: values }
    }

    return null
  }

  function parsePropertyLine(line: string): { key: string; args: string[]; value: Value | null } | null {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('//')) return null

    const parts = trimmed.split(/\s+/)
    if (parts.length === 0) return null

    const key = parts[0]
    const args: string[] = []
    let value: Value | null = null

    if (parts.length > 1) {
      const rest = trimmed.slice(key.length).trim()

      // Try to parse the rest as a single value first
      const val = parseValueOnLine(rest, 0)
      if (val) {
        // Check if the parsed value consumed the entire rest
        const valStr = rest.trim()
        const consumed = getValueLength(valStr)
        if (consumed >= valStr.length) {
          value = val
        } else {
          // Value only consumed part - the rest is additional context
          // For properties like "given 3 tasks with status", 
          // treat the whole rest as args with value embedded
          args.push(rest)
        }
      } else {
        args.push(rest)
      }
    }

    return { key, args, value }
  }

  function getValueLength(s: string): number {
    if (s.startsWith('"')) {
      let i = 1
      while (i < s.length) {
        if (s[i] === '"' && s[i-1] !== '\\') return i + 1
        i++
      }
      return s.length
    }
    if (s.startsWith('true') || s.startsWith('false')) {
      return s.startsWith('true') ? 4 : 5
    }
    if (s.startsWith('now') || s.startsWith('auto') || s.startsWith('null')) {
      const kw = s.startsWith('now') ? 3 : 4
      if (s.length === kw || s[kw] === ' ' || s[kw] === '\r' || s[kw] === ']') return kw
      return 0
    }
    const numMatch = s.match(/^\d+(?:\.\d+)?/)
    if (numMatch) {
      const len = numMatch[0].length
      if (s.length === len || s[len] === ' ' || s[len] === '\r' || s[len] === ']') return len
      return len
    }
    if (s.startsWith('[')) {
      let depth = 1
      let i = 1
      while (i < s.length && depth > 0) {
        if (s[i] === '[') depth++
        else if (s[i] === ']') depth--
        i++
      }
      return i
    }
    if (s.startsWith('from env ')) {
      return s.indexOf(' ', 9) >= 0 ? s.indexOf(' ', 9) : s.length
    }
    return 0
  }

  function parseProperties(indent: number): Property[] {
    const props: Property[] = []
    while (!isEOF()) {
      const line = currentLine()
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('//')) {
        pos++
        continue
      }
      const lineIndent = getIndent(line)
      if (lineIndent <= indent) break
      const start = loc()
      // Check if this is a sub-block (like a step, section, handler, route, field)
      // Sub-blocks have children which are further-indented properties
      const parsed = parsePropertyLine(line)
      if (!parsed) { pos++; continue }

      const prop: Property = {
        key: parsed.key,
        args: parsed.args,
        value: parsed.value,
        children: [],
        span: { start, end: start },
      }

      pos++
      // Check for children (next lines with deeper indent)
      if (!isEOF()) {
        // Skip empty/comment lines to find actual child content
        let scanPos = pos
        let scanIndent = 0
        while (scanPos < lines.length) {
          const sl = lines[scanPos].trim()
          if (sl !== '' && !sl.startsWith('//')) {
            scanIndent = getIndent(lines[scanPos])
            break
          }
          scanPos++
        }
        if (scanIndent > lineIndent) {
          prop.children = parseProperties(lineIndent)
        }
      }
      prop.span.end = loc()
      props.push(prop)
    }
    return props
  }

  function parseFields(indent: number): FieldDef[] {
    const fields: FieldDef[] = []
    while (!isEOF()) {
      const line = currentLine()
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('//')) { pos++; continue }
      const lineIndent = getIndent(line)
      if (lineIndent <= indent) break
      const start = loc()
      const parts = trimmed.split(/\s+/)
      if (parts[0] !== 'field') {
        errors.push({
          message: `Expected 'field' keyword, got '${parts[0]}'`,
          span: { start, end: loc() },
        })
        pos++
        continue
      }
      const fieldName = parts[1]
      pos++
      const properties = parseProperties(lineIndent)
      fields.push({ name: fieldName, properties, span: { start, end: loc() } })
    }
    return fields
  }

  function parseSections(indent: number): ScreenSection[] {
    const sections: ScreenSection[] = []
    while (!isEOF()) {
      const line = currentLine()
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('//')) { pos++; continue }
      const lineIndent = getIndent(line)
      if (lineIndent <= indent) break
      const start = loc()
      const parts = trimmed.split(/\s+/)
      if (parts[0] !== 'section') {
        errors.push({
          message: `Expected 'section' keyword, got '${parts[0]}'`,
          span: { start, end: loc() },
        })
        pos++
        continue
      }
      const sectionName = parts[1]
      pos++
      const properties = parseProperties(lineIndent)
      sections.push({ name: sectionName, properties, span: { start, end: loc() } })
    }
    return sections
  }

  function parseSteps(indent: number): FlowStep[] {
    const steps: FlowStep[] = []
    while (!isEOF()) {
      const line = currentLine()
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('//')) { pos++; continue }
      const lineIndent = getIndent(line)
      if (lineIndent <= indent) break
      const start = loc()
      const parts = trimmed.split(/\s+/)
      if (parts[0] !== 'step') {
        errors.push({
          message: `Expected 'step' keyword, got '${parts[0]}'`,
          span: { start, end: loc() },
        })
        pos++
        continue
      }
      const stepName = parts[1]
      pos++
      const properties = parseProperties(lineIndent)
      steps.push({ name: stepName, properties, span: { start, end: loc() } })
    }
    return steps
  }

  function parseHandlers(indent: number): AgentHandler[] {
    const handlers: AgentHandler[] = []
    while (!isEOF()) {
      const line = currentLine()
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('//')) { pos++; continue }
      const lineIndent = getIndent(line)
      if (lineIndent <= indent) break
      const start = loc()
      const parts = trimmed.split(/\s+/)
      if (parts[0] !== 'on') {
        errors.push({
          message: `Expected 'on' keyword for agent handler, got '${parts[0]}'`,
          span: { start, end: loc() },
        })
        pos++
        continue
      }
      const event = parts.slice(1).join(' ')
      pos++
      const properties = parseProperties(lineIndent)
      handlers.push({ event, properties, span: { start, end: loc() } })
    }
    return handlers
  }

  function parseRoutes(indent: number): ApiRoute[] {
    const routes: ApiRoute[] = []
    while (!isEOF()) {
      const line = currentLine()
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('//')) { pos++; continue }
      const lineIndent = getIndent(line)
      if (lineIndent <= indent) break
      const start = loc()
      const parts = trimmed.split(/\s+/)
      const method = parts[0]
      const path = parts.slice(1).join(' ') || '/'
      pos++
      const properties = parseProperties(lineIndent)
      routes.push({ method, path, properties, span: { start, end: loc() } })
    }
    return routes
  }

  function parseProduct(): ProductBlock | null {
    skipEmpty()
    if (isEOF()) {
      errors.push({ message: 'File must begin with a product declaration', span: { start: loc(), end: loc() } })
      return null
    }
    const start = loc()
    const line = currentLine()
    const parts = line.trim().split(/\s+/)
    if (parts[0] !== 'product') {
      errors.push({
        message: `File must begin with 'product' keyword, got '${parts[0]}'`,
        span: { start, end: loc() },
      })
      return null
    }
    const name = parts[1]
    pos++
    const properties = parseProperties(0)
    return { type: 'product', name, properties, span: { start, end: loc() } }
  }

  function parseTopLevel(productIndent: number): TopLevelBlock[] {
    const blocks: TopLevelBlock[] = []
    while (!isEOF()) {
      skipEmpty()
      if (isEOF()) break
      const start = loc()
      const line = currentLine()
      const lineIndent = getIndent(line)
      if (lineIndent < productIndent) break
      const trimmed = line.trim()
      const parts = trimmed.split(/\s+/)
      const keyword = parts[0]

      switch (keyword) {
        case 'data': {
          const name = parts[1]
          pos++
          const fields = parseFields(lineIndent)
          blocks.push({ type: 'data', name, fields, span: { start, end: loc() } })
          break
        }
        case 'screen': {
          const name = parts[1]
          pos++
          // Read properties until we hit a 'section'
          const props: Property[] = []
          const sections: ScreenSection[] = []
          // We need to be smarter: read all properties and sections in order
          while (!isEOF()) {
            const l = currentLine()
            const lt = l.trim()
            if (lt === '' || lt.startsWith('//')) { pos++; continue }
            const li = getIndent(l)
            if (li <= lineIndent) break
            if (lt.startsWith('section ')) {
              const sp = lt.split(/\s+/)
              const sn = sp[1]
              pos++
              const secProps = parseProperties(li)
              sections.push({ name: sn, properties: secProps, span: { start: loc(), end: loc() } })
            } else {
              const parsed = parsePropertyLine(l)
              if (parsed) {
                const propStart = loc()
                const prop: Property = { ...parsed, children: [], span: { start: propStart, end: propStart } }
                pos++
                const nextIndent = getIndent(currentLine())
                if (nextIndent > li) prop.children = parseProperties(li)
                prop.span.end = loc()
                props.push(prop)
              } else {
                pos++
              }
            }
          }
          blocks.push({ type: 'screen', name, properties: props, sections, span: { start, end: loc() } })
          break
        }
        case 'flow': {
          const name = parts[1]
          pos++
          const props: Property[] = []
          const steps: FlowStep[] = []
          while (!isEOF()) {
            const l = currentLine()
            const lt = l.trim()
            if (lt === '' || lt.startsWith('//')) { pos++; continue }
            const li = getIndent(l)
            if (li <= lineIndent) break
            if (lt.startsWith('step ')) {
              const sp = lt.split(/\s+/)
              const sn = sp[1]
              pos++
              const stepProps = parseProperties(li)
              steps.push({ name: sn, properties: stepProps, span: { start: loc(), end: loc() } })
            } else {
              const parsed = parsePropertyLine(l)
              if (parsed) {
                const propStart = loc()
                const prop: Property = { ...parsed, children: [], span: { start: propStart, end: propStart } }
                pos++
                const nextIndent = getIndent(currentLine())
                if (nextIndent > li) prop.children = parseProperties(li)
                prop.span.end = loc()
                props.push(prop)
              } else { pos++ }
            }
          }
          blocks.push({ type: 'flow', name, properties: props, steps, span: { start, end: loc() } })
          break
        }
        case 'rule': {
          const name = parts[1]
          pos++
          const properties = parseProperties(lineIndent)
          blocks.push({ type: 'rule', name, properties, span: { start, end: loc() } })
          break
        }
        case 'example': {
          // example "..." or example "..." rest
          let name = ''
          const rest = trimmed.slice(7).trim()
          if (rest.startsWith('"')) {
            const r = parseString(trimmed, trimmed.indexOf('"'))
            if (r) name = r.value
          } else {
            name = parts.slice(1).join(' ')
          }
          pos++
          const properties = parseProperties(lineIndent)
          blocks.push({ type: 'example', name, properties, span: { start, end: loc() } })
          break
        }
        case 'agent': {
          const name = parts[1]
          pos++
          const props: Property[] = []
          const handlers: AgentHandler[] = []
          while (!isEOF()) {
            const l = currentLine()
            const lt = l.trim()
            if (lt === '' || lt.startsWith('//')) { pos++; continue }
            const li = getIndent(l)
            if (li <= lineIndent) break
            if (lt.startsWith('on ')) {
              const event = lt.slice(3).trim()
              pos++
              const handlerProps = parseProperties(li)
              handlers.push({ event, properties: handlerProps, span: { start: loc(), end: loc() } })
            } else {
              const parsed = parsePropertyLine(l)
              if (parsed) {
                const propStart = loc()
                const prop: Property = { ...parsed, children: [], span: { start: propStart, end: propStart } }
                pos++
                const nextIndent = getIndent(currentLine())
                if (nextIndent > li) prop.children = parseProperties(li)
                prop.span.end = loc()
                props.push(prop)
              } else { pos++ }
            }
          }
          blocks.push({ type: 'agent', name, properties: props, handlers, span: { start, end: loc() } })
          break
        }
        case 'skill': {
          const name = parts[1]
          pos++
          const properties = parseProperties(lineIndent)
          blocks.push({ type: 'skill', name, properties, span: { start, end: loc() } })
          break
        }
        case 'api': {
          const protocol = parts[1]
          const path = parts.slice(2).join(' ') || '/'
          pos++
          const props: Property[] = []
          const routes: ApiRoute[] = []
          while (!isEOF()) {
            const l = currentLine()
            const lt = l.trim()
            if (lt === '' || lt.startsWith('//')) { pos++; continue }
            const li = getIndent(l)
            if (li <= lineIndent) break
            // Check if it's a route (get/post/put/delete/patch/tool/resource/prompt)
            const routeMethods = ['get', 'post', 'put', 'delete', 'patch', 'tool', 'resource', 'prompt']
            const firstWord = lt.split(/\s+/)[0]
            if (routeMethods.includes(firstWord)) {
              const method = firstWord
              const routePath = lt.slice(firstWord.length).trim()
              pos++
              const routeProps = parseProperties(li)
              routes.push({ method, path: routePath, properties: routeProps, span: { start: loc(), end: loc() } })
            } else {
              const parsed = parsePropertyLine(l)
              if (parsed) {
                const propStart = loc()
                const prop: Property = { ...parsed, children: [], span: { start: propStart, end: propStart } }
                pos++
                const nextIndent = getIndent(currentLine())
                if (nextIndent > li) prop.children = parseProperties(li)
                prop.span.end = loc()
                props.push(prop)
              } else { pos++ }
            }
          }
          blocks.push({ type: 'api', protocol, path, properties: props, routes, span: { start, end: loc() } })
          break
        }
        case 'event': {
          const name = parts[1]
          pos++
          const properties = parseProperties(lineIndent)
          blocks.push({ type: 'event', name, properties, span: { start, end: loc() } })
          break
        }
        case 'config': {
          const name = parts[1]
          pos++
          const properties = parseProperties(lineIndent)
          blocks.push({ type: 'config', name, properties, span: { start, end: loc() } })
          break
        }
        case 'deploy': {
          const target = parts.slice(1).join(' ')
          pos++
          const properties = parseProperties(lineIndent)
          blocks.push({ type: 'deploy', target, properties, span: { start, end: loc() } })
          break
        }
        default: {
          errors.push({
            message: `Unknown keyword '${keyword}'. Expected one of: data, screen, flow, rule, example, agent, skill, api, event, config, deploy`,
            span: { start, end: loc() },
          })
          pos++
        }
      }
    }
    return blocks
  }

  const product = parseProduct()
  if (!product) return { ast: null, errors }

  const blocks = parseTopLevel(0)

  return {
    ast: {
      product,
      blocks,
      span: { start: { line: 1, col: 1 }, end: loc() },
    },
    errors,
  }
}
