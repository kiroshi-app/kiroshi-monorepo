const isMacPlatform = () =>
	typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")

export { isMacPlatform }
