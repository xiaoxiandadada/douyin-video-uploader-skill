import Foundation
import Vision
import ImageIO

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

guard CommandLine.arguments.count >= 2 else {
    fail("usage: swift extract_douyin_otp_from_image.swift <image-path>")
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard let source = CGImageSourceCreateWithURL(imageURL as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fail("could not load image")
}

var recognized = [String]()
let request = VNRecognizeTextRequest { request, error in
    if let error = error {
        fail(error.localizedDescription)
    }
    let observations = request.results as? [VNRecognizedTextObservation] ?? []
    recognized = observations.compactMap { observation in
        observation.topCandidates(1).first?.string
    }
}

request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
if #available(macOS 12.0, *) {
    request.recognitionLanguages = ["zh-Hans", "en-US"]
}

let handler = VNImageRequestHandler(cgImage: image, options: [:])
try handler.perform([request])

let text = recognized.joined(separator: "\n")
let preferredPatterns = [
    "验证码[^0-9]{0,16}([0-9]{6})",
    "抖音[\\s\\S]{0,80}?([0-9]{6})",
    "(?<![0-9])([0-9]{6})(?![0-9])"
]

for pattern in preferredPatterns {
    let regex = try NSRegularExpression(pattern: pattern)
    let nsrange = NSRange(text.startIndex..<text.endIndex, in: text)
    if let match = regex.firstMatch(in: text, options: [], range: nsrange),
       match.numberOfRanges >= 2,
       let range = Range(match.range(at: 1), in: text) {
        print(String(text[range]))
        exit(0)
    }
}

fail("no douyin otp found")
