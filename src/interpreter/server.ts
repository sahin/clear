// Lightweight HTTP server for the Clear interpreter
// Uses Node.js built-in http module — zero dependencies

import http from 'http'
import { URL } from 'url'

export interface RouteHandler {
  method: string
  pathPattern: string
  handler: (context: RequestContext) => void | Promise<void>
}

export interface RequestContext {
  params: Record<string, string>
  query: Record<string, string>
  body: any
  method: string
  path: string
  status?: number
  responseBody?: any
}

export class HttpServer {
  private routes: RouteHandler[] = []
  private server: http.Server | null = null
  private currentPort: number = 0
  private verbose: boolean = false

  constructor(verbose?: boolean) {
    this.verbose = verbose ?? false
    this.createServer()
  }

  private createServer(): void {
    this.server = http.createServer((req, res) => this.handleRequest(req, res))
  }

  /** Register a route handler */
  on(method: string, path: string, handler: RouteHandler['handler']): void {
    this.routes.push({ method: method.toUpperCase(), pathPattern: path, handler })
  }

  /** Remove all registered routes */
  clearRoutes(): void {
    this.routes = []
  }

  /** Start the server on the given port */
  listen(port: number, callback?: () => void): void {
    if (!this.server) this.createServer()
    this.currentPort = port
    this.server!.listen(port, callback ?? (() => {
      console.log(`🚀 Clear interpreter running on port ${port}`)
    }))
  }

  /** Stop the server. Safe to call listen() again after close(). */
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve()
        return
      }
      this.server.close(() => {
        this.server = null
        resolve()
      })
    })
  }

  /** The port the server is currently listening on */
  get port(): number {
    return this.currentPort
  }

  /** Get the actual listening address (for port 0 / random port) */
  get address(): { port: number; family: string; address: string } | null {
    if (!this.server) return null
    const addr = this.server.address()
    if (!addr || typeof addr === 'string') return addr ? { port: 0, family: 'ipv4', address: addr } : null
    return addr
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Parse URL
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const pathname = url.pathname
    const query: Record<string, string> = {}
    for (const [key, value] of url.searchParams.entries()) {
      query[key] = value
    }

    // Parse JSON body
    const body = await this.parseBody(req)

    // Find matching route
    const { route, params } = this.matchRoute(req.method ?? 'GET', pathname)

    if (!route) {
      this.sendJson(res, 404, { error: `Not found: ${req.method} ${pathname}` })
      return
    }

    const context: RequestContext = {
      method: req.method?.toLowerCase() ?? 'get',
      path: pathname,
      params,
      query,
      body,
    }

    const startTime = Date.now()

    try {
      await route.handler(context)
      // Read back the status and body set by the handler
      const status = context.status ?? 200
      const body = context.responseBody
      if (status === 204) {
        res.writeHead(204)
        res.end()
      } else if (body !== undefined) {
        this.sendJson(res, status, body)
      } else {
        this.sendJson(res, status, { message: 'OK' })
      }

      if (this.verbose) {
        const elapsed = Date.now() - startTime
        const method = req.method ?? 'GET'
        const qs = url.search ? url.search : ''
        console.log(`  → ${method} ${pathname}${qs} ${status} (${elapsed}ms)`)
      }
    } catch (err: any) {
      if (this.verbose) {
        const elapsed = Date.now() - startTime
        console.log(`  → ${req.method ?? 'GET'} ${pathname} 500 (${elapsed}ms) ERROR: ${err.message}`)
      }
      console.error('Handler error:', err)
      this.sendJson(res, 500, { error: err.message ?? 'Internal server error' })
    }
  }

  private matchRoute(method: string, pathname: string): { route: RouteHandler | null; params: Record<string, string> } {
    const methodUpper = method.toUpperCase()

    for (const route of this.routes) {
      if (route.method !== methodUpper) continue

      const patternParts = route.pathPattern.split('/').filter(Boolean)
      const pathParts = pathname.split('/').filter(Boolean)

      if (patternParts.length !== pathParts.length) continue

      const params: Record<string, string> = {}
      let matched = true

      for (let i = 0; i < patternParts.length; i++) {
        const pattern = patternParts[i]
        const actual = pathParts[i]

        if (pattern.startsWith(':')) {
          // Named parameter (e.g., :id)
          params[pattern.slice(1)] = actual
        } else if (pattern !== actual) {
          matched = false
          break
        }
      }

      if (matched) {
        return { route, params }
      }
    }

    return { route: null, params: {} }
  }

  private parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        if (!raw.trim()) {
          resolve(null)
          return
        }
        try {
          resolve(JSON.parse(raw))
        } catch {
          resolve(raw)
        }
      })
      req.on('error', () => resolve(null))
    })
  }

  private sendJson(res: http.ServerResponse, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }
}
