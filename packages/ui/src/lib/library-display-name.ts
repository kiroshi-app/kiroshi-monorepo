import type { TFunction } from "i18next"

export const libraryDisplayName = (name: string, t: TFunction<"common">) =>
	name.trim() === "" ? t("library.editor.untitled") : name
