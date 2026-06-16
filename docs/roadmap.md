# Roadmap

## Current: v0.1 — Language Design

The specification is being written. No tooling exists yet.

| Milestone | Status |
|-----------|--------|
| Core keywords defined | Done |
| Syntax rules formalized | In progress |
| Type system specified | In progress |
| 10+ real-world examples | Done |
| Website live | Done |

## Next: v0.2 — Parser & Validator

Build a parser that can read `.clear` files and validate them against the spec.

| Milestone | Status |
|-----------|--------|
| Tokenizer | Planned |
| AST definition | Planned |
| Parser implementation | Planned |
| Validation rules | Planned |
| Error messages | Planned |
| CLI: `clear check <file>` | Planned |

## v0.3 — Code Generation

Generate runnable code from validated `.clear` files.

| Milestone | Status |
|-----------|--------|
| TypeScript target | Planned |
| Cloudflare Workers target | Planned |
| Docker target | Planned |
| CLI: `clear build <file>` | Planned |

## v0.4 — Runtime

Execute `.clear` files directly without a build step.

| Milestone | Status |
|-----------|--------|
| Interpreter | Planned |
| Hot reload | Planned |
| CLI: `clear run <file>` | Planned |
| REPL: `clear playground` | Planned |

## v0.5 — Developer Experience

| Milestone | Status |
|-----------|--------|
| VS Code extension (syntax highlighting) | Planned |
| VS Code extension (autocomplete) | Planned |
| VS Code extension (inline validation) | Planned |
| Formatter: `clear fmt` | Planned |
| Package registry | Planned |

## v1.0 — Production Ready

| Milestone | Status |
|-----------|--------|
| Stable spec (no breaking changes) | Planned |
| Multiple deployment targets | Planned |
| Standard library of skills | Planned |
| Security audit | Planned |
| Performance benchmarks | Planned |

## Principles for the Roadmap

1. **Spec first.** Every feature is specified before it's implemented.
2. **Examples drive design.** If we can't write a clear example, the feature isn't ready.
3. **Ship incrementally.** Each version is usable on its own.
4. **Community input.** Major decisions go through GitHub Discussions.
