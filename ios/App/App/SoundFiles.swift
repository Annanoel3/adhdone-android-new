import Foundation
import AVFoundation
import UserNotifications
import CryptoKit
import ADHDoneShared

/// The sounds the phone rings and dings with (the twin of Android's AlarmSound
/// and NotifySound). iOS only plays a notification's or an alarm's sound from
/// a file in the app's own bundle or its Library/Sounds folder, as plain PCM
/// (aiff / wav / caf) and under 30 seconds. So the sound the person picked (a
/// preset or an upload the web app names by address) is downloaded once,
/// turned into a 29-second CAF and kept there; the extension and AlarmKit then
/// name that file on each push or alarm.
///
/// The spoken alarm ("Read it to me", url "speak:") is the phone's own voice
/// rendered to a CAF ahead of time, one file per sentence (SpeechFiles), when
/// the alarm is booked — iOS won't let an app talk once it is closed, but it
/// will play a file.
enum SoundFiles {
    static let folder: URL = {
        let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
        let url = library.appendingPathComponent("Sounds", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    /// 29 seconds: iOS cuts a notification sound off at 30.
    static let maxSeconds: Double = 29

    private static let work = DispatchQueue(label: "adhdone.sounds", qos: .utility)

    // MARK: - The chosen sounds

    /// Downloads and converts the sound at `url` (a preset or an upload), names
    /// the finished file in the SoundChoice saved under `key`, and says whether
    /// it is ready. "" = the phone's own sound; "speak:" = the voice.
    static func install(url: String, name: String, key: SharedStore.Key, extra: SoundChoice? = nil,
                        completion: @escaping (_ ready: Bool) -> Void) {
        var choice = extra ?? SoundChoice()
        choice.url = url
        choice.name = name
        choice.speak = (url == "speak:")
        choice.file = ""
        guard !url.isEmpty, !choice.speak, let remote = URL(string: url) else {
            SharedStore.write(key, choice)
            completion(true)
            return
        }
        let file = "sound_\(hash(url)).caf"
        let dest = folder.appendingPathComponent(file)
        if FileManager.default.fileExists(atPath: dest.path) {
            choice.file = file
            SharedStore.write(key, choice)
            completion(true)
            return
        }
        // Saved at once, so the choice is kept even if the download fails; the
        // file name is filled in when the copy is ready.
        SharedStore.write(key, choice)
        URLSession.shared.downloadTask(with: remote) { tmp, _, error in
            guard let tmp = tmp, error == nil else { completion(false); return }
            work.async {
                let ok = convertToCAF(from: tmp, to: dest)
                if ok {
                    var saved = SharedStore.read(key, as: SoundChoice.self) ?? choice
                    if saved.url == url {
                        saved.file = file
                        SharedStore.write(key, saved)
                    }
                }
                completion(ok)
            }
        }.resume()
    }

    /// What a regular notification of ours sounds like at that moment: the
    /// chosen file, the phone's default, or nothing while ADHDone is silenced
    /// or during an event the person asked quiet for.
    static func notificationSound(at date: Date) -> UNNotificationSound? {
        if SharedStore.isQuietNow(date) || SharedStore.quietForEvent(at: date.timeIntervalSince1970 * 1000) { return nil }
        guard let choice = SharedStore.read(.notifySound, as: SoundChoice.self) else { return .default }
        if !choice.file.isEmpty, FileManager.default.fileExists(atPath: folder.appendingPathComponent(choice.file).path) {
            return UNNotificationSound(named: UNNotificationSoundName(choice.file))
        }
        return .default
    }

    /// The alarm sound's file name, or "" for the phone's default alarm sound.
    static func alarmSoundFile() -> String {
        guard let choice = SharedStore.read(.alarmSound, as: SoundChoice.self), !choice.file.isEmpty else { return "" }
        return FileManager.default.fileExists(atPath: folder.appendingPathComponent(choice.file).path) ? choice.file : ""
    }

    static func alarmSoundIsSpoken() -> Bool {
        SharedStore.read(.alarmSound, as: SoundChoice.self)?.speak == true
    }

    // MARK: - Converting

    /// Any file AVFoundation can read (mp3, wav, m4a, aiff) → 16-bit PCM CAF,
    /// cut at 29 seconds. False when it couldn't be read.
    static func convertToCAF(from source: URL, to dest: URL) -> Bool {
        do {
            let input = try AVAudioFile(forReading: source)
            let format = input.processingFormat
            let frames = min(input.length, AVAudioFramePosition(format.sampleRate * maxSeconds))
            guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)) else { return false }
            try input.read(into: buffer, frameCount: AVAudioFrameCount(frames))
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: format.sampleRate,
                AVNumberOfChannelsKey: format.channelCount,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsNonInterleaved: false
            ]
            try? FileManager.default.removeItem(at: dest)
            let output = try AVAudioFile(forWriting: dest, settings: settings, commonFormat: format.commonFormat, interleaved: format.isInterleaved)
            try output.write(from: buffer)
            return true
        } catch {
            try? FileManager.default.removeItem(at: dest)
            return false
        }
    }

    static func hash(_ s: String) -> String {
        let digest = SHA256.hash(data: Data(s.utf8))
        return digest.prefix(8).map { String(format: "%02x", $0) }.joined()
    }
}

