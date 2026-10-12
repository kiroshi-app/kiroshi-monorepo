import Testing

@testable import Kiroshi

struct DeviceNameTests {
    @Test func keepsTheTrimmedName() {
        #expect(DeviceName.of(name: "  Sam's iPhone \n", model: "iPhone") == "Sam's iPhone")
    }

    @Test func clipsALongNameToSixtyFourCharacters() {
        let name = String(repeating: "a", count: 80)

        #expect(DeviceName.of(name: name, model: "iPhone") == String(repeating: "a", count: 64))
    }

    @Test func clipsBetweenCharactersAsTheCloudCountsThem() {
        let name = String(repeating: "a", count: 63) + "👋🏽" + "b"

        let named = DeviceName.of(name: name, model: "iPhone")

        #expect(named == String(repeating: "a", count: 63))
        #expect(named.utf16.count <= DeviceName.maxLength)
    }

    @Test func dropsTheSpacesLeftAtTheClip() {
        let name = String(repeating: "a", count: 63) + " Pro"

        #expect(DeviceName.of(name: name, model: "iPhone") == String(repeating: "a", count: 63))
    }

    @Test(arguments: ["", "   ", "\n\t"])
    func anEmptyNameFallsBackToTheModel(name: String) {
        #expect(DeviceName.of(name: name, model: "iPhone") == "iPhone")
    }
}
