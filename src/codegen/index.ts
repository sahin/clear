import { ClearFile } from '../ast.js'
import { generateCode as generateTsCode, CodegenOptions } from './typescript.js'
import { generateExpressCode } from './express.js'
import { generateHonoCode } from './hono.js'
import { generateFastifyCode } from './fastify.js'
import { generateKoaCode } from './koa.js'

export type { CodegenOptions } from './typescript.js'

export function generateCode(ast: ClearFile, options: CodegenOptions = { target: 'typescript' }): string {
  switch (options.target) {
    case 'express':
      return generateExpressCode(ast)
    case 'hono':
      return generateHonoCode(ast)
    case 'fastify':
      return generateFastifyCode(ast)
    case 'koa':
      return generateKoaCode(ast)
    default:
      return generateTsCode(ast, options)
  }
}
