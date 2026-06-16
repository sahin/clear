# Execution Model

> **Status:** Conceptual — no runtime exists yet.

## Overview

Clear files are **declarative specifications** that a runtime interprets and executes. The runtime is responsible for choosing *how* to implement the described behavior.

## Execution Targets

A single `.clear` file can be compiled or interpreted into multiple targets:

| Target | Output |
|--------|--------|
| Agent | Autonomous AI agent with defined behavior |
| API | REST or GraphQL endpoint |
| MCP | Model Context Protocol server |
| Web | Browser-based application |
| Mobile | Native mobile application |
| Desktop | Desktop application |

The `deploy` block determines which target is built.

## Evaluation Order

1. **Parse** — Read the `.clear` file and build an AST
2. **Validate** — Check all references resolve, types match, rules are satisfiable
3. **Plan** — Determine execution strategy for the target platform
4. **Generate** — Produce runnable artifacts (code, config, infrastructure)
5. **Deploy** — Place artifacts in the target environment

## Runtime Behavior

### Flows

Flows execute steps sequentially unless explicitly marked as parallel:

```clear
flow ProcessOrder
    step validate       // runs first
    step charge         // runs after validate succeeds
    step fulfill        // runs after charge succeeds
    step notify         // runs after fulfill succeeds
```

### Agents

Agents run continuously, responding to events:

```clear
agent Monitor
    on metric.threshold_exceeded
        analyze recent data
        determine severity
        if critical
            page on-call engineer
        else
            log warning
```

### Rules

Rules are evaluated at the point of reference. When a flow says `apply rule X`, the rule is checked immediately and the flow halts on failure.

## Error Handling

Errors propagate up the flow. Each step can define retry behavior:

```clear
flow SendEmail
    step deliver
        send email to recipient
        retry 3 times with exponential backoff
        on failure
            log error
            queue for manual review
```
