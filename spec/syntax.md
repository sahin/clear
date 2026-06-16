# Syntax

## File Structure

Every `.clear` file follows this structure:

```
product <Name>
    <metadata>

<blocks>
```

A file must begin with exactly one `product` declaration. All other blocks follow.

## Indentation

Clear uses **4-space indentation** to express hierarchy. Tabs are not valid.

```clear
product Example
    name "Example"          // level 1: product metadata

data User                   // level 0: new block
    field email             // level 1: block member
        type string         // level 2: member property
        required true       // level 2: member property
```

## Identifiers

- Block names: PascalCase (`UserSignup`, `NotificationService`)
- Field names: snake_case (`created_at`, `user_id`)
- Keywords: lowercase (`product`, `data`, `flow`)

## Strings

Strings are enclosed in double quotes:

```clear
name "My Application"
description "A longer description that explains the purpose"
```

Multi-line strings use triple quotes:

```clear
description """
    This is a longer description
    that spans multiple lines.
    Leading indentation is stripped.
"""
```

## Comments

Single-line comments start with `//`:

```clear
// This is a comment
product MyApp
    name "My App"  // inline comment
```

## Numbers

Numbers are written as literals:

```clear
field age
    type integer
    min 0
    max 150

config production
    rate_limit 100 per minute
    timeout 30 seconds
```

## Booleans

```clear
field is_active
    type boolean
    default true
```

## Lists

Lists use square brackets:

```clear
field tags
    type list
    options ["urgent", "normal", "low"]
```

## References

Reference other blocks by name:

```clear
flow Checkout
    trigger button.click on CartScreen
    step validate
        apply rule StockAvailability
        apply rule PaymentValid
```
