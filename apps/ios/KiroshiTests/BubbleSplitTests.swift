import Foundation
import Testing

@testable import Kiroshi

struct BubbleSplitTests {
    enum Kind: Equatable {
        case heading, paragraph, list, quote, code, table, rule
    }

    func kinds(_ text: String) -> [[Kind]] {
        BubbleSplit.groups(MarkdownMessage(text).blocks).map { $0.map(Self.kind) }
    }

    static func kind(_ block: MarkdownBlock) -> Kind {
        switch block {
        case .heading: .heading
        case .paragraph: .paragraph
        case .list: .list
        case .quote: .quote
        case .code: .code
        case .table: .table
        case .rule: .rule
        }
    }

    @Test func twoParagraphsApartAreTwoBubbles() {
        let groups = BubbleSplit.groups(MarkdownMessage("Drafted.\n\nApplications first.").blocks)

        #expect(
            groups == [
                [.paragraph(MarkdownInline(plain: "Drafted."))],
                [.paragraph(MarkdownInline(plain: "Applications first."))],
            ])
    }

    @Test func aMessageOfOneBlockIsOneBubble() {
        #expect(kinds("They’re waiting for your read.") == [[.paragraph]])
        #expect(kinds("Line one\nLine two") == [[.paragraph]])
    }

    @Test func anEmptyMessageHasNoBubble() {
        #expect(BubbleSplit.groups([]) == [])
        #expect(MarkdownMessage("").bubbles.isEmpty)
    }

    @Test func aHeadingGoesWithWhatFollowsIt() {
        #expect(
            kinds("### Ready to tag\nTwo are signed.\n\nLinux next.") == [
                [.heading, .paragraph], [.paragraph],
            ])
        #expect(kinds("## Steps\n\n- merge\n- tag") == [[.heading, .list]])
        #expect(
            kinds("# Notes\n## 4.2\n\nThirty-one changes.") == [[.heading, .heading, .paragraph]])
        #expect(kinds("Before.\n\n## Code\n\n```\nls\n```") == [[.paragraph], [.heading, .code]])
    }

    @Test func aHeadingStillWaitingForItsTextKeepsTheBubbleItOpens() {
        #expect(kinds("Done.\n\n## Next") == [[.paragraph], [.heading]])
    }

    @Test func aCodeBlockStaysWithTheParagraphJustBeforeIt() {
        #expect(
            kinds("Tag it with\n\n```sh\ngit tag v4.2.0\n\ngit push\n```") == [[.paragraph, .code]])
        #expect(kinds("```sh\nls\n```\n\nThat’s all.") == [[.code], [.paragraph]])
        #expect(kinds("- one\n- two\n\n```\nls\n```") == [[.list], [.code]])
    }

    @Test func aTableStaysWithTheSentenceIntroducingItAndTwoTablesSplit() {
        let table = "| Platform | Status |\n|---|---|\n| macOS | Signed |"

        #expect(kinds("Builds for 4.2.\n\n\(table)") == [[.paragraph, .table]])
        #expect(kinds("Builds:\n\n\(table)\n\n\(table)") == [[.paragraph, .table], [.table]])
        #expect(kinds("\(table)\n\nAll signed.") == [[.table], [.paragraph]])
    }

    @Test func aParagraphEndingWithAColonKeepsWhatItIntroduces() {
        #expect(kinds("Three things:\n\n- shipped\n- broke") == [[.paragraph, .list]])
        #expect(kinds("The review said:\n\n> Keep it short.") == [[.paragraph, .quote]])
        #expect(kinds("Here’s the gist:\n\nWe ship Thursday.") == [[.paragraph, .paragraph]])
        #expect(kinds("Some notes.\n\n- shipped") == [[.paragraph], [.list]])
    }

    @Test func aQuoteIsABubbleOfItsOwn() {
        #expect(
            kinds("Before.\n\n> Keep the sheet short.\n>\n> One hand on the phone.\n\nAfter.")
                == [[.paragraph], [.quote], [.paragraph]])
    }

    @Test func aRuleSplitsAndIsNotDrawn() {
        #expect(kinds("One.\n\n---\n\nTwo.") == [[.paragraph], [.paragraph]])
        #expect(kinds("Here:\n\n---\n\n```\nls\n```") == [[.paragraph], [.code]])
        #expect(kinds("## Notes\n\n---\n\nText.") == [[.heading], [.paragraph]])
        #expect(kinds("---\n\nOne.\n\n***") == [[.paragraph]])
        #expect(kinds("> One.\n>\n> ---\n>\n> Two.") == [[.quote]])
    }

    @Test func aMessageOfRulesAloneKeepsOneBubble() {
        #expect(kinds("---") == [[.rule]])
    }

    @Test func aListStaysOneBubbleNestedOrLoose() {
        #expect(kinds("- one\n  - two\n    - three\n- four") == [[.list]])
        #expect(kinds("- one\n\n- two\n\n- three") == [[.list]])
        #expect(kinds("1. merge\n\n   Wait for the queue.\n\n2. tag") == [[.list]])
    }

    @Test func mermaidAndMathFencesSplitLikeCodeBlocks() {
        #expect(kinds(MarkdownFixture.diagrams) == [[.paragraph, .code], [.paragraph, .code]])
    }

    @Test func theMixedReplySplitsAtEachParagraphCardQuoteAndRule() {
        #expect(
            kinds(MarkdownFixture.everyFamily) == [
                [.heading, .paragraph], [.paragraph, .list], [.quote], [.paragraph, .code],
                [.table], [.table], [.code],
            ])
        #expect(
            kinds(MarkdownFixture.mixedReply) == [
                [.heading, .paragraph, .table], [.paragraph, .code],
            ])
    }

    @Test func eachBubbleCarriesTheWholeMessageToCopy() {
        let message = MarkdownMessage("Before.\n\n> Keep it short.")

        #expect(message.bubbles.count == 2)
        #expect(message.bubbles.allSatisfy { $0.shownText == "Before.\n\n> Keep it short." })
    }

    @Test func blocksAppendedKeepEveryEarlierBubbleInItsPlace() {
        let blocks = MarkdownMessage(MarkdownFixture.everyFamily).blocks
        let whole = BubbleSplit.groups(blocks)

        for count in 1...blocks.count {
            let growing = BubbleSplit.groups(Array(blocks.prefix(count)))
            #expect(growing.dropLast() == whole.prefix(growing.count - 1))
            #expect(whole[growing.count - 1].starts(with: growing[growing.count - 1]))
        }
    }
}
