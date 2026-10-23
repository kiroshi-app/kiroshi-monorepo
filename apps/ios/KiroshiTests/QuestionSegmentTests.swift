import SwiftUI
import Testing
import UIKit

@testable import Kiroshi

struct QuestionSegmentTests {
    func labelSize(at size: DynamicTypeSize) -> CGFloat {
        let category = UIContentSizeCategory(size.oneStepSmaller)
        let traits = UITraitCollection(preferredContentSizeCategory: category)
        return UIFont.preferredFont(forTextStyle: .subheadline, compatibleWith: traits).pointSize
    }

    @Test func theLabelReadsAtFourteenPointsAtTheDefaultSize() {
        #expect(DynamicTypeSize.large.oneStepSmaller == .medium)
        #expect(labelSize(at: .large) == 14)
    }

    @Test func theLabelKeepsScalingWithDynamicType() {
        let sizes = DynamicTypeSize.allCases.map(labelSize(at:))
        #expect(sizes == sizes.sorted())
        #expect(labelSize(at: .accessibility5) > labelSize(at: .xxxLarge))
    }

    @Test func theSmallestSizeStaysTheSmallest() {
        #expect(DynamicTypeSize.xSmall.oneStepSmaller == .xSmall)
    }
}