/// The phone's voice, two ways: spoken now (timer check-ins, "Read it to me"
/// previews) and rendered to a CAF for an alarm to play later.
final class SpeechFiles: NSObject {
    static let shared = SpeechFiles()
    private let synth = AVSpeechSynthesizer()
    private let renderer = AVSpeechSynthesizer()
    private let renderQueue = DispatchQueue(label: "adhdone.speech.render")

    private func utterance(_ text: String) -> AVSpeechUtterance {
        let u = AVSpeechUtterance(string: text)
        u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
        u.pitchMultiplier = 1
        u.volume = 1
        return u
    }

    /// Says it now, over whatever else is playing. Cancels a sentence mid-way
    /// so two never overlap (the same rule as speak.js in the web app).
    func speak(_ text: String) {
        guard !text.isEmpty else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        synth.speak(utterance(text))
    }

    func stop() {
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
    }

    /// The file name for these words (one file per sentence; the same words
    /// give the same file, so a repeated reminder renders once).
    static func fileName(for text: String) -> String {
        "speak_\(SoundFiles.hash(text)).caf"
    }

    /// Renders the words to Library/Sounds and calls back with the file name,
    /// or nil when the voice couldn't be rendered. Already there: at once.
    func render(_ text: String, completion: @escaping (String?) -> Void) {
        let name = SpeechFiles.fileName(for: text)
        let dest = SoundFiles.folder.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: dest.path) { completion(name); return }
        renderQueue.async { [self] in
            let done = DispatchSemaphore(value: 0)
            var file: AVAudioFile?
            var failed = false
            var finished = false
            let tmp = dest.appendingPathExtension("part")
            try? FileManager.default.removeItem(at: tmp)
            DispatchQueue.main.async {
                self.renderer.write(self.utterance(text)) { buffer in
                    guard !finished else { return }
                    guard let pcm = buffer as? AVAudioPCMBuffer else { failed = true; finished = true; done.signal(); return }
                    if pcm.frameLength == 0 {
                        // The last, empty buffer: the sentence is done.
                        finished = true
                        done.signal()
                        return
                    }
                    if file == nil {
                        file = try? AVAudioFile(forWriting: tmp, settings: pcm.format.settings,
                                                commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)
                        if file == nil { failed = true; finished = true; done.signal(); return }
                    }
                    do { try file?.write(from: pcm) } catch { failed = true; finished = true; done.signal() }
                }
            }
            // A sentence takes a few seconds to render; 20 is plenty.
            if done.wait(timeout: .now() + 20) == .timedOut { failed = true }
            file = nil
            if failed {
                try? FileManager.default.removeItem(at: tmp)
                completion(nil)
                return
            }
            // Written as the voice's own format; AlarmKit and notifications want
            // plain PCM under 30 seconds, so it goes through the same converter.
            let ok = SoundFiles.convertToCAF(from: tmp, to: dest)
            try? FileManager.default.removeItem(at: tmp)
            completion(ok ? name : nil)
        }
    }

    /// Drops rendered sentences no alarm uses any more.
    func keepOnly(_ names: Set<String>) {
        guard let files = try? FileManager.default.contentsOfDirectory(atPath: SoundFiles.folder.path) else { return }
        for f in files where f.hasPrefix("speak_") && !names.contains(f) {
            try? FileManager.default.removeItem(at: SoundFiles.folder.appendingPathComponent(f))
        }
    }
}
