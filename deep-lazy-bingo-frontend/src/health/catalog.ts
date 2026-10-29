export interface ExerciseMedia {
  url: string
  sha256: string
  sourceUrl: string
  author: string
  license: string
  licenseUrl?: string
}

export interface Exercise {
  id: string
  source: 'free-exercise-db' | 'wger' | 'user'
  sourceId: string
  name: string
  instructions: string[]
  muscles: string[]
  equipment: string
  category: string
  level: string
  sourceUrl: string
  revision: string
  contentHash: string
  images: ExerciseMedia[]
  license: string
  author: string
  updatedAt: string
  retired?: boolean
}

export interface SourceReceipt {
  id: string
  title: string
  revision: string
  checkedAt: string
  importedAt: string
  count: number
  status: 'success' | 'failed' | 'pending'
  error?: string
}

export interface HealthCatalog {
  scope?: 'sample'
  exercises: Exercise[]
  sources: SourceReceipt[]
  commons: ExerciseMedia[]
}
