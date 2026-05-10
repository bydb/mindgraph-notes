import { daysUntilDue } from '../../shared/taskExtractor'
import type { TaskLeadTime } from '../stores/uiStore'

export type TaskBucket = 'overdue' | 'today' | 'soon' | 'later'

interface BucketableTask {
  dueDate?: Date
  isCritical?: boolean
}

/**
 * Ordnet eine Aufgabe einem Anzeige-Bucket zu, basierend auf Vorlauf-Settings.
 * Aufgaben ohne dueDate werden immer als 'later' eingeordnet.
 *
 * Mapping Priority:
 *   isCritical → leadTime.critical
 *   sonst      → leadTime.normal
 *   (leadTime.high ist als Reserve für künftige Differenzierung vorgesehen)
 */
export function bucketForTask(
  task: BucketableTask,
  leadTime: TaskLeadTime,
  now: Date = new Date()
): TaskBucket {
  if (!task.dueDate) return 'later'
  const days = daysUntilDue(task.dueDate, now)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  const lead = task.isCritical ? leadTime.critical : leadTime.normal
  if (days <= lead) return 'soon'
  return 'later'
}
