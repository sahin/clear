// In-memory data store for the Clear interpreter
// Each Data block gets its own store instance

import crypto from 'crypto'

export interface FilterQuery {
  field: string
  value: string
}

export interface SortConfig {
  field: string
  direction: 'asc' | 'desc'
}

export interface PaginationConfig {
  page: number
  limit: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export class Store<T extends Record<string, any>> {
  private records: T[] = []
  private idField: string = 'id'

  constructor(idField: string = 'id') {
    this.idField = idField
  }

  /** Generate a UUID v4 (no dash variant for brevity) */
  static generateId(): string {
    return crypto.randomUUID()
  }

  /** Get all records with optional filtering, sorting, pagination */
  findAll(options?: {
    filters?: FilterQuery[]
    sort?: SortConfig | null
    pagination?: PaginationConfig | null
  }): T[] | PaginatedResult<T> {
    let result = [...this.records]

    // Apply filters
    if (options?.filters && options.filters.length > 0) {
      for (const f of options.filters) {
        result = result.filter(item => String(item[f.field]) === f.value)
      }
    }

    // Apply sorting
    if (options?.sort) {
      const { field, direction } = options.sort
      result.sort((a: any, b: any) => {
        const av = a[field]
        const bv = b[field]
        if (!av && !bv) return 0
        if (!av) return 1
        if (!bv) return -1
        if (direction === 'desc') {
          return av < bv ? 1 : av > bv ? -1 : 0
        }
        return av < bv ? -1 : av > bv ? 1 : 0
      })
    }

    // Apply pagination
    if (options?.pagination) {
      const { page, limit } = options.pagination
      const start = (page - 1) * limit
      const total = result.length
      return {
        data: result.slice(start, start + limit),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      }
    }

    return result
  }

  /** Find a single record by its ID */
  findById(id: string): T | undefined {
    return this.records.find(r => (r as any)[this.idField] === id)
  }

  /** Create a new record with auto-generated ID */
  create(data: Partial<T> & Record<string, any>): T {
    const record = {
      ...data,
      [this.idField]: data[this.idField] ?? Store.generateId(),
    } as T
    this.records.push(record)
    return record
  }

  /** Update an existing record by ID, returning the updated record or undefined */
  update(id: string, updates: Partial<T>): T | undefined {
    const index = this.records.findIndex(r => (r as any)[this.idField] === id)
    if (index === -1) return undefined
    this.records[index] = {
      ...this.records[index],
      ...updates,
      [this.idField]: id,
    }
    return this.records[index]
  }

  /** Delete a record by ID, returning the deleted record or undefined */
  delete(id: string): T | undefined {
    const index = this.records.findIndex(r => (r as any)[this.idField] === id)
    if (index === -1) return undefined
    const deleted = this.records.splice(index, 1)[0]
    return deleted
  }

  /** Get the number of records */
  count(): number {
    return this.records.length
  }

  /** Clear all records */
  clear(): void {
    this.records = []
  }
}
