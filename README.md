<p align="center">
  <img src="docs/assets/clear-logo.png" alt="Clear" width="120" />
</p>

<h1 align="center">Clear</h1>

<p align="center">
  <strong>Structured English for REST APIs. Write the spec, run the server.</strong>
</p>

<p align="center">
  <a href="https://github.com/varshinicb1/clear2.0">Website</a> ·
  <a href="https://github.com/varshinicb1/clear2.0/tree/main/spec">Language Spec</a> ·
  <a href="https://github.com/varshinicb1/clear2.0/tree/main/examples">Examples</a> ·
  <a href="https://github.com/varshinicb1/clear2.0/tree/main/docs">Docs</a>
</p>

---

## Who Is Clear For?

Clear is for **backend developers** who want to go from idea to working API faster. If you know what data you're working with and what endpoints you need, you can write it in Clear and get a running server in seconds — no routing boilerplate, no ORM setup, no manual scaffolding.

It is also for **anyone who can describe an API in structured English** — a product manager sketching endpoints, a frontend developer who needs a quick backend, a designer who wants to validate an API contract. The interpreter lets you run `.clear` files directly without installing a framework or writing a line of TypeScript.

> This is v0.4. Clear is in active development. The vision goes far beyond REST APIs — see [The Vision](#the-vision) below — but today it excels at one thing: **turning a data model + route description into a working HTTP server.**

---

## The Vision

Traditional software development has too many layers between what you want and what runs:

```
Traditional:    Idea → PRD → Design → Spec → Code (Language) → Build → Deploy
Clear (today):  Idea → Clear → Server
Clear (future): Idea → Clear → Machine Code
```

Clear's north star is eliminating everything between human intent and machine execution. Today it eliminates the **code** step for REST APIs. Tomorrow it will eliminate the **compile and build** steps too.

**The spec is the code** — a `clear` file is both documentation and implementation. No drift between what was planned and what runs.

---

Forked from [Sahin](https://github.com/sahin/clear) — originally created at [Lovie](https://lovie.com). Maintained at [varshinicb1/clear2.0](https://github.com/varshinicb1/clear2.0).

## Status

Clear is in **v0.4** — parser, validator, CLI, interpreter, and 5 code generators are working. The language spec is being refined through real examples.

| Artifact | Status |
|----------|--------|
| Language spec | Draft (see `spec/`) |
| Examples | 6 real-world use cases (see `examples/`) |
| Parser | ✅ Parses all 12 block types with error recovery |
| Validator | ✅ Semantic validation with reference resolution |
| Code Generator | ✅ **TypeScript**, **Express**, **Hono**, **Fastify**, **Koa** |
| Interpreter | ✅ **Direct execution** — `clear run rest-api.clear` starts a live HTTP server |
| Tests | **597 tests** — parser + validator + codegen snapshot tests |
| CLI | ✅ `clear check`, `clear build`, `clear run`, `clear init` |
| CI | ✅ Build + test + snapshot verification on Node 18/20/22 + nightly |
| Snapshot Check | [![Snapshot Check](https://github.com/varshinicb1/clear2.0/actions/workflows/snapshot-check.yml/badge.svg)](https://github.com/varshinicb1/clear2.0/actions/workflows/snapshot-check.yml) |
| Coverage | [![Codecov](https://codecov.io/gh/varshinicb1/clear2.0/branch/main/graph/badge.svg)](https://codecov.io/gh/varshinicb1/clear2.0) |
| Website | [github.com/varshinicb1/clear2.0](https://github.com/varshinicb1/clear2.0) |
| VS Code extension | Planned |
| Agent runtime | Planned |

## Quick Start

Write your API in a `.clear` file, run it, and get a working HTTP server. No `npm install`, no framework config, no TypeScript.

```clear
product TaskAPI
    name "Task Management API"

data Task
    field id
        type uuid
        primary true
    field title
        type string
        required true
    field status
        type enum
        options ["todo", "in_progress", "done"]
        default "todo"
    field created_at
        type timestamp
        default now

api REST /tasks
    get /
        return list of Task
        paginate 20 per page
    post /
        accept title
        set created_at to now
        status 201
    delete /:id
        status 204
```

```sh
$ clear run examples/rest-api.clear
# → 🚀  http://localhost:8080
```

```sh
$ curl http://localhost:8080/tasks
# → {"data":[],"total":0,"page":1,"limit":20,"totalPages":1}
```

The `.clear` file is the spec **and** the implementation. Change the file, restart — no compilation, no intermediate code.

## Generate Production-Ready Code

When you're ready to deploy, Clear generates real framework code that you can customize, test, and deploy:

Clear can generate a fully working Express.js, Hono, Fastify, or Koa API server from a `.clear` file — complete with CRUD routes, filtering, sorting, pagination, validation, and auto-generated field defaults.

```bash
# Generate an Express server from the REST API example
clear build examples/rest-api.clear --target express --out server.ts

# Install dependencies
npm install express cors uuid

# Run it
npx tsx server.ts
# → Server running on port 8080
```

Or generate for Hono, Fastify, Koa, or TypeScript:

### Other Targets

```bash
# Generate a Hono server (runs on Node via @hono/node-server)
clear build examples/rest-api.clear --target hono --out server.ts
npm install hono @hono/node-server cors uuid
npx tsx server.ts

# Generate a Fastify server (with @fastify/cors)
clear build examples/rest-api.clear --target fastify --out server.ts
npm install fastify @fastify/cors uuid
npx tsx server.ts

# Generate a Koa server (with @koa/router, @koa/cors, @koa/bodyparser)
clear build examples/rest-api.clear --target koa --out server.ts
npm install koa @koa/router @koa/cors @koa/bodyparser uuid
npx tsx server.ts

# Generate TypeScript interfaces (default)
clear build examples/rest-api.clear --target ts
```

## Why Clear Exists

Clear is a bet that **the next wave of development tools will be spec-first, not code-first**. Instead of writing implementation details and hoping the docs match reality, you write the spec and the system generates or executes the rest.

Today that means REST APIs. Tomorrow it means full-stack applications, data pipelines, AI agents — all expressed in the same structured English syntax. The interpreter is step one.

For a deeper look at the philosophy, see [Design Decisions](docs/design-decisions.md).

## Language Overview

Clear uses **12 keywords** to describe systems. Of these, `data`, `api`, `product`, and `config` are the most mature today:

| Keyword | Purpose | Status |
|---------|---------|--------|
| `product` | Top-level system definition | ✅ Mature |
| `data` | Schema and data structures | ✅ Mature |
| `api` | External interface definitions | ✅ REST APIs working |
| `config` | Environment and settings | ✅ Working |
| `rule` | Constraints and validations | ✅ Validation rules functional |
| `flow` | Business logic and workflows | 🚧 Parsed, no interpreter yet |
| `screen` | UI layout and components | 🚧 Parsed, no interpreter yet |
| `example` | Test cases and documentation | 🚧 Parsed, no executor yet |
| `event` | System triggers and signals | 🚧 Parsed, no runtime yet |
| `deploy` | Infrastructure targets | 🚧 Parsed, no executor yet |
| `agent` | Autonomous AI behavior | 🚧 Parsed, no runtime yet |
| `skill` | Reusable capabilities | 🚧 Parsed, no runtime yet |

## Examples

See the [`examples/`](examples/) directory for use cases. Note that only the REST API example (`rest-api.clear`) can be executed with `clear run` today — the others parse and validate, but their runtimes are under development:

| Example | Status |
|---------|--------|
| [REST API](examples/rest-api.clear) | ✅ Works with `clear run` and `clear build` |
| [Customer Support Agent](examples/support-agent.clear) | 🚧 Parses, validates — agent runtime planned |
| [MCP Server](examples/mcp-server.clear) | 🚧 Parses, validates — MCP runtime planned |
| [E-commerce Product Page](examples/product-page.clear) | 🚧 Parses, validates — screen runtime planned |
| [Data Pipeline](examples/data-pipeline.clear) | 🚧 Parses, validates — flow runtime planned |
| [Lead Qualification Bot](examples/lead-qualification.clear) | 🚧 Parses, validates — agent runtime planned |

## Documentation

- [Language Specification](spec/README.md) — formal grammar and semantics
- [Design Decisions](docs/design-decisions.md) — why Clear works this way
- [Roadmap](docs/roadmap.md) — what's coming next

## Contributing

Clear is in early design. Contributions to the language spec, examples, and documentation are welcome.

1. Fork this repository
2. Create your branch (`git checkout -b my-proposal`)
3. Commit your changes (`git commit -am 'Propose: new keyword for X'`)
4. Push to the branch (`git push origin my-proposal`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Community

- [GitHub Issues](https://github.com/varshinicb1/clear2.0/issues) — bug reports and feature requests

## License

Clear is distributed under the [MIT License](LICENSE).
