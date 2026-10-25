import Foundation
import SwiftUI
import Testing
import UIKit

@testable import Kiroshi

struct InlineCodeTests {
    static let flag = "--force-with-lease"

    @Test func keepsEveryHyphenUnbreakableBelowTheAccessibilitySizes() {
        let shown = InlineText.shown(code: "--force-with-lease", breaksAfterWordHyphens: false)

        #expect(shown == "\u{2011}\u{2011}force\u{2011}with\u{2011}lease")
    }

    @Test func breaksOnlyAfterAHyphenThatFollowsAWordAtTheAccessibilitySizes() {
        let shown = InlineText.shown(code: "--force-with-lease", breaksAfterWordHyphens: true)

        #expect(shown == "\u{2011}\u{2011}force-with-lease")
    }

    @Test func leavesCodeWithoutHyphensAsItIs() {
        #expect(
            InlineText.shown(code: "push.default", breaksAfterWordHyphens: true) == "push.default")
    }

    @Test func copyMessageCopiesTheHyphensTheCompanionWroteFromEveryBubble() {
        let message = MarkdownMessage(MarkdownFixture.copiedCode)

        #expect(message.bubbles.count > 1)
        for bubble in message.bubbles {
            #expect(Array(bubble.shownText.utf8) == Array(MarkdownFixture.copiedCode.utf8))
        }
    }

    @Test func copyCodeCopiesTheHyphensTheCompanionWrote() throws {
        let message = MarkdownMessage(MarkdownFixture.copiedCode)
        let code = try #require(
            message.blocks.lazy.compactMap { block -> MarkdownCode? in
                if case .code(let code) = block { code } else { nil }
            }.first)

        #expect(Array(code.text.utf8) == Array("git push \(Self.flag)".utf8))
    }

    @Test func copyTableCopiesTheHyphensTheCompanionWroteInACodeCell() throws {
        let message = MarkdownMessage(MarkdownFixture.copiedCode)
        let table = try #require(
            message.blocks.lazy.compactMap { block -> MarkdownTable? in
                if case .table(let table) = block { table } else { nil }
            }.first)

        #expect(
            Array(table.tabSeparated.utf8)
                == Array("Flag\tRefuses\n\(Self.flag)\tA stale push".utf8))
    }

    @Test func theSpokenTextHoldsTheHyphensTheCompanionWroteAndKeepsTheLink() throws {
        let message = MarkdownMessage(MarkdownFixture.copiedCode)
        guard case .paragraph(let paragraph) = message.blocks[1] else {
            Issue.record("Expected a paragraph")
            return
        }

        let source = InlineText.source(of: paragraph)

        #expect(
            Array(String(source.characters).utf8)
                == Array("Read the push guide before \(Self.flag).".utf8))
        let link = try #require(source.runs.first { $0.link != nil })
        #expect(String(source[link.range].characters) == "push guide")
        #expect(link.link == URL(string: "https://kiroshi.app/support"))
    }

    @MainActor
    @Test(arguments: zip([DynamicTypeSize.large, .accessibility5], ["Push it with ", ""]))
    func theFlagHoldsOnOneLineWhereItFits(_ size: DynamicTypeSize, after prose: String) {
        let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(size))
        let body = UIFont.preferredFont(forTextStyle: .body, compatibleWith: traits)
        let code = UIFont.monospacedSystemFont(
            ofSize: UIFont.preferredFont(forTextStyle: .subheadline, compatibleWith: traits)
                .pointSize,
            weight: .regular)
        let shown = NSAttributedString(
            string: InlineText.chipEdge
                + InlineText.shown(
                    code: Self.flag, breaksAfterWordHyphens: size.isAccessibilitySize)
                + InlineText.chipEdge,
            attributes: [.font: code])
        let paragraph = NSMutableAttributedString(string: prose, attributes: [.font: body])
        paragraph.append(shown)
        paragraph.append(
            NSAttributedString(string: " refuses a stale push.", attributes: [.font: body]))

        let lines = Self.lines(of: paragraph, width: ceil(shown.size().width) + 1)

        let flag = NSRange(location: (prose as NSString).length, length: shown.length)
        #expect(lines.count > 1)
        #expect(lines.contains { NSIntersectionRange($0, flag) == flag }, "\(lines) \(flag)")
    }

    static func lines(of text: NSAttributedString, width: CGFloat) -> [NSRange] {
        let storage = NSTextStorage(attributedString: text)
        let layout = NSLayoutManager()
        let container = NSTextContainer(
            size: CGSize(width: width, height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        layout.addTextContainer(container)
        storage.addLayoutManager(layout)
        var lines: [NSRange] = []
        layout.enumerateLineFragments(
            forGlyphRange: layout.glyphRange(for: container)
        ) { _, _, _, glyphs, _ in
            lines.append(layout.characterRange(forGlyphRange: glyphs, actualGlyphRange: nil))
        }
        return lines
    }
}
