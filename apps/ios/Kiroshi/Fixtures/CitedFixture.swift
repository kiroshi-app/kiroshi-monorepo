#if DEBUG
    import UIKit

    enum CitedFixture {
        static let folder =
            "/Users/sam/Library/Application Support/com.kiroshi.app/attachments/c-juniper"
        static let chart = "\(folder)/6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png"
        static let notes = "\(folder)/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.pdf"
        static let missing = "\(folder)/9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a.png"

        static let reply = """
            Here’s how the build times moved this week:

            ![Build times, week 45](<\(chart)>)

            The 4.2 notes are ready for your review:

            [Release notes 4.2.pdf](<\(notes)>)

            I changed [ThreadMessage.swift](<apps/ios/Kiroshi/Conversations/ThreadMessage.swift>) to show them.
            """
        static let failedReply = """
            The screenshot of the crash:

            ![Crash on launch](<\(missing)>)
            """
        static let legacyBlock = """
            Both files from yesterday’s run.
            Attached to this message, sent 2026-11-04T16:20:00.000Z, 2 files:
            1/2 \(chart)
            2/2 \(notes)
            """

        static let chartImage: UIImage = {
            let size = CGSize(width: 640, height: 400)
            let format = UIGraphicsImageRendererFormat()
            format.scale = 2
            return UIGraphicsImageRenderer(size: size, format: format).image { context in
                UIColor.systemGray5.resolvedColor(with: .init(userInterfaceStyle: .light))
                    .setFill()
                context.fill(CGRect(origin: .zero, size: size))
                let heights: [CGFloat] = [180, 240, 150, 290, 210, 120, 260]
                for (index, height) in heights.enumerated() {
                    UIColor.kiroshi(index == 3 ? .primary : .ring).setFill()
                    let bar = CGRect(
                        x: 48 + CGFloat(index) * 82, y: size.height - 40 - height, width: 56,
                        height: height)
                    UIBezierPath(roundedRect: bar, cornerRadius: 10).fill()
                }
            }
        }()

        static let notesPDF: Data = {
            let page = CGRect(x: 0, y: 0, width: 612, height: 792)
            return UIGraphicsPDFRenderer(bounds: page).pdfData { context in
                context.beginPage()
                let title: [NSAttributedString.Key: Any] = [
                    .font: UIFont.preferredFont(forTextStyle: .largeTitle)
                ]
                let body: [NSAttributedString.Key: Any] = [
                    .font: UIFont.preferredFont(forTextStyle: .body)
                ]
                NSString("Release notes 4.2").draw(at: CGPoint(x: 56, y: 64), withAttributes: title)
                let lines = [
                    "Missions open from the iPhone.",
                    "Pinned rows keep their order.",
                    "An agent’s files show inline in its answer.",
                ]
                for (index, line) in lines.enumerated() {
                    ("• \(line)" as NSString).draw(
                        at: CGPoint(x: 56, y: 140 + CGFloat(index) * 32), withAttributes: body)
                }
            }
        }()

        static func answer(for file: String) -> String? {
            let (contentType, data): (String, Data?) =
                switch file {
                case CitedMessage.segments(of: chart).last: ("image/png", chartImage.pngData())
                case CitedMessage.segments(of: notes).last: ("application/pdf", notesPDF)
                default: ("", nil)
                }
            return data.map {
                #"{"contentType":"\#(contentType)","base64":"\#($0.base64EncodedString())"}"#
            }
        }
    }
#endif
