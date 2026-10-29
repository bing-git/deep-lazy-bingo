import request from '@/utils/http'
import { resolveApiBase } from '@/config/family'
import { fetchLearningAudio, validCapabilities, validateSpeech } from './core'
import type { Book, CollectionJob, Material, Progress, SourceSetting } from './core'

const prefix =
  resolveApiBase(import.meta.env.VITE_API_URL) === '/api/v1' ? '/learning' : '/v1/learning'
export interface TtsJob {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  audioUrl?: string
  error?: string
}
export const learningApi = {
  books: () => request.get<Book[]>({ url: `${prefix}/books` }),
  importBook: (book: Book) => request.post<Book>({ url: `${prefix}/books`, data: book }),
  refreshBook: (id: string) =>
    request.post<Book>({ url: `${prefix}/books/${encodeURIComponent(id)}/refresh` }),
  deleteBook: (id: string) =>
    request.del<void>({ url: `${prefix}/books/${encodeURIComponent(id)}` }),
  setBookCover: (id: string, coverDataUrl: string) =>
    request.put<Book>({
      url: `${prefix}/books/${encodeURIComponent(id)}/cover`,
      data: { coverDataUrl }
    }),
  progress: () => request.get<Progress[]>({ url: `${prefix}/progress` }),
  saveProgress: (progress: Progress) =>
    request.put<Progress>({
      url: `${prefix}/progress`,
      data: progress
    }),
  sources: () => request.get<SourceSetting[]>({ url: `${prefix}/sources` }),
  saveSource: (source: SourceSetting) =>
    request.put<SourceSetting>({
      url: `${prefix}/sources/${encodeURIComponent(source.id)}`,
      data: source
    }),
  collect: (sourceId: string) =>
    request.post<CollectionJob>({ url: `${prefix}/collection-jobs`, data: { sourceId } }),
  jobs: () => request.get<CollectionJob[]>({ url: `${prefix}/collection-jobs` }),
  materials: () => request.get<Material[]>({ url: `${prefix}/materials` }),
  async capabilities() {
    const response = await fetch('/api/v1/system/capabilities', {
      credentials: 'same-origin',
      redirect: 'error',
      signal: AbortSignal.timeout(6000)
    })
    const data: unknown =
      response.ok && response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : null
    if (!validCapabilities(data)) throw Error('后端能力不可用；不会退回本地数据')
    return data
  },
  createSpeech: (text: string, signal: AbortSignal) =>
    request.post<TtsJob>({
      url: `${prefix}/tts/jobs`,
      data: { text: validateSpeech(text), language: 'en', consent: true },
      signal
    }),
  speechJob: (id: string) => request.get<TtsJob>({ url: `${prefix}/tts/jobs/${jobId(id)}` }),
  cancelSpeech: (id: string) => request.del<void>({ url: `${prefix}/tts/jobs/${jobId(id)}` }),
  async downloadAudio(path: string, signal: AbortSignal) {
    const { useUserStore } = await import('@/store/modules/user')
    const token = useUserStore().accessToken
    return fetchLearningAudio(path, signal, token ? { Authorization: token } : {})
  }
}
function jobId(id: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw Error('任务编号无效')
  return id
}
