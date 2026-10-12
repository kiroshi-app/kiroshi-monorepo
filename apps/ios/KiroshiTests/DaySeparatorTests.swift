import Testing

@testable import Kiroshi

@MainActor
struct DaySeparatorTests {
    @Test func aDayWithoutALabelHasNoSeparator() {
        #expect(DaySeparator(label: nil) == nil)
        #expect(DaySeparator(label: "") == nil)
    }

    @Test func aDayWithALabelShowsIt() {
        #expect(DaySeparator(label: "Today")?.label == "Today")
    }
}
