import Testing

@testable import Kiroshi

struct MentionsTests {
    let juniper = Companion(id: "juniper-6", name: "Juniper")
    let june = Companion(id: "june-1", name: "June")
    let atlas = Companion(id: "atlas-3", name: "Atlas")

    var members: [Companion] { [juniper, june, atlas] }

    @Test func anAtSignAtTheEndOfTheDraftOpensAQuery() {
        #expect(Mentions.query(in: "@") == "")
        #expect(Mentions.query(in: "Ship it @ju") == "ju")
        #expect(Mentions.query(in: "Line one\n@At") == "At")
        #expect(Mentions.query(in: "sam@example") == nil)
        #expect(Mentions.query(in: "@Juniper ") == nil)
        #expect(Mentions.query(in: "No mention") == nil)
    }

    @Test func theQueryKeepsTheCompanionsWhoseNameContainsIt() {
        #expect(Mentions.candidates(for: "", among: members) == members)
        #expect(Mentions.candidates(for: "JU", among: members) == [juniper, june])
        #expect(Mentions.candidates(for: "las", among: members) == [atlas])
        #expect(Mentions.candidates(for: "zz", among: members).isEmpty)
    }

    @Test func pickingReplacesTheQueryWithTheNameAndASpace() {
        #expect(Mentions.picking(atlas, in: "Ship it @at") == "Ship it @Atlas ")
        #expect(Mentions.picking(juniper, in: "@") == "@Juniper ")
        #expect(Mentions.picking(juniper, in: "No query") == "No query")
    }

    @Test func aNameAfterAnAtSignIsSentAsTheHostsToken() {
        #expect(
            Mentions.tokens(in: "@Juniper and @atlas, ship it", among: members)
                == "<@juniper-6> and <@atlas-3>, ship it")
        #expect(Mentions.tokens(in: "@June look", among: members) == "<@june-1> look")
        #expect(Mentions.tokens(in: "@Juniperx", among: members) == "<@juniper-6>x")
        #expect(
            Mentions.tokens(in: "sam@example.com @Otto", among: members) == "sam@example.com @Otto")
        #expect(Mentions.tokens(in: "<@atlas-3> stays", among: members) == "<@atlas-3> stays")
    }

    @Test func theSummonedAreTheMentionedMembersOnceEachInOrder() {
        let content = "<@atlas-3> then <@juniper-6>, <@atlas-3> again, <@otto-5> left"
        #expect(Mentions.summoned(in: content, among: members) == ["atlas-3", "juniper-6"])
        #expect(Mentions.summoned(in: "Nobody named", among: members).isEmpty)
    }

    @Test func aStoredTokenReadsAsTheCompanionsName() {
        #expect(
            Mentions.names(in: "<@juniper-6> ping <@otto-5>", among: members)
                == "@Juniper ping @Unknown agent")
    }

    @Test func aTokenIsShownAsANameOnlyWhenTheAuthorsAreKnown() {
        #expect(Mentions.shown(in: "<@atlas-3> look", among: members) == "@Atlas look")
        #expect(Mentions.shown(in: "<@atlas-3> look", among: []) == "<@atlas-3> look")
    }
}
