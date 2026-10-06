// A small preprocessor for WGSL sources (ADR 0022). WGSL has no preprocessor; takram's GLSL
// switches features with #ifdef, and keeping those blocks in the ported WGSL keeps the port close
// to the original and lets features be turned on and off.
//
// Supported, one directive per line:
//   #ifdef NAME, #ifndef NAME
//   #if EXPR, #elif EXPR    with defined(NAME), NAME, !, &&, || and parentheses
//   #else, #endif
// A bare NAME in an expression counts as defined(NAME). Lines that are left out, and the
// directive lines themselves, become empty lines, so line numbers in WGSL compiler errors still
// match the source file.

export type Defines = ReadonlySet<string>

function evaluate(expression: string, defines: Defines, line: number): boolean {
  const tokens = expression.match(/defined\s*\(\s*\w+\s*\)|\w+|&&|\|\||!|\(|\)/g) ?? []
  let position = 0
  const fail = (message: string): never => {
    throw new Error(`preprocess: line ${line}: ${message} in "#if ${expression}"`)
  }
  const peek = (): string | undefined => tokens[position]
  const next = (): string => tokens[position++] ?? fail('unexpected end')

  // or := and ('||' and)*; and := unary ('&&' unary)*; unary := '!' unary | primary
  const parseOr = (): boolean => {
    let value = parseAnd()
    while (peek() === '||') {
      next()
      const right = parseAnd()
      value = value || right
    }
    return value
  }
  const parseAnd = (): boolean => {
    let value = parseUnary()
    while (peek() === '&&') {
      next()
      const right = parseUnary()
      value = value && right
    }
    return value
  }
  const parseUnary = (): boolean => {
    if (peek() === '!') {
      next()
      return !parseUnary()
    }
    return parsePrimary()
  }
  const parsePrimary = (): boolean => {
    const token = next()
    if (token === '(') {
      const value = parseOr()
      if (next() !== ')') fail('missing )')
      return value
    }
    const defined = /^defined\s*\(\s*(\w+)\s*\)$/.exec(token)
    if (defined) return defines.has(defined[1])
    if (/^\w+$/.test(token)) return defines.has(token)
    return fail(`unexpected "${token}"`)
  }

  const value = parseOr()
  if (position < tokens.length) fail(`unexpected "${tokens[position]}"`)
  return value
}

interface Frame {
  /** Whether the enclosing block is kept. */
  parentActive: boolean
  /** Whether a branch of this #if chain has already been taken. */
  taken: boolean
  /** Whether the current branch is kept. */
  active: boolean
  sawElse: boolean
  line: number
}

export function preprocess(source: string, defines: Defines): string {
  const lines = source.split('\n')
  const stack: Frame[] = []
  const isActive = (): boolean => stack.length === 0 || stack[stack.length - 1].active
  const output = lines.map((text, index) => {
    const line = index + 1
    const directive = /^\s*#\s*(ifdef|ifndef|if|elif|else|endif)\b\s*(.*?)\s*(\/\/.*)?$/.exec(text)
    if (!directive) return isActive() ? text : ''
    const [, keyword, argument] = directive
    switch (keyword) {
      case 'ifdef':
      case 'ifndef':
      case 'if': {
        const parentActive = isActive()
        const condition =
          keyword === 'ifdef'
            ? defines.has(argument)
            : keyword === 'ifndef'
              ? !defines.has(argument)
              : evaluate(argument, defines, line)
        stack.push({
          parentActive,
          taken: condition,
          active: parentActive && condition,
          sawElse: false,
          line
        })
        break
      }
      case 'elif': {
        const frame = stack[stack.length - 1]
        if (!frame || frame.sawElse) throw new Error(`preprocess: line ${line}: #elif without #if`)
        const condition = !frame.taken && evaluate(argument, defines, line)
        frame.active = frame.parentActive && condition
        frame.taken ||= condition
        break
      }
      case 'else': {
        const frame = stack[stack.length - 1]
        if (!frame || frame.sawElse) throw new Error(`preprocess: line ${line}: #else without #if`)
        frame.active = frame.parentActive && !frame.taken
        frame.taken = true
        frame.sawElse = true
        break
      }
      case 'endif': {
        if (!stack.pop()) throw new Error(`preprocess: line ${line}: #endif without #if`)
        break
      }
    }
    return ''
  })
  if (stack.length > 0) {
    throw new Error(`preprocess: #if at line ${stack[stack.length - 1].line} has no #endif`)
  }
  return output.join('\n')
}
