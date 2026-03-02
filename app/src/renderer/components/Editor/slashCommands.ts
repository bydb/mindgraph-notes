import { EditorView } from '@codemirror/view'
import { formatDate } from '../../utils/templateEngine'

export interface SlashCommand {
  id: string
  label: string
  description: string
  icon: string
  category: string
  keywords: string[]
  action: (view: EditorView, from: number, to: number) => void
}

function replaceSlash(view: EditorView, from: number, to: number, text: string) {
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length }
  })
}

function replaceSlashWithCursor(view: EditorView, from: number, to: number, text: string, cursorOffset: number) {
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + cursorOffset }
  })
}

export function getSlashCommands(
  t: (key: string) => string,
  dateFormat: string,
  timeFormat: string
): SlashCommand[] {
  const now = () => new Date()

  const addDays = (date: Date, days: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
  }

  return [
    // Datum/Zeit
    {
      id: 'date',
      label: t('slashCommand.date'),
      description: t('slashCommand.date.desc'),
      icon: '📅',
      category: t('slashCommand.category.datetime'),
      keywords: ['datum', 'date', 'today', 'heute'],
      action: (view, from, to) => replaceSlash(view, from, to, formatDate(now(), dateFormat))
    },
    {
      id: 'time',
      label: t('slashCommand.time'),
      description: t('slashCommand.time.desc'),
      icon: '🕐',
      category: t('slashCommand.category.datetime'),
      keywords: ['zeit', 'time', 'uhr', 'clock'],
      action: (view, from, to) => replaceSlash(view, from, to, formatDate(now(), timeFormat))
    },
    {
      id: 'datetime',
      label: t('slashCommand.datetime'),
      description: t('slashCommand.datetime.desc'),
      icon: '📅',
      category: t('slashCommand.category.datetime'),
      keywords: ['datum', 'zeit', 'date', 'time'],
      action: (view, from, to) => replaceSlash(view, from, to, formatDate(now(), `${dateFormat} ${timeFormat}`))
    },
    {
      id: 'today',
      label: t('slashCommand.today'),
      description: t('slashCommand.today.desc'),
      icon: '📌',
      category: t('slashCommand.category.datetime'),
      keywords: ['heute', 'today', 'daily', 'wikilink'],
      action: (view, from, to) => replaceSlash(view, from, to, `[[${formatDate(now(), 'YYYY-MM-DD')}]]`)
    },
    {
      id: 'tomorrow',
      label: t('slashCommand.tomorrow'),
      description: t('slashCommand.tomorrow.desc'),
      icon: '⏭️',
      category: t('slashCommand.category.datetime'),
      keywords: ['morgen', 'tomorrow', 'next'],
      action: (view, from, to) => replaceSlash(view, from, to, `[[${formatDate(addDays(now(), 1), 'YYYY-MM-DD')}]]`)
    },
    {
      id: 'yesterday',
      label: t('slashCommand.yesterday'),
      description: t('slashCommand.yesterday.desc'),
      icon: '⏮️',
      category: t('slashCommand.category.datetime'),
      keywords: ['gestern', 'yesterday', 'prev'],
      action: (view, from, to) => replaceSlash(view, from, to, `[[${formatDate(addDays(now(), -1), 'YYYY-MM-DD')}]]`)
    },

    // Formatierung/Blöcke
    {
      id: 'heading1',
      label: t('slashCommand.heading1'),
      description: t('slashCommand.heading1.desc'),
      icon: 'H1',
      category: t('slashCommand.category.formatting'),
      keywords: ['heading', 'überschrift', 'h1', 'titel'],
      action: (view, from, to) => replaceSlash(view, from, to, '# ')
    },
    {
      id: 'heading2',
      label: t('slashCommand.heading2'),
      description: t('slashCommand.heading2.desc'),
      icon: 'H2',
      category: t('slashCommand.category.formatting'),
      keywords: ['heading', 'überschrift', 'h2'],
      action: (view, from, to) => replaceSlash(view, from, to, '## ')
    },
    {
      id: 'heading3',
      label: t('slashCommand.heading3'),
      description: t('slashCommand.heading3.desc'),
      icon: 'H3',
      category: t('slashCommand.category.formatting'),
      keywords: ['heading', 'überschrift', 'h3'],
      action: (view, from, to) => replaceSlash(view, from, to, '### ')
    },
    {
      id: 'task',
      label: t('slashCommand.task'),
      description: t('slashCommand.task.desc'),
      icon: '☑️',
      category: t('slashCommand.category.formatting'),
      keywords: ['todo', 'checkbox', 'aufgabe', 'task', 'check'],
      action: (view, from, to) => replaceSlash(view, from, to, '- [ ] ')
    },
    {
      id: 'code',
      label: t('slashCommand.code'),
      description: t('slashCommand.code.desc'),
      icon: '💻',
      category: t('slashCommand.category.formatting'),
      keywords: ['code', 'block', 'fenced', 'pre'],
      action: (view, from, to) => replaceSlashWithCursor(view, from, to, '```\n\n```', 4)
    },
    {
      id: 'table',
      label: t('slashCommand.table'),
      description: t('slashCommand.table.desc'),
      icon: '📊',
      category: t('slashCommand.category.formatting'),
      keywords: ['tabelle', 'table', 'grid'],
      action: (view, from, to) => replaceSlashWithCursor(view, from, to, '| Spalte 1 | Spalte 2 | Spalte 3 |\n| --- | --- | --- |\n|  |  |  |', 2)
    },
    {
      id: 'quote',
      label: t('slashCommand.quote'),
      description: t('slashCommand.quote.desc'),
      icon: '💬',
      category: t('slashCommand.category.formatting'),
      keywords: ['zitat', 'quote', 'blockquote'],
      action: (view, from, to) => replaceSlash(view, from, to, '> ')
    },
    {
      id: 'hr',
      label: t('slashCommand.hr'),
      description: t('slashCommand.hr.desc'),
      icon: '➖',
      category: t('slashCommand.category.formatting'),
      keywords: ['linie', 'trennlinie', 'horizontal', 'rule', 'divider', 'separator'],
      action: (view, from, to) => replaceSlash(view, from, to, '---\n')
    },

    // Callouts
    ...(['note', 'tip', 'warning', 'info', 'question', 'example', 'todo', 'success', 'failure', 'bug'] as const).map(type => ({
      id: `callout-${type}`,
      label: t(`slashCommand.callout-${type}`),
      description: t(`slashCommand.callout-${type}.desc`),
      icon: calloutIcon(type),
      category: t('slashCommand.category.callouts'),
      keywords: ['callout', 'admonition', type, calloutKeywordDE(type)],
      action: (view: EditorView, from: number, to: number) => {
        const text = `> [!${type}]\n> `
        replaceSlash(view, from, to, text)
      }
    })),

    // Template
    {
      id: 'template',
      label: t('slashCommand.template'),
      description: t('slashCommand.template.desc'),
      icon: '📋',
      category: t('slashCommand.category.other'),
      keywords: ['template', 'vorlage', 'snippet'],
      action: (view, from, to) => {
        // Remove the slash command text first
        view.dispatch({
          changes: { from, to, insert: '' }
        })
        // Dispatch event to open template picker
        window.dispatchEvent(new CustomEvent('mindgraph:open-template-picker'))
      }
    }
  ]
}

function calloutIcon(type: string): string {
  const icons: Record<string, string> = {
    note: '📝',
    tip: '💡',
    warning: '⚠️',
    info: 'ℹ️',
    question: '❓',
    example: '📎',
    todo: '✅',
    success: '✅',
    failure: '❌',
    bug: '🐛'
  }
  return icons[type] || '📝'
}

function calloutKeywordDE(type: string): string {
  const keywords: Record<string, string> = {
    note: 'notiz',
    tip: 'tipp',
    warning: 'warnung',
    info: 'information',
    question: 'frage',
    example: 'beispiel',
    todo: 'aufgabe',
    success: 'erfolg',
    failure: 'fehler',
    bug: 'fehler'
  }
  return keywords[type] || type
}
