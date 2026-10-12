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

	it("accepts a version on the root", () => {
		const mark =
			'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 8 8"><path d="M0 0h8v8H0z"/></svg>'

		expect(allowedSvgMark(mark)).toContain('version="1.1"')
	})

	it("accepts an xmlns:xlink declaration on the root", () => {
		const mark =
			'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 8 8"><path d="M0 0h8v8H0z"/></svg>'

		expect(allowedSvgMark(mark)).toContain("<path")
	})

	it("accepts a class on any element", () => {
		const mark =
			'<svg xmlns="http://www.w3.org/2000/svg" class="icon" viewBox="0 0 8 8"><g class="shape"><path class="fill" d="M0 0h8v8H0z"/></g></svg>'

		expect(allowedSvgMark(mark)).toContain('class="fill"')
	})

	it("accepts a design tool export carrying version, class and xmlns:xlink together", () => {
		const mark =
			'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" class="icon" viewBox="0 0 8 8"><path d="M0 0h8v8H0z"/></svg>'

		expect(allowedSvgMark(mark)).toContain("<path")
	})

	it("refuses a version off the root", () => {
		expect(
			allowedSvgMark(markWith('<g version="1.1"><path d="M0 0h8v8H0z"/></g>')),
		).toBeNull()
	})

	it("refuses an xmlns:xlink declaration off the root", () => {
		expect(
			allowedSvgMark(
				markWith(
					'<g xmlns:xlink="http://www.w3.org/1999/xlink"><path d="M0 0h8v8H0z"/></g>',
				),
			),
		).toBeNull()
	})

	it("refuses an xlink:href even with xmlns:xlink declared", () => {
		const mark =
			'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" class="icon" viewBox="0 0 8 8"><path xlink:href="#a" d="M0 0h8v8H0z"/></svg>'

		expect(allowedSvgMark(mark)).toBeNull()
	})
})
