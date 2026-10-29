import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { isInterfacePreview } from '@/config/preview'
import { BACKEND_LATCHED_EVENT, BACKEND_LOCK } from '@/learning/core'
import { openPersonalTools, type PersonalTools } from './local'

export function usePersonalTools(clear: () => void) {
  let disposed = false
  const repo = shallowRef<PersonalTools>()
  const error = shallowRef('')
  const allowed = () => isInterfacePreview && sessionStorage.getItem(BACKEND_LOCK) !== '1'
  const invalidate = () => {
    clear()
    repo.value?.close()
    repo.value = undefined
  }
  onMounted(async () => {
    window.addEventListener(BACKEND_LATCHED_EVENT, invalidate)
    if (!allowed()) return
    try {
      const opened = await openPersonalTools(allowed)
      if (disposed || !allowed()) {
        opened.close()
        return
      }
      repo.value = opened
    } catch {
      error.value = '本地存储不可用，请检查浏览器存储权限'
    }
  })
  onBeforeUnmount(() => {
    disposed = true
    window.removeEventListener(BACKEND_LATCHED_EVENT, invalidate)
    invalidate()
  })
  return { repo, error, allowed }
}
