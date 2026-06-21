export interface Location {
  line: number
  col: number
}

export interface Span {
  start: Location
  end: Location
}

export type Value =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'list'; value: Value[] }
  | { type: 'map'; value: MapEntry[] }
  | { type: 'identifier'; value: string }
  | { type: 'reference'; name: string }
  | { type: 'env'; name: string }
  | { type: 'special'; keyword: 'now' | 'auto' | 'null' }

export interface MapEntry {
  key: string
  value: Value
}

export interface Property {
  key: string
  args: string[]
  value: Value | null
  children: Property[]
  span: Span
}

export interface FieldDef {
  name: string
  properties: Property[]
  span: Span
}

export interface ProductBlock {
  type: 'product'
  name: string
  properties: Property[]
  span: Span
}

export interface DataBlock {
  type: 'data'
  name: string
  fields: FieldDef[]
  span: Span
}

export interface ScreenBlock {
  type: 'screen'
  name: string
  properties: Property[]
  sections: ScreenSection[]
  span: Span
}

export interface ScreenSection {
  name: string
  properties: Property[]
  span: Span
}

export interface FlowStep {
  name: string
  properties: Property[]
  span: Span
}

export interface FlowBlock {
  type: 'flow'
  name: string
  properties: Property[]
  steps: FlowStep[]
  span: Span
}

export interface RuleBlock {
  type: 'rule'
  name: string
  properties: Property[]
  span: Span
}

export interface ExampleBlock {
  type: 'example'
  name: string
  properties: Property[]
  span: Span
}

export interface AgentBlock {
  type: 'agent'
  name: string
  properties: Property[]
  handlers: AgentHandler[]
  span: Span
}

export interface AgentHandler {
  event: string
  properties: Property[]
  span: Span
}

export interface SkillBlock {
  type: 'skill'
  name: string
  properties: Property[]
  span: Span
}

export interface ApiBlock {
  type: 'api'
  protocol: string
  path: string
  routes: ApiRoute[]
  properties: Property[]
  span: Span
}

export interface ApiRoute {
  method: string
  path: string
  properties: Property[]
  span: Span
}

export interface EventBlock {
  type: 'event'
  name: string
  properties: Property[]
  span: Span
}

export interface ConfigBlock {
  type: 'config'
  name: string
  properties: Property[]
  span: Span
}

export interface DeployBlock {
  type: 'deploy'
  target: string
  properties: Property[]
  span: Span
}

export type TopLevelBlock =
  | DataBlock
  | ScreenBlock
  | FlowBlock
  | RuleBlock
  | ExampleBlock
  | AgentBlock
  | SkillBlock
  | ApiBlock
  | EventBlock
  | ConfigBlock
  | DeployBlock

export interface ClearFile {
  product: ProductBlock
  blocks: TopLevelBlock[]
  span: Span
}

export interface ParseError {
  message: string
  span: Span
}

export interface ParseResult {
  ast: ClearFile | null
  errors: ParseError[]
}
