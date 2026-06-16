# Types

Clear has a small, practical type system designed for product development.

## Primitive Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text of any length | `"hello"` |
| `integer` | Whole numbers | `42` |
| `float` | Decimal numbers | `3.14` |
| `boolean` | True or false | `true` |
| `timestamp` | Date and time | `2025-01-15T10:30:00Z` |
| `uuid` | Unique identifier | auto-generated |
| `url` | Web address | `"https://example.com"` |
| `email` | Email address | `"user@example.com"` |

## Compound Types

| Type | Description | Example |
|------|-------------|---------|
| `list` | Ordered collection | `["a", "b", "c"]` |
| `map` | Key-value pairs | `{key: "value"}` |
| `enum` | Fixed set of values | `options ["draft", "published"]` |
| `reference` | Link to another data block | `type reference User` |

## Type Modifiers

Modifiers constrain values:

```clear
field email
    type string
    required true       // must have a value
    unique true         // no duplicates allowed
    format email        // must match email pattern

field age
    type integer
    min 0
    max 150
    required false      // optional (default)

field role
    type enum
    options ["admin", "user", "viewer"]
    default "user"
```

## Special Values

| Value | Meaning |
|-------|---------|
| `now` | Current timestamp |
| `null` | Absence of value (only if `required false`) |
| `auto` | System-generated value |
| `env <NAME>` | Read from environment variable |
