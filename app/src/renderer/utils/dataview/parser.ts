/**
 * Dataview Query Parser
 * Recursive descent parser for Dataview query language
 */

import { Lexer, Token, TokenType } from './lexer'
import type {
  DataviewQuery,
  DataviewQueryType,
  DataviewFromClause,
  DataviewSort,
  DataviewExpression,
  DataviewComparison,
  DataviewOperator
} from '../../../shared/types'

export class ParseError extends Error {
  constructor(message: string, public position: number) {
    super(message)
    this.name = 'ParseError'
  }
}

export class Parser {
  private tokens: Token[] = []
  private position: number = 0

  parse(input: string): DataviewQuery {
    const lexer = new Lexer(input)
    this.tokens = lexer.tokenize()
    this.position = 0

    return this.parseQuery()
  }

  private current(): Token {
    return this.tokens[this.position] || { type: 'EOF', value: '', position: 0 }
  }

  private advance(): Token {
    const token = this.current()
    this.position++
    return token
  }

  private expect(type: TokenType): Token {
    const token = this.current()
    if (token.type !== type) {
      throw new ParseError(`Expected ${type}, got ${token.type}`, token.position)
    }
    return this.advance()
  }

  private match(...types: TokenType[]): boolean {
    return types.includes(this.current().type)
  }

  private parseQuery(): DataviewQuery {
    // Parse query type: LIST, TABLE, or TASK
    const queryType = this.parseQueryType()

    const query: DataviewQuery = { type: queryType }

    // TABLE can have field list
    if (queryType === 'TABLE' && !this.match('FROM', 'WHERE', 'SORT', 'LIMIT', 'EOF')) {
      query.fields = this.parseFieldList()
    }

    // Optional FROM clause
    if (this.match('FROM')) {
      query.from = this.parseFrom()
    }

    // Optional WHERE clause
    if (this.match('WHERE')) {
      query.where = this.parseWhere()
    }

    // Optional SORT clause
    if (this.match('SORT')) {
      query.sort = this.parseSort()
    }

    // Optional LIMIT clause
    if (this.match('LIMIT')) {
      query.limit = this.parseLimit()
    }

    return query
  }

  private parseQueryType(): DataviewQueryType {
    const token = this.current()

    if (token.type === 'LIST') {
      this.advance()
      return 'LIST'
    }
    if (token.type === 'TABLE') {
      this.advance()
      return 'TABLE'
    }
    if (token.type === 'TASK') {
      this.advance()
      return 'TASK'
    }

    throw new ParseError('Expected LIST, TABLE, or TASK', token.position)
  }

  private parseFieldList(): string[] {
    const fields: string[] = []

    // First field
    fields.push(this.parseFieldPath())

    // Additional fields separated by comma
    while (this.match('COMMA')) {
      this.advance() // Skip comma
      fields.push(this.parseFieldPath())
    }

    return fields
  }

  private parseFieldPath(): string {
    let path = ''

    // Can be identifier or identifier.identifier (e.g., file.name)
    if (this.match('IDENTIFIER')) {
      path = this.advance().value
    } else {
      throw new ParseError('Expected field name', this.current().position)
    }

    // Handle dot notation
    while (this.match('DOT')) {
      this.advance() // Skip dot
      if (this.match('IDENTIFIER')) {
        path += '.' + this.advance().value
      } else {
        throw new ParseError('Expected field name after dot', this.current().position)
      }
    }

    return path
  }

  private parseFrom(): DataviewFromClause {
    this.expect('FROM')

    const from: DataviewFromClause = {}

    // Parse first source
    this.parseSource(from)

    // Parse additional sources with AND/OR
    while (this.match('AND', 'OR')) {
      this.advance() // consume AND/OR token
      // For now, AND means intersection, OR means union
      // We'll handle this in executor
      this.parseSource(from)
    }

    return from
  }

  private parseSource(from: DataviewFromClause): void {
    const token = this.current()

    // Tag: #tag
    if (token.type === 'TAG') {
      if (!from.tags) from.tags = []
      from.tags.push(this.advance().value)
      return
    }

    // Folder: "Folder/Path"
    if (token.type === 'STRING') {
      if (!from.folders) from.folders = []
      from.folders.push(this.advance().value)
      return
    }

    // Link: [[NoteName]]
    if (token.type === 'LINK') {
      if (!from.links) from.links = {}
      // outgoing links from the specified note
      if (!from.links.from) from.links.from = []
      from.links.from.push(this.advance().value)
      return
    }

    throw new ParseError('Expected tag (#tag), folder ("path"), or link ([[note]])', token.position)
  }

  private parseWhere(): DataviewExpression {
    this.expect('WHERE')
    return this.parseExpression()
  }

  private parseExpression(): DataviewExpression {
    return this.parseOr()
  }

  private parseOr(): DataviewExpression {
    let left = this.parseAnd()

    while (this.match('OR')) {
      this.advance()
      const right = this.parseAnd()
      left = {
        type: 'logical',
        operator: 'OR',
        left,
        right
      }
    }

    return left
  }

  private parseAnd(): DataviewExpression {
    let left = this.parseNot()

    while (this.match('AND')) {
      this.advance()
      const right = this.parseNot()
      left = {
        type: 'logical',
        operator: 'AND',
        left,
        right
      }
    }

    return left
  }

