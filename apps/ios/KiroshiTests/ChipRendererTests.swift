import CoreGraphics
import Testing

@testable import Kiroshi

struct ChipRendererTests {
    @Test func cutsAChipThatRunsPastTheEndOfItsLineAtTheTextsEdge() {
        let chip = CGRect(x: 230, y: 64, width: 120, height: 22)

        #expect(
            ChipRenderer.shown(chip, within: 317) == CGRect(x: 230, y: 64, width: 87, height: 22))
    }

    @Test func leavesAChipInsideItsLineAsItIs() {
        let chip = CGRect(x: 40, y: 0, width: 96, height: 22)

        #expect(ChipRenderer.shown(chip, within: 317) == chip)
    }

    @Test func drawsNothingOfAChipWhollyPastTheTextsEdge() {
        #expect(ChipRenderer.shown(CGRect(x: 320, y: 0, width: 6, height: 22), within: 317).isEmpty)
    }

    @Test func fillsChipsAsTextOnceTheTextIsTallerThanTheLargestTextureAtItsScale() {
        #expect(!InlineText.isTooTallForOneTexture(height: 5461, scale: 3))
        #expect(InlineText.isTooTallForOneTexture(height: 5462, scale: 3))
        #expect(!InlineText.isTooTallForOneTexture(height: 8192, scale: 2))
        #expect(InlineText.isTooTallForOneTexture(height: 8193, scale: 2))
    }
}
