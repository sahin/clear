<p align="center">
  <img src="docs/assets/clear-logo.png" alt="Clear" width="120" />
</p>

<h1 align="center">Clear</h1>

<p align="center">
  <strong>The spec is the code.</strong>
</p>

<p align="center">
  <a href="https://sahin.io/clear">Website</a> ·
  <a href="https://github.com/sahin/clear/tree/main/spec">Language Spec</a> ·
  <a href="https://github.com/sahin/clear/tree/main/examples">Examples</a> ·
  <a href="https://github.com/sahin/clear/tree/main/docs">Docs</a>
</p>

---

Clear is a programming language where your **specification and implementation are the same file**. If you can describe what it should do, you have already written it.

No translation step. No drift between docs and behavior. No "the code is the source of truth" argument — because spec and code are the same artifact.

## Goals

- **Readable by anyone.** A product manager, a designer, or a new engineer can read a `.clear` file and understand what the system does.
- **Executable as-is.** The same file that describes behavior is the file that runs. Zero compilation gap.
- **One file format.** Products, data schemas, screens, flows, rules, agents, and skills — all expressed in the same syntax.
- **Agent-first.** Built for the era where humans describe intent and machines execute it.

## Status

Clear is in **v0.1** — active language design. The specification is being written. No compiler or runtime exists yet.

What exists today:

| Artifact | Status |
|----------|--------|
| Language spec | Draft (see `spec/`) |
| Examples | 10+ real-world use cases (see `examples/`) |
| Website | Live at [sahin.io/clear](https://sahin.io/clear) |
| CLI | Planned |
| VS Code extension | Planned |
| Runtime | Planned |

## Quick Look

```clear
product NotificationService
    name "Notification Service"
    version "0.1"
    description "Sends transactional notifications across channels"

screen Preferences
    title "Notification Preferences"
    field channels
        type multi-select
        options ["email", "sms", "push", "slack"]
        default ["email"]

flow SendNotification
    trigger event.new_notification
    step validate
        check recipient exists
        check channel is enabled
    step deliver
        route to channel handler
        retry 3 times with backoff
    step confirm
        log delivery status
        notify sender on failure
```

```sh
$ clear run notification-service.clear
```

## Language Overview

Clear uses **12 keywords** to describe entire systems:

| Keyword | Purpose |
|---------|---------|
| `product` | Top-level system definition |
| `data` | Schema and data structures |
| `screen` | UI layout and components |
| `flow` | Business logic and workflows |
| `rule` | Constraints and validations |
| `example` | Test cases and documentation |
| `agent` | Autonomous AI behavior |
| `skill` | Reusable capabilities |
| `api` | External interface definitions |
| `event` | System triggers and signals |
| `config` | Environment and settings |
| `deploy` | Infrastructure targets |

## Examples

See the [`examples/`](examples/) directory for complete use cases:

- [Customer Support Agent](examples/support-agent.clear)
- [REST API](examples/rest-api.clear)
- [MCP Server](examples/mcp-server.clear)
- [E-commerce Product Page](examples/product-page.clear)
- [Data Pipeline](examples/data-pipeline.clear)
- [Lead Qualification Bot](examples/lead-qualification.clear)

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

- [GitHub Discussions](https://github.com/sahin/clear/discussions) — questions, proposals, ideas
- [Issues](https://github.com/sahin/clear/issues) — bug reports and feature requests

## License

Clear is distributed under the [MIT License](LICENSE).
