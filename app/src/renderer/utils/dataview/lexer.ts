/**
 * Dataview Query Lexer
 * Tokenizes a Dataview query string into tokens
 */

export type TokenType =
  | 'LIST' | 'TABLE' | 'TASK'
  | 'FROM' | 'WHERE' | 'SORT' | 'LIMIT' | 'GROUP'
  | 'BY' | 'ASC' | 'DESC'
  | 'AND' | 'OR' | 'NOT'
  | 'TAG' | 'STRING' | 'NUMBER' | 'BOOLEAN'
  | 'IDENTIFIER' | 'FIELD'
  | 'LPAREN' | 'RPAREN' | 'LBRACKET' | 'RBRACKET'
  | 'COMMA' | 'DOT'
  | 'EQ' | 'NEQ' | 'GT' | 'LT' | 'GTE' | 'LTE'
  | 'CONTAINS'
  | 'LINK'
  | 'EOF'

export interface Token {
  type: TokenType
  value: string
  position: number
}

const KEYWORDS: Record<string, TokenType> = {
  'LIST': 'LIST',
  'TABLE': 'TABLE',
  'TASK': 'TASK',
  'FROM': 'FROM',
  'WHERE': 'WHERE',
  'SORT': 'SORT',
  'LIMIT': 'LIMIT',
  'GROUP': 'GROUP',
  'BY': 'BY',
  'ASC': 'ASC',
  'DESC': 'DESC',
  'AND': 'AND',
  'OR': 'OR',
  'NOT': 'NOT',
  'CONTAINS': 'CONTAINS',
  'TRUE': 'BOOLEAN',
  'FALSE': 'BOOLEAN',
}

export class Lexer {
  private input: string
  private position: number = 0
  private tokens: Token[] = []

  constructor(input: string) {
    this.input = input
  }

  tokenize(): Token[] {
    this.tokens = []
    this.position = 0

    while (this.position < this.input.length) {
      this.skipWhitespace()
      if (this.position >= this.input.length) break

      const token = this.nextToken()
      if (token) {
        this.tokens.push(token)
      }
    }

    this.tokens.push({ type: 'EOF', value: '', position: this.position })
    return this.tokens
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length && /\s/.test(this.input[this.position])) {
      this.position++
    }
  }

  private nextToken(): Token | null {
    const char = this.input[this.position]
    const startPos = this.position

    // Tag: #tagname
    if (char === '#') {
      return this.readTag()
    }

    // String: "..." or '...'
    if (char === '"' || char === "'") {
      return this.readString(char)
    }

    // Link: [[...]]
    if (char === '[' && this.peek(1) === '[') {
      return this.readLink()
    }

    // Comparison operators
    if (char === '!' && this.peek(1) === '=') {
      this.position += 2
      return { type: 'NEQ', value: '!=', position: startPos }
    }
    if (char === '>' && this.peek(1) === '=') {
      this.position += 2
      return { type: 'GTE', value: '>=', position: startPos }
    }
    if (char === '<' && this.peek(1) === '=') {
      this.position += 2
      return { type: 'LTE', value: '<=', position: startPos }
    }
    if (char === '=') {
      this.position++
      return { type: 'EQ', value: '=', position: startPos }
    }
    if (char === '>') {
      this.position++
      return { type: 'GT', value: '>', position: startPos }
    }
    if (char === '<') {
      this.position++
      return { type: 'LT', value: '<', position: startPos }
    }

    // Negation
    if (char === '!') {
      this.position++
      return { type: 'NOT', value: '!', position: startPos }
    }

    // Parentheses
    if (char === '(') {
      this.position++
      return { type: 'LPAREN', value: '(', position: startPos }
    }
    if (char === ')') {
      this.position++
      return { type: 'RPAREN', value: ')', position: startPos }
    }

    // Comma
    if (char === ',') {
      this.position++
      return { type: 'COMMA', value: ',', position: startPos }
    }

    // Dot
    if (char === '.') {
      this.position++
      return { type: 'DOT', value: '.', position: startPos }
    }

    // Number (including negative)
    if (/\d/.test(char) || (char === '-' && /\d/.test(this.peek(1) || ''))) {
      return this.readNumber()
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(char)) {
      return this.readIdentifier()
    }

    // Unknown character, skip it
    this.position++
    return null
  }

  private peek(offset: number = 1): string | null {
    const pos = this.position + offset
    return pos < this.input.length ? this.input[pos] : null
  }

  private readTag(): Token {
    const startPos = this.position
    this.position++ // Skip #

    let value = ''
    while (this.position < this.input.length && /[\p{L}\p{N}_\-/]/u.test(this.input[this.position])) {
      value += this.input[this.position]
      this.position++
    }

    return { type: 'TAG', value, position: startPos }
  }

  private readString(quote: string): Token {
    const startPos = this.position
    this.position++ // Skip opening quote

    let value = ''
    while (this.position < this.input.length && this.input[this.position] !== quote) {
      if (this.input[this.position] === '\\' && this.position + 1 < this.input.length) {
        this.position++
        value += this.input[this.position]
      } else {
        value += this.input[this.position]
      }
      this.position++
    }

    if (this.position < this.input.length) {
      this.position++ // Skip closing quote
    }

    return { type: 'STRING', value, position: startPos }
  }

  private readLink(): Token {
    const startPos = this.position
    this.position += 2 // Skip [[

    let value = ''
    while (this.position < this.input.length) {
      if (this.input[this.position] === ']' && this.peek(1) === ']') {
        this.position += 2
        break
      }
      value += this.input[this.position]
      this.position++
    }

    return { type: 'LINK', value, position: startPos }
  }

  private readNumber(): Token {
    const startPos = this.position
    let value = ''

    if (this.input[this.position] === '-') {
      value += '-'
      this.position++
    }

    while (this.position < this.input.length && /[\d.]/.test(this.input[this.position])) {
      value += this.input[this.position]
      this.position++
    }

    return { type: 'NUMBER', value, position: startPos }
  }

  private readIdentifier(): Token {
    const startPos = this.position
    let value = ''

    while (this.position < this.input.length && /[\p{L}\p{N}_\-.]/u.test(this.input[this.position])) {
      value += this.input[this.position]
      this.position++
    }

    // Check if it's a keyword
    const upper = value.toUpperCase()
    if (KEYWORDS[upper]) {
      const type = KEYWORDS[upper]
      return { type, value: upper === 'TRUE' || upper === 'FALSE' ? value.toLowerCase() : upper, position: startPos }
    }

    // It's an identifier (field name)
    return { type: 'IDENTIFIER', value, position: startPos }
  }
}
