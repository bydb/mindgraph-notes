// Shared Task-Extraktion — von Renderer und Main-Prozess nutzbar.
// Parst `- [ ]` / `- [x]` Tasks mit optionalem Obsidian-Reminder-Format:
//   (@[[YYYY-MM-DD]]) oder (@[[YYYY-MM-DD]] HH:MM)

export interface ExtractedTask {
  text: string
  completed: boolean
  line: number
  rawLine: string
  dueDate?: Date
  isOverdue?: boolean
  isCritical?: boolean
  tags: string[]
}

export interface TaskSummary {
  total: number
  completed: number
  tasks: ExtractedTask[]
  hasOverdue: boolean
  nextDue?: Date
  critical: number
}

const REMINDER_REGEX = /\(@\[\[(\d{4}-\d{2}-\d{2})\]\](?:\s*(\d{1,2}:\d{2}))?\)/
const TASK_TAG_REGEX = /(?:^|\s)#([\p{L}0-9][\p{L}0-9\-/_]*)/gu
const TASK_LINE_REGEX = /^[\s]*[-*]\s*\[([ xX])\]\s*(.+)$/

function parseReminderDate(text: string): Date | undefined {
  const match = text.match(REMINDER_REGEX)
  if (!match) return undefined
  const [year, month, day] = match[1].split('-').map(Number)
  if (match[2]) {
    const [hh, mm] = match[2].split(':').map(Number)
    return new Date(year, month - 1, day, hh, mm)
  }
  return new Date(year, month - 1, day, 0, 0, 0)
}

function extractInlineTags(text: string): string[] {
  const tags: string[] = []
  TASK_TAG_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TASK_TAG_REGEX.exec(text)) !== null) {
    tags.push(match[1])
  }
  return tags
}

function cleanTaskText(text: string): string {
  return text
    .replace(REMINDER_REGEX, '')
    .replace(TASK_TAG_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isOverdue(date: Date): boolean {
  return date < new Date()
}

function isCriticalTask(text: string): boolean {
  return /#critical|#kritisch|#urgent|#dringend|@critical|@urgent|@dringend|!{2,}|\[!\]/i.test(text)
}

export function extractTasks(content: string): TaskSummary {
  const tasks: ExtractedTask[] = []
  const lines = content.split('\n')

  lines.forEach((line, index) => {
    const match = line.match(TASK_LINE_REGEX)
    if (!match) return
    const completed = match[1].toLowerCase() === 'x'
    const fullText = match[2]
    const dueDate = parseReminderDate(fullText)
    tasks.push({
      text: cleanTaskText(fullText),
      completed,
      line: index + 1,
      rawLine: line,
      dueDate,
      isOverdue: dueDate ? isOverdue(dueDate) : false,
      isCritical: isCriticalTask(fullText),
      tags: extractInlineTags(fullText)
    })
  })

  const completedCount = tasks.filter(t => t.completed).length
  const hasOverdue = tasks.some(t => !t.completed && t.isOverdue)
  const criticalCount = tasks.filter(t => !t.completed && t.isCritical).length
  const uncompletedWithDue = tasks.filter(t => !t.completed && t.dueDate)
  const nextDue = uncompletedWithDue.length > 0
    ? uncompletedWithDue.reduce((min, t) => t.dueDate! < min ? t.dueDate! : min, uncompletedWithDue[0].dueDate!)
    : undefined

  return {
    total: tasks.length,
    completed: completedCount,
    tasks,
    hasOverdue,
    nextDue,
    critical: criticalCount
  }
}
