import Testing

@testable import Kiroshi

struct InlineCodeTests {
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
}
