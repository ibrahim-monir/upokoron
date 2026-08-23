import { useEffect, useRef } from 'react'
import {
  Bold,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Strikethrough,
  Underline,
} from 'lucide-react'
import { cx } from '../../lib/format'

function ToolbarButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // A native mousedown would move focus (and the text selection) off the
      // editor before the click handler runs, so the command would apply to
      // nothing.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-600 hover:bg-ink-100"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

/**
 * A minimal WYSIWYG editor for product descriptions, storing HTML rather
 * than plain text so the storefront can show real paragraphs, lists and
 * links instead of one unbroken block of text.
 *
 * Built on `execCommand` rather than a rich-text library: the formatting
 * this needs (bold, lists, a link) is a handful of commands every browser
 * still implements, and it costs nothing extra in the bundle.
 */
export function RichTextEditor({ id, value, onChange, onBlur, placeholder, invalid, className }) {
  const editorRef = useRef(null)

  // Only overwrite the DOM when the incoming value actually differs from
  // what is already there -- otherwise every keystroke's onChange would
  // round-trip through this effect and throw the caret to the start.
  useEffect(() => {
    const node = editorRef.current
    if (node && node.innerHTML !== (value ?? '')) {
      node.innerHTML = value ?? ''
    }
  }, [value])

  const exec = (command, arg) => {
    editorRef.current?.focus()
    document.execCommand(command, false, arg)
    onChange?.(editorRef.current?.innerHTML ?? '')
  }

  const insertLink = () => {
    const url = window.prompt('Link URL (e.g. https://example.com)')
    if (!url) return
    exec('createLink', url)
  }

  return (
    <div
      className={cx(
        'overflow-hidden rounded-lg border bg-white',
        invalid ? 'border-danger-500' : 'border-ink-300',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-ink-200 bg-ink-50/60 p-1.5">
        <ToolbarButton icon={Bold} label="Bold" onClick={() => exec('bold')} />
        <ToolbarButton icon={Italic} label="Italic" onClick={() => exec('italic')} />
        <ToolbarButton icon={Underline} label="Underline" onClick={() => exec('underline')} />
        <ToolbarButton icon={Strikethrough} label="Strikethrough" onClick={() => exec('strikeThrough')} />
        <div className="mx-1 h-5 w-px bg-ink-200" />
        <ToolbarButton icon={Heading2} label="Heading" onClick={() => exec('formatBlock', 'h3')} />
        <ToolbarButton icon={List} label="Bullet list" onClick={() => exec('insertUnorderedList')} />
        <ToolbarButton icon={ListOrdered} label="Numbered list" onClick={() => exec('insertOrderedList')} />
        <ToolbarButton icon={Link2} label="Insert link" onClick={insertLink} />
        <div className="mx-1 h-5 w-px bg-ink-200" />
        <ToolbarButton icon={RemoveFormatting} label="Clear formatting" onClick={() => exec('removeFormat')} />
      </div>

      <div
        id={id}
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange?.(editorRef.current?.innerHTML ?? '')}
        onBlur={onBlur}
        data-placeholder={placeholder}
        className="rich-text-editor prose-content min-h-40 max-w-none p-3 text-sm text-ink-900 focus:outline-none"
      />
    </div>
  )
}
