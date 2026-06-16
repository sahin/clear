# Clear Language Specification

> **Status:** Draft v0.1 — subject to change.

This directory contains the formal specification of the Clear programming language.

## Structure

| File | Contents |
|------|----------|
| [keywords.md](keywords.md) | All 12 keywords and their semantics |
| [syntax.md](syntax.md) | Grammar rules and file structure |
| [types.md](types.md) | Type system and data primitives |
| [execution.md](execution.md) | Runtime model and evaluation order |

## Design Principles

1. **Readability over brevity.** A Clear file should read like a product document, not like code.
2. **Indentation is structure.** No braces, no semicolons. Nesting is expressed through indentation (4 spaces).
3. **Declarative first.** Describe *what*, not *how*. The runtime decides the implementation.
4. **Single file, full system.** One `.clear` file can define an entire product — data, screens, logic, and deployment.
5. **Zero ambiguity.** Every statement has exactly one interpretation. If it's ambiguous, the spec is wrong.

## File Format

- Extension: `.clear`
- Encoding: UTF-8
- Indentation: 4 spaces (tabs are invalid)
- Comments: lines starting with `//`
- Max recommended line length: 120 characters
