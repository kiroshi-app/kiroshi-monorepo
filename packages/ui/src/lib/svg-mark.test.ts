// @vitest-environment happy-dom

import { describe, expect, it } from "vitest"

import { allowedSvgMark } from "@workspace/ui/lib/svg-mark"

const SUPERSET_LOGO =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 78 78" fill="currentColor"><path d="M12 0h66v12H12z"/></svg>'

const markWith = (drawing: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">${drawing}</svg>`

describe("allowed svg mark", () => {
	it("accepts a logo drawn from paths and returns it serialised", () => {
		expect(allowedSvgMark(SUPERSET_LOGO)).toContain("<path")
	})

	it("accepts a mark that omits its xmlns declaration", () => {
		const mark = '<svg viewBox="0 0 8 8"><rect width="8" height="8"/></svg>'

		expect(allowedSvgMark(mark)).toContain("<rect")
	})

	it("refuses a script", () => {
		expect(allowedSvgMark(markWith("<script>alert(1)</script>"))).toBeNull()
	})

	it("refuses an onload attribute on the root", () => {
		const mark =
			'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0h8v8H0z"/></svg>'

		expect(allowedSvgMark(mark)).toBeNull()
	})

	it("refuses a foreign object", () => {
		expect(
			allowedSvgMark(markWith("<foreignObject><div>hi</div></foreignObject>")),
		).toBeNull()
	})

	it("refuses an image and a use pointing elsewhere", () => {
		expect(
			allowedSvgMark(markWith('<image href="https://x.test/a.png"/>')),
		).toBeNull()
		expect(allowedSvgMark(markWith('<use href="#a"/>'))).toBeNull()
	})

	it("refuses a style attribute", () => {
		expect(
			allowedSvgMark(markWith('<path style="fill:red" d="M0 0h8v8H0z"/>')),
		).toBeNull()
	})

	it("refuses text that is not well-formed XML", () => {
		expect(allowedSvgMark("<svg")).toBeNull()
	})

	it("refuses a link", () => {
		expect(
			allowedSvgMark(markWith('<a><path d="M0 0h8v8H0z"/></a>')),
		).toBeNull()
	})
})
