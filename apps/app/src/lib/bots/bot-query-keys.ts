export const botQueryKeys = {
	all: ["bots"] as const,
	modelCatalogue: () => [...botQueryKeys.all, "model-catalogue"] as const,
}
