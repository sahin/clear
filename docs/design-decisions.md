# Design Decisions

This document explains the reasoning behind Clear's core design choices.

## Why "the spec is the code"?

In traditional development, there are at least four artifacts that describe a system:

1. **Idea** — what someone wants built (in their head or a conversation)
2. **Spec** — a document describing what to build (PRD, RFC, design doc)
3. **Code** — the implementation (Python, TypeScript, Rust, etc.)
4. **Machine code** — what actually runs (compiled binary, bytecode)

Each translation step introduces drift. The spec says one thing, the code does another. The code changes but the spec doesn't get updated. Engineers argue about whether "the code is the source of truth" or "the spec is the source of truth."

Clear eliminates steps 2 and 3 by making them the same artifact:

1. **Idea** — what someone wants built
2. **Clear** — the specification that is also the implementation
3. **Machine code** — what actually runs

The `.clear` file is both the documentation and the executable. There is no drift because there is only one artifact.

## Why indentation-based?

Braces and semicolons are syntactic noise that serve the compiler, not the reader. Clear is designed to be read by humans who may not be programmers — product managers, designers, founders. Indentation is how humans naturally express hierarchy in outlines and documents.

## Why 12 keywords?

Every keyword in Clear maps to a concept that product teams already use:

- Products have **data** (schemas)
- Products have **screens** (UI)
- Products have **flows** (processes)
- Products have **rules** (constraints)
- Products have **examples** (test cases)
- Products have **agents** (AI behavior)
- Products have **skills** (capabilities)
- Products have **APIs** (interfaces)
- Products have **events** (triggers)
- Products have **config** (settings)
- Products have **deploy** targets (infrastructure)

If you can describe your product in these terms, you can write Clear.

## Why declarative?

Imperative code describes *how* to do something. Declarative code describes *what* should happen. Clear is declarative because:

1. **AI runtimes can optimize.** When you say "send email to user," the runtime can choose the best email provider, handle retries, manage queues — without you specifying the implementation.
2. **Readability.** "check email is valid" is clearer than `if (!email.match(/^[a-zA-Z0-9...$/))`.
3. **Portability.** The same `.clear` file can target different platforms without changes.

## Why single-file?

A `.clear` file can define an entire product — data, UI, logic, deployment — in one file. This is intentional:

1. **Context.** Everything about the system is in one place. No jumping between 47 files to understand a feature.
2. **AI-friendly.** An AI assistant can read one file and understand the entire system.
3. **Refactoring.** When everything is in one file, you can see the impact of changes immediately.

For large systems, Clear supports splitting into multiple files with imports. But the default is one file, because most products start small.

## Why agent-first?

Clear is designed for the era where humans describe intent and machines execute it. The `agent` and `skill` keywords are first-class because:

1. Most new software will involve AI agents.
2. Describing agent behavior declaratively prevents the "prompt spaghetti" problem.
3. Skills are reusable across agents, just like functions are reusable across programs.
