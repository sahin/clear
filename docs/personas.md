# Clear — Target User Personas

Last updated: June 2026 · Clear v0.4

This document describes the people Clear is built for. Personas are ordered by how well Clear serves them today — the first persona is fully supported, the second is partially supported, and the third is the aspirational future.

---

## Persona 1: The Backend Developer (Primary — Fully Supported Today)

| Attribute | Detail |
|-----------|--------|
| **Name** | Alex |
| **Role** | Senior backend engineer, Node.js/TypeScript |
| **Experience** | 5+ years building REST APIs |
| **Tools today** | Express, Fastify, Hono, Prisma, Postman |
| **Pain point** | Spends 80% of initial sprint on boilerplate — routes, models, validation, pagination, sorting. The actual business logic is 20% of the work, but the scaffolding takes all the time. |
| **What Clear solves** | Alex writes a `.clear` file that defines the data model and endpoints in 15 minutes, runs `clear run` to test the API immediately, and iterates on the spec. The interpreter handles in-memory storage, CRUD, filtering, pagination, validation rules, and auto-timestamps. When the spec is stable, `clear build --target express` generates production-ready TypeScript that Alex can customize, test, and deploy. |
| **Clear features used** | `data`, `api REST`, `rule`, `config`, `clear run` (interpreter), `clear build` (codegen), `--port`, filtering, sorting, pagination |
| **How they find Clear** | GitHub search for "API scaffolding tool," Hacker News, word of mouth from other backend devs |
| **Why they stay** | Clear eliminates the gap between the spec and the code. No more routes that don't match the PRD. The `.clear` file becomes the single source of truth. |
| **What would make them leave** | No path to production (no codegen), limited to prototyping only, can't customize the generated code |

### Day-in-the-life scenario

Alex is building a task management API for a new product. Instead of creating a new Express project, installing Prisma, defining the schema, setting up migrations, writing route handlers, implementing pagination, and wiring up validation (2-3 days), Alex:

1. Writes a `.clear` file with `data Task` and `api REST /tasks` — **15 minutes**
2. Runs `clear run tasks.clear` — **2 seconds**
3. Tests with curl — **immediate feedback**
4. Iterates on the spec based on team feedback — **minutes**
5. When approved, runs `clear build tasks.clear --target express --out src/api.ts`
6. Integrates the generated code into the existing project

---

## Persona 2: The Non-Developer Stakeholder (Partial Support — Interpreter Available)

| Attribute | Detail |
|-----------|--------|
| **Name** | Jamie |
| **Role** | Product manager, startup founder, or designer |
| **Experience** | Can describe systems and workflows but doesn't write code |
| **Tools today** | Notion, Figma, Postman (for testing existing APIs), spreadsheets |
| **Pain point** | Can describe exactly what the API should do — what data it needs, what endpoints, what validation rules — but can't build it. Has to write a spec document, hand it to engineering, wait weeks, and then check if it matches what they asked for. |
| **What Clear solves** | Jamie writes a `.clear` file that describes the API in structured English — "Task has a title, status is an enum with todo/in_progress/done, default is todo, GET /tasks returns a paginated list." They run `clear run tasks.clear` and get a working HTTP server immediately. They can test with curl, share the endpoint with stakeholders, and iterate on the spec without writing a line of code. |
| **Clear features used** | `data`, `api REST`, `clear run` (interpreter only), `--port` |
| **Limitations today** | The `.clear` file must follow Clear's syntax rules. The interpreter uses in-memory storage (data resets on restart). No authentication, no database persistence, no deployment. These require the codegen path and a developer. |
| **How they find Clear** | Referred by a developer on their team, or by reading the README that says "anyone who can describe an API in structured English" |
| **Why they use it** | Prototypes a working API in minutes, validates the contract before engineering starts, reduces back-and-forth on specs |
| **What would make them stay** | An even simpler syntax (less strict indentation), a web interface (instead of CLI), data persistence, ability to share endpoints with others |

### Day-in-the-life scenario

Jamie is defining the API for a new customer portal. They open a `.clear` file and write:

```
data Ticket
    field subject (string, required)
    field status (enum: open, in_progress, resolved)
    field priority (enum: low, medium, high, urgent, default: medium)

api REST /tickets
    get / → list of Ticket, paginated
    post / → create Ticket
    get /:id → get Ticket by id
```

Jamie runs `clear run portal.clear`, tests with curl, and shares the running API with the team. Engineering reviews the spec file and says "this is exactly what we need, we'll generate the production version from this."

---

## Persona 3: The AI Agent Developer (Aspirational — Runtime Not Built Yet)

| Attribute | Detail |
|-----------|--------|
| **Name** | Sam |
| **Role** | AI engineer building agentic workflows |
| **Experience** | Working with LLMs, function calling, MCP servers, and autonomous agents |
| **Tools today** | LangChain, Vercel AI SDK, OpenAI Assistants API, custom MCP servers |
| **Pain point** | Building AI agents requires stitching together tool definitions, prompt templates, context management, and state handling — all in imperative code that's hard to reason about and harder to audit. Agent behavior is scattered across 10 files, none of which describe the agent's actual purpose. |
| **What Clear would solve** | Sam writes a `.clear` file that declares the agent's role, knowledge, event handlers, and response rules in structured English. The `agent` and `skill` keywords map directly to agent runtime concepts. An interpreter executes the agent — listening for events, dispatching to the right handler, managing conversation state, and enforcing rules — without writing any glue code. |
| **Clear features needed** | `agent`, `skill`, `event`, `flow`, agent interpreter runtime, LLM integration, state persistence |
| **Status** | The parser and validator handle `agent`, `skill`, `event`, and `flow` blocks. The interpreter only supports REST APIs today. Agent runtime is planned for a future release. |

---

## Persona Prioritization Matrix

| Feature | Backend dev (Alex) | Non-dev (Jamie) | AI dev (Sam) |
|---------|:------------------:|:----------------:|:------------:|
| `clear run` (interpreter) | ✅ Today | ✅ Today | ❌ Not yet |
| `clear build` (codegen) | ✅ Today | ❌ Not applicable | ❌ Not yet |
| REST API CRUD | ✅ Today | ✅ Today | ❌ Not yet |
| Validation rules | ✅ Today | ✅ Today | ❌ Not yet |
| Filter/sort/paginate | ✅ Today | ✅ Today | ❌ Not yet |
| Agent runtime | ❌ Not yet | ❌ Not yet | ❌ Not yet |
| Flow execution | ❌ Not yet | ❌ Not yet | ❌ Not yet |
| Screen rendering | ❌ Not yet | ❌ Not yet | ❌ Not yet |
| Data persistence | Requires codegen | ❌ Not yet | ❌ Not yet |
| Deployment | Requires codegen | ❌ Not yet | ❌ Not yet |

---

## Design Principles for Each Persona

| When deciding… | Optimize for Alex (backend dev) | Also consider Jamie (non-dev) |
|----------------|-------------------------------|-------------------------------|
| **Syntax** | Concise, expressive, maps to code concepts | Readable, natural-language-like, minimal symbols |
| **Error messages** | Stack traces, line numbers, types | Plain English: "your field 'title' needs a type" |
| **Output** | Generated TypeScript files | Running HTTP server with curl examples |
| **Docs** | API reference, integration guide | Tutorials, copy-paste examples, videos |
| **Persistence** | db migration + ORM setup for production | "Your data will reset when you restart the server" |
