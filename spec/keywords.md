# Keywords

Clear has 12 top-level keywords. Each keyword begins a block that defines one aspect of a system.

## `product`

Declares the top-level system. Every `.clear` file begins with a `product` block.

```clear
product MyApp
    name "My Application"
    version "1.0"
    description "A short explanation of what this product does"
```

## `data`

Defines a data structure or schema.

```clear
data User
    field id
        type uuid
        primary true
    field email
        type string
        unique true
        required true
    field name
        type string
    field created_at
        type timestamp
        default now
```

## `screen`

Declares a user interface layout.

```clear
screen Dashboard
    title "Overview"
    layout grid 2x2
    section metrics
        show total_users as card
        show revenue as card
    section activity
        show recent_events as table
        limit 10
```

## `flow`

Defines a business process or workflow.

```clear
flow UserSignup
    trigger form.submit on SignupScreen
    step validate
        check email is valid
        check password length >= 8
    step create
        insert User with form data
        generate verification token
    step notify
        send email "Welcome" to user.email
        include verification link
```

## `rule`

Declares a constraint or validation.

```clear
rule PasswordStrength
    apply to User.password
    require length >= 8
    require contains uppercase
    require contains number
    message "Password must be at least 8 characters with one uppercase letter and one number"
```

## `example`

Provides a test case and living documentation.

```clear
example "New user can sign up"
    given no user with email "test@example.com"
    when submit SignupScreen
        with email "test@example.com"
        with password "Secure123"
    then user exists with email "test@example.com"
    then email sent to "test@example.com"
```

## `agent`

Defines an autonomous AI behavior.

```clear
agent SupportBot
    role "Customer support assistant"
    personality "Helpful, concise, empathetic"
    knowledge product_docs, faq, past_tickets
    
    on new_ticket
        classify intent
        if known_issue
            suggest solution from knowledge
        else
            escalate to human with summary
```

## `skill`

Declares a reusable capability that agents or flows can invoke.

```clear
skill SummarizeText
    input text (string, max 10000 chars)
    output summary (string, max 200 chars)
    method
        extract key points
        compress to output length
        preserve original tone
```

## `api`

Defines an external interface.

```clear
api REST /users
    get /
        return list of User
        paginate 20 per page
    get /:id
        return User by id
        error 404 if not found
    post /
        accept User fields
        validate with rules
        return created User
```

## `event`

Declares a system trigger or signal.

```clear
event UserCreated
    payload user_id, email, created_at
    emit after flow UserSignup completes
```

## `config`

Defines environment-specific settings.

```clear
config production
    database url from env DATABASE_URL
    cache redis from env REDIS_URL
    log level "info"
    rate_limit 100 per minute
```

## `deploy`

Specifies infrastructure targets.

```clear
deploy cloudflare
    workers 1
    region auto
    domain "myapp.com"
    ssl automatic
```
