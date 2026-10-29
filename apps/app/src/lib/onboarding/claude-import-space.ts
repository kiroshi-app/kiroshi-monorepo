export const importSpaceIdOf = (
	openRowId: string | null,
	localSpaceIds: string[],
): string | null =>
	openRowId && localSpaceIds.includes(openRowId)
		? openRowId
		: (localSpaceIds[0] ?? null)
