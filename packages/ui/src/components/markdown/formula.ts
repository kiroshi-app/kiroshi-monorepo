type FormulaValues = Readonly<Record<string, number>>

type Formula = (values: FormulaValues) => number

type Token =
	| { kind: "number"; value: number }
	| { kind: "name"; value: string }
	| { kind: "symbol"; value: string }

const TOKEN_PATTERN = /\s*(?:(\d+(?:\.\d+)?)|([a-z][a-z0-9_]*)|([-+*/^(),]))/y

const UNARY_FUNCTIONS: Readonly<Record<string, (value: number) => number>> = {
	abs: Math.abs,
	sqrt: Math.sqrt,
	exp: Math.exp,
	ln: Math.log,
	log10: Math.log10,
	floor: Math.floor,
	ceil: Math.ceil,
	round: Math.round,
}

const BINARY_FUNCTIONS: Readonly<
	Record<string, (left: number, right: number) => number>
> = {
	min: Math.min,
	max: Math.max,
}

const BINARY_OPERATORS: Readonly<
	Record<string, (left: number, right: number) => number>
> = {
	"+": (left, right) => left + right,
	"-": (left, right) => left - right,
	"*": (left, right) => left * right,
	"/": (left, right) => left / right,
}

class FormulaSyntaxError extends Error {}

const tokenize = (source: string): Token[] => {
	const tokens: Token[] = []
	TOKEN_PATTERN.lastIndex = 0

	while (source.slice(TOKEN_PATTERN.lastIndex).trim() !== "") {
		const match = TOKEN_PATTERN.exec(source)
		if (!match) throw new FormulaSyntaxError()
		const [, number, name, symbol] = match
		if (number !== undefined) tokens.push({ kind: "number", value: +number })
		else if (name !== undefined) tokens.push({ kind: "name", value: name })
		else tokens.push({ kind: "symbol", value: symbol })
	}

	return tokens
}

const parseFormula = (tokens: Token[], names: ReadonlySet<string>): Formula => {
	let position = 0

	const peekSymbol = (symbol: string) => {
		const token = tokens[position]
		return token?.kind === "symbol" && token.value === symbol
	}

	const expectSymbol = (symbol: string) => {
		if (!peekSymbol(symbol)) throw new FormulaSyntaxError()
		position += 1
	}

	const takeOperator = (symbols: readonly string[]) => {
		const symbol = symbols.find(peekSymbol)
		if (symbol !== undefined) position += 1
		return symbol
	}

	const leftGrouping = (
		symbols: readonly string[],
		operand: () => Formula,
	): Formula => {
		let formula = operand()
		for (
			let symbol = takeOperator(symbols);
			symbol !== undefined;
			symbol = takeOperator(symbols)
		) {
			const left = formula
			const right = operand()
			const apply = BINARY_OPERATORS[symbol]
			formula = (values) => apply(left(values), right(values))
		}
		return formula
	}

	const sum = (): Formula => leftGrouping(["+", "-"], product)

	const product = (): Formula => leftGrouping(["*", "/"], unary)

	const unary = (): Formula => {
		if (takeOperator(["-"]) === undefined) return power()
		const operand = unary()
		return (values) => -operand(values)
	}

	const power = (): Formula => {
		const base = atom()
		if (takeOperator(["^"]) === undefined) return base
		const exponent = unary()
		return (values) => base(values) ** exponent(values)
	}

	const call = (name: string): Formula => {
		expectSymbol("(")
		const first = sum()
		const binary = BINARY_FUNCTIONS[name]
		if (binary) {
			expectSymbol(",")
			const second = sum()
			expectSymbol(")")
			return (values) => binary(first(values), second(values))
		}
		expectSymbol(")")
		const apply = UNARY_FUNCTIONS[name]
		return (values) => apply(first(values))
	}

	const isFunction = (name: string) =>
		Object.hasOwn(UNARY_FUNCTIONS, name) ||
		Object.hasOwn(BINARY_FUNCTIONS, name)

	const atom = (): Formula => {
		const token = tokens[position]
		if (!token) throw new FormulaSyntaxError()
		position += 1

		if (token.kind === "number") {
			const { value } = token
			return () => value
		}
		if (token.kind === "name") {
			if (isFunction(token.value) && peekSymbol("(")) return call(token.value)
			if (!names.has(token.value)) throw new FormulaSyntaxError()
			const { value: name } = token
			return (values) => values[name] ?? Number.NaN
		}
		if (token.value !== "(") throw new FormulaSyntaxError()
		const inner = sum()
		expectSymbol(")")
		return inner
	}

	const formula = sum()
	if (position !== tokens.length) throw new FormulaSyntaxError()
	return formula
}

export const compileFormula = (
	source: string,
	names: ReadonlySet<string>,
): Formula | null => {
	try {
		return parseFormula(tokenize(source), names)
	} catch (error) {
		if (error instanceof FormulaSyntaxError) return null
		throw error
	}
}

export type { Formula }