  private parseNot(): DataviewExpression {
    if (this.match('NOT')) {
      this.advance()
      return {
        type: 'not',
        expression: this.parseNot()
      }
    }

    return this.parsePrimary()
  }

  private parsePrimary(): DataviewExpression {
    // Parenthesized expression
    if (this.match('LPAREN')) {
      this.advance()
      const expr = this.parseExpression()
      this.expect('RPAREN')
      return expr
    }

    // Negation with !
    if (this.current().value === '!' || this.match('NOT')) {
      this.advance()
      return {
        type: 'not',
        expression: this.parsePrimary()
      }
    }

    // Function call or field reference
    if (this.match('IDENTIFIER', 'CONTAINS')) {
      const name = this.advance().value

      // Check for function call
      if (this.match('LPAREN')) {
        return this.parseFunctionCall(name.toLowerCase())
      }

      // Handle dot notation
      let fieldPath = name
      while (this.match('DOT')) {
        this.advance()
        if (this.match('IDENTIFIER')) {
          fieldPath += '.' + this.advance().value
        }
      }

      // Check for comparison
      if (this.match('EQ', 'NEQ', 'GT', 'LT', 'GTE', 'LTE', 'CONTAINS')) {
        return this.parseComparison(fieldPath)
      }

      // Just a field reference (truthy check)
      return { type: 'field', name: fieldPath }
    }

    throw new ParseError('Unexpected token in expression', this.current().position)
  }

  private parseFunctionCall(name: string): DataviewExpression {
    this.expect('LPAREN')

    const args: (string | number | DataviewExpression)[] = []

    // Parse arguments
    if (!this.match('RPAREN')) {
      args.push(this.parseFunctionArg())

      while (this.match('COMMA')) {
        this.advance()
        args.push(this.parseFunctionArg())
      }
    }

    this.expect('RPAREN')

    // Check if this is followed by a comparison
    if (this.match('EQ', 'NEQ', 'GT', 'LT', 'GTE', 'LTE')) {
      const funcExpr: DataviewExpression = {
        type: 'function',
        name,
        args
      }
      // Wrap in comparison
      const op = this.parseOperator()
      const value = this.parseValue()
      return {
        type: 'comparison',
        field: `__func__${name}`,
        operator: op,
        value: { funcExpr, compareValue: value }
      } as DataviewComparison
    }

    return {
      type: 'function',
      name,
      args
    }
  }

  private parseFunctionArg(): string | number | DataviewExpression {
    const token = this.current()

    if (token.type === 'STRING') {
      return this.advance().value
    }

    if (token.type === 'NUMBER') {
      return Number(this.advance().value)
    }

    if (token.type === 'IDENTIFIER') {
      // Could be a field reference or nested function
      const name = this.advance().value
      let fieldPath = name

      // Handle dot notation
      while (this.match('DOT')) {
        this.advance()
        if (this.match('IDENTIFIER')) {
          fieldPath += '.' + this.advance().value
        }
      }

      if (this.match('LPAREN')) {
        // Nested function call
        return this.parseFunctionCall(fieldPath.toLowerCase())
      }

      return fieldPath
    }

    throw new ParseError('Expected function argument', token.position)
  }

  private parseComparison(field: string): DataviewComparison {
    const operator = this.parseOperator()
    const value = this.parseValue()

    return {
      type: 'comparison',
      field,
      operator,
      value
    }
  }

  private parseOperator(): DataviewOperator {
    const token = this.current()

    const opMap: Partial<Record<TokenType, DataviewOperator>> = {
      'EQ': '=',
      'NEQ': '!=',
      'GT': '>',
      'LT': '<',
      'GTE': '>=',
      'LTE': '<=',
      'CONTAINS': 'contains'
    }

    const op = opMap[token.type]
    if (op) {
      this.advance()
      return op
    }

    throw new ParseError('Expected comparison operator', token.position)
  }

  private parseValue(): unknown {
    const token = this.current()

    if (token.type === 'STRING') {
      return this.advance().value
    }

    if (token.type === 'NUMBER') {
      return Number(this.advance().value)
    }

    if (token.type === 'BOOLEAN') {
      const val = this.advance().value
      return val === 'true'
    }

    if (token.type === 'TAG') {
      return '#' + this.advance().value
    }

    if (token.type === 'IDENTIFIER') {
      const name = this.advance().value

      // Check for function call like date(today)
      if (this.match('LPAREN')) {
        return this.parseFunctionCall(name.toLowerCase())
      }

      // Could be a reference to another field or a bare string
      return name
    }

    throw new ParseError('Expected value', token.position)
  }

  private parseSort(): DataviewSort[] {
    this.expect('SORT')

    const sorts: DataviewSort[] = []

    // First sort field
    sorts.push(this.parseSortField())

    // Additional sort fields
    while (this.match('COMMA')) {
      this.advance()
      sorts.push(this.parseSortField())
    }

    return sorts
  }

  private parseSortField(): DataviewSort {
    const field = this.parseFieldPath()
    let direction: 'ASC' | 'DESC' = 'ASC'

    if (this.match('ASC')) {
      this.advance()
      direction = 'ASC'
    } else if (this.match('DESC')) {
      this.advance()
      direction = 'DESC'
    }

    return { field, direction }
  }

  private parseLimit(): number {
    this.expect('LIMIT')

    if (this.match('NUMBER')) {
      return Number(this.advance().value)
    }

    throw new ParseError('Expected number after LIMIT', this.current().position)
  }
}
