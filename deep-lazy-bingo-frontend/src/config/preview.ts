import { isPreviewEnabled } from './family'
import { BACKEND_LOCK } from '../learning/core'

export const isInterfacePreview = isPreviewEnabled(
  import.meta.env.DEV,
  import.meta.env.VITE_INTERFACE_PREVIEW,
  sessionStorage.getItem(BACKEND_LOCK) === '1'
)
