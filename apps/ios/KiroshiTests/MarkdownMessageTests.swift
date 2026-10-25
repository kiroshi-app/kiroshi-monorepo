import Foundation
import Testing

@testable import Kiroshi

struct MarkdownMessageTests {
    let juniper = Companion(id: "juniper", name: "Juniper")
    let basil = Companion(id: "basil-2", name: "Basil Hart")

    func inline(_ text: String) -> MarkdownInline {
        MarkdownInline(plain: text)
    }

    @Test func headingsKeepTheirLevelFromOneToSix() {
        let message = MarkdownMessage(
            "# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six")

        #expect(
            message.blocks == [
                .heading(level: 1, inline("One")), .heading(level: 2, inline("Two")),
                .heading(level: 3, inline("Three")), .heading(level: 4, inline("Four")),
                .heading(level: 5, inline("Five")), .heading(level: 6, inline("Six")),
            ])
    }

    @Test func twoParagraphsStayTwoBlocksOfOneMessage() {
        let message = MarkdownMessage("Drafted.\n\nApplications first.")

        #expect(
            message.blocks == [
                .paragraph(inline("Drafted.")), .paragraph(inline("Applications first.")),
            ])
    }

    @Test func aParagraphCarriesItsInlineMarksAndItsLink() throws {
        let message = MarkdownMessage(
            "The build is **green**, *new* and ~~Tuesday~~. Read the [checklist](https://kiroshi.app/c)."
        )

        guard case .paragraph(let paragraph) = message.blocks.first else {
            Issue.record("Expected a paragraph")
            return
        }
        let runs = paragraph.runs
        #expect(runs.first { $0.text == "green" }?.isStrong == true)
        #expect(runs.first { $0.text == "new" }?.isEmphasized == true)
        #expect(runs.first { $0.text == "Tuesday" }?.isStruck == true)
        #expect(
            runs.first { $0.text == "checklist" }?.link == URL(string: "https://kiroshi.app/c"))
        #expect(paragraph.plain == "The build is green, new and Tuesday. Read the checklist.")
    }

    @Test func nestedListsGoThreeDeepWithTheirMarkers() throws {
        let message = MarkdownMessage("- one\n  - two\n    - three\n- four")

        let list = try #require(Self.list(message.blocks.first))
        #expect(list.items.map(\.marker) == [.bullet(depth: 0), .bullet(depth: 0)])
        #expect(list.items.map(\.lead) == [inline("one"), inline("four")])
        let second = try #require(Self.list(list.items[0].rest.first))
        #expect(second.items.map(\.marker) == [.bullet(depth: 1)])
        let third = try #require(Self.list(second.items[0].rest.first))
        #expect(third.items.map(\.marker) == [.bullet(depth: 2)])
        #expect(third.items.map(\.lead) == [inline("three")])
    }

    @Test func numberedListsNumberThenLetterTheirNestedItems() throws {
        let message = MarkdownMessage(
            "1. Merge\n2. Tag\n   1. desktop first\n   2. then iPhone\n3. Post")

        let list = try #require(Self.list(message.blocks.first))
        #expect(list.items.map(\.marker) == [.number("1."), .number("2."), .number("3.")])
        let nested = try #require(Self.list(list.items[1].rest.first))
        #expect(nested.items.map(\.marker) == [.number("a."), .number("b.")])
    }

    @Test func numberingFollowsThirdLevelRomanNumerals() {
        #expect(MarkdownList.numberLabel(4, depth: 2) == "iv.")
        #expect(MarkdownList.numberLabel(27, depth: 1) == "aa.")
    }

    @Test func taskMarkersBecomeReadOnlyChecks() throws {
        let message = MarkdownMessage(
            "- [x] Changelog drafted\n- [X] Screenshots\n- [ ] App Store text")

        let list = try #require(Self.list(message.blocks.first))
        #expect(
            list.items.map(\.marker) == [
                .task(isDone: true), .task(isDone: true), .task(isDone: false),
            ])
        #expect(
            list.items.map(\.lead) == [
                inline("Changelog drafted"), inline("Screenshots"), inline("App Store text"),
            ])
        #expect(list.isTaskList)
    }

    @Test func aBracketThatIsNotATaskStaysText() throws {
        let message = MarkdownMessage("- [link](https://kiroshi.app) first\n- [y] no")

        let list = try #require(Self.list(message.blocks.first))
        #expect(list.items.map(\.marker) == [.bullet(depth: 0), .bullet(depth: 0)])
        #expect(list.items[1].lead == inline("[y] no"))
    }

    @Test func aQuoteHoldsItsBlocksAndARuleStandsAlone() {
        let message = MarkdownMessage(
            "> Keep it short.\n> One hand on the phone.\n\n---\n\nResolved.")

        #expect(
            message.blocks == [
                .quote([.paragraph(inline("Keep it short. One hand on the phone."))]),
                .rule,
                .paragraph(inline("Resolved.")),
            ])
    }

    @Test func inlineCodeIsItsOwnRun() throws {
        let message = MarkdownMessage("The flag is `--force-with-lease`.")

        guard case .paragraph(let paragraph) = message.blocks.first else {
            Issue.record("Expected a paragraph")
            return
        }
        #expect(paragraph.runs.map(\.kind) == [.text, .code, .text])
        #expect(paragraph.runs[1].text == "--force-with-lease")
    }

    @Test func aFencedBlockKeepsItsLanguageItsBlankLinesAndItsLongLines() {
        let long = String(repeating: "x", count: 200)
        let message = MarkdownMessage("Here:\n\n```swift\nlet a = 1\n\nlet b = \"\(long)\"\n```")

        #expect(
            message.blocks == [
                .paragraph(inline("Here:")),
                .code(MarkdownCode(language: "swift", text: "let a = 1\n\nlet b = \"\(long)\"")),
            ])
        #expect(message.hasCard)
    }

    @Test func aFenceWithoutLanguageHasNoLabel() {
        #expect(
            MarkdownMessage("```\nls\n```").blocks == [
                .code(MarkdownCode(language: nil, text: "ls"))
            ])
    }

    @Test func mermaidAndMathFencesStayCodeWithTheirLanguage() {
        let message = MarkdownMessage(
            "```mermaid\nflowchart LR\n  a --> b\n```\n\n```math\nS = \\sum_{i=1}^{n} a_i\n```")

        #expect(
            message.blocks == [
                .code(MarkdownCode(language: "mermaid", text: "flowchart LR\n  a --> b")),
                .code(MarkdownCode(language: "math", text: "S = \\sum_{i=1}^{n} a_i")),
            ])
    }

    @Test func inlineMathIsInlineCodeButAPriceIsNot() throws {
        let message = MarkdownMessage("It grows as $n^2$, from $5 to $10 a month.")

        guard case .paragraph(let paragraph) = message.blocks.first else {
            Issue.record("Expected a paragraph")
            return
        }
        #expect(paragraph.runs.filter { $0.kind == .code }.map(\.text) == ["$n^2$"])
        #expect(paragraph.plain == "It grows as $n^2$, from $5 to $10 a month.")
    }

    @Test func aTableKeepsItsHeaderRowsAndAlignments() throws {
        let message = MarkdownMessage(
            "| Platform | Size | Status |\n|:--|--:|:-:|\n| macOS | 48 MB | Signed |\n| Linux | 61 MB | Building |"
        )

        guard case .table(let table) = message.blocks.first else {
            Issue.record("Expected a table")
            return
        }
        #expect(table.alignments == [.leading, .trailing, .center])
        #expect(table.header == [inline("Platform"), inline("Size"), inline("Status")])
        #expect(table.rows.count == 2)
        #expect(
            table.tabSeparated
                == "Platform\tSize\tStatus\nmacOS\t48 MB\tSigned\nLinux\t61 MB\tBuilding")
    }

    @Test func aKnownMentionIsAChipNamedAfterTheCompanionThatNeverBreaks() throws {
        let message = MarkdownMessage("<@basil-2> can you take it?", among: [juniper, basil])

        guard case .paragraph(let paragraph) = message.blocks.first else {
            Issue.record("Expected a paragraph")
            return
        }
        #expect(paragraph.runs.first?.kind == .mention(isKnown: true))
        #expect(paragraph.runs.first?.text == "@Basil\u{00A0}Hart")
        #expect(message.shownText == "@Basil Hart can you take it?")
    }

    @Test func anUnknownMentionIsAnUnknownCompanionChip() throws {
        let message = MarkdownMessage("Asked <@ghost> too.", among: [juniper])

        guard case .paragraph(let paragraph) = message.blocks.first else {
            Issue.record("Expected a paragraph")
            return
        }
        #expect(paragraph.runs.map(\.kind) == [.text, .mention(isKnown: false), .text])
        #expect(paragraph.runs[1].text == "@Unknown\u{00A0}companion")
    }

    @Test func aMentionInCodeIsNamedButStaysCode() {
        let message = MarkdownMessage("```\nping <@juniper>\n```", among: [juniper])

        #expect(message.blocks == [.code(MarkdownCode(language: nil, text: "ping @Juniper"))])
    }

    @Test func withoutAuthorsAMentionTokenStaysAsWritten() {
        #expect(MarkdownMessage("Hi <@juniper>").blocks == [.paragraph(inline("Hi <@juniper>"))])
    }

    @Test func rawHTMLStaysEscapedText() {
        let message = MarkdownMessage("Press <b>Send</b>.\n\n<div>block</div>")

        #expect(
            message.blocks == [
                .paragraph(inline("Press <b>Send</b>.")), .paragraph(inline("<div>block</div>")),
            ])
    }

    @Test func footnotesStayPlainTextWithTheirDefinitionsAtTheEnd() {
        let message = MarkdownMessage("Shipped[^1].\n\n[^1]: On Thursday.\n\nThat's all.")

        #expect(
            message.blocks == [
                .paragraph(inline("Shipped[^1].")), .paragraph(inline("That's all.")),
                .paragraph(inline("[^1]: On Thursday.")),
            ])
    }

    @Test func blocksSpaceAsTheArtboardsDraw() {
        let paragraph = MarkdownBlock.paragraph(inline("p"))
        let list = MarkdownBlock.list(MarkdownList(items: []))

        #expect(
            MarkdownBlock.spacing(between: paragraph, and: .heading(level: 2, inline("h"))) == 16)
        #expect(
            MarkdownBlock.spacing(between: paragraph, and: .heading(level: 3, inline("h"))) == 14)
        #expect(
            MarkdownBlock.spacing(between: paragraph, and: .heading(level: 4, inline("h"))) == 12)
        #expect(
            MarkdownBlock.spacing(between: .heading(level: 1, inline("h")), and: paragraph) == 4)
        #expect(
            MarkdownBlock.spacing(between: .heading(level: 3, inline("h")), and: paragraph) == 2)
        #expect(
            MarkdownBlock.spacing(
                between: .heading(level: 5, inline("h")), and: .heading(level: 6, inline("h"))) == 4
        )
        #expect(MarkdownBlock.spacing(between: paragraph, and: list) == 6)
        #expect(MarkdownBlock.spacing(between: paragraph, and: .rule) == 10)
    }

    @Test func aMessageStillStreamingParsesWhatItHolds() {
        let message = MarkdownMessage("Tag it with:\n\n```sh\ngit tag v4")

        #expect(
            message.blocks == [
                .paragraph(inline("Tag it with:")),
                .code(MarkdownCode(language: "sh", text: "git tag v4")),
            ])
    }

    @Test(arguments: [
        "- [x] Changelog drafted", "```swift\nlet a = 1\n```", "> Keep it short.", "Hi.",
    ])
    func theFirstBlockOpensTheMessageWhateverItsKind(text: String) {
        #expect(MarkdownBlock.openingIndex(of: MarkdownMessage(text).blocks) == 0)
    }

    @Test func aLeadingRuleHandsTheOpeningToTheNextBlock() {
        let message = MarkdownMessage("---\n\n- Replies stream word by word")

        #expect(message.blocks.first == .rule)
        #expect(MarkdownBlock.openingIndex(of: message.blocks) == 1)
        #expect(MarkdownBlock.openingIndex(of: [.rule]) == 0)
    }

    static func list(_ block: MarkdownBlock?) -> MarkdownList? {
        guard case .list(let list) = block else { return nil }
        return list
    }
}
