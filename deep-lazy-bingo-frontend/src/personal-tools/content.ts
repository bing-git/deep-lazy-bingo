import DOMPurify from 'dompurify'

const tags = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'pre',
  'code',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
  'hr'
]

export function sanitizeContent(value: string): string {
  if (new TextEncoder().encode(value).length > 512 * 1024) throw Error('内容超过限制')
  const clean = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: ['href', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false
  })
  const template = document.createElement('template')
  template.innerHTML = clean
  for (const link of Array.from(template.content.querySelectorAll('a'))) {
    const href = link.getAttribute('href') ?? ''
    try {
      const url = new URL(href)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw Error('Unsafe URL')
      link.setAttribute('rel', 'noopener noreferrer')
      link.setAttribute('target', '_blank')
    } catch {
      link.removeAttribute('href')
    }
  }
  return template.innerHTML
}

export function safeMarkdown(source: string): string {
  if (new TextEncoder().encode(source).length > 100 * 1024) throw Error('笔记内容超过限制')
  return source
}
