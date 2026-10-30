import MarkdownIt from 'markdown-it'

const parser = new MarkdownIt({ html: false, linkify: false, typographer: false })
parser.renderer.rules.image = (tokens, index) => parser.utils.escapeHtml(tokens[index].content)

export function renderMarkdown(source: string): string {
  if (new TextEncoder().encode(source).length > 100 * 1024) throw Error('笔记内容超过限制')
  return parser.render(source)
}
