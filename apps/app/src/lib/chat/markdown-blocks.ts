const TABLE_DELIMITER = /^ {0,3}[-:|][-:| ]*$/

export const isTableBlock = (block: string): boolean => {
	const lines = block.split("\n")
	return (
		lines.length > 1 &&
		TABLE_DELIMITER.test(lines[1]) &&
		lines.every((line) => line.includes("|"))
	)
}
