import { validateSpeech } from './core'

let readingText = ''
export function setReadingSpeech(text: string) {
  readingText = validateSpeech(text)
}
export function takeReadingSpeech() {
  const text = readingText
  readingText = ''
  return text
}

type Engine = Pick<SpeechSynthesis, 'cancel' | 'speak' | 'pause' | 'resume'>
export function browserSpeech(
  engine?: Engine,
  makeUtterance = (text: string) => new SpeechSynthesisUtterance(text)
) {
  let playback = 0
  return {
    play(
      text: string,
      voice: SpeechSynthesisVoice | undefined,
      rate: number,
      remoteConsent: boolean,
      onStatus?: (status: string) => void
    ) {
      if (!engine) throw Error('当前浏览器不支持朗读')
      if (!voice || !/^en[-_]/i.test(voice.lang)) throw Error('没有可用英文语音，请检查系统语音包')
      if (!voice.localService && !remoteConsent) throw Error('远程语音需要明确同意发送英文内容')
      if (!Number.isFinite(rate) || rate < 0.5 || rate > 1.5) throw Error('语速不合法')
      const utterance = makeUtterance(validateSpeech(text))
      const current = ++playback
      utterance.voice = voice
      utterance.lang = voice.lang
      utterance.rate = rate
      utterance.onend = () => {
        if (current === playback) onStatus?.('朗读结束')
      }
      utterance.onerror = (event) => {
        if (current === playback) onStatus?.(`朗读失败：${event.error}，请检查系统声音`)
      }
      engine.cancel()
      engine.speak(utterance)
      onStatus?.('正在浏览器朗读')
    },
    pause: () => engine?.pause(),
    resume: () => engine?.resume(),
    stop: () => {
      playback++
      engine?.cancel()
    }
  }
}
