// Modul-Icon für Workflow-Canvas-Bausteine. SVG-only, kein Emoji.

import React from 'react'
import type { WorkflowModuleId } from '../../../shared/workflow/types'
import {
  IconMail,
  IconFolder,
  IconBrain,
  IconDocument,
  IconUser,
  IconCalendar,
  IconGraduation,
  IconBox,
  IconClipboard,
  IconRefresh,
  IconReply,
  IconClock,
  IconWarning,
  IconTag
} from '../Shared/Icons'

const MAP: Record<WorkflowModuleId, React.FC<{ size?: number }>> = {
  email: IconMail,
  project: IconFolder,
  ollama: IconBrain,
  notes: IconDocument,
  human: IconUser,
  calendar: IconCalendar,
  edoobox: IconGraduation,
  antares: IconBox,
  tasks: IconClipboard,
  schedule: IconRefresh
}

// Pro-Action-Icon-Override: nur dort, wo mehrere Actions sich ein Modul teilen
// (die Mail-Trigger) oder ein klareres Logo den Auslöser besser zeigt als das
// generische Modul-Icon. Fallback ist immer das Modul-Icon.
const ACTION_MAP: Record<string, React.FC<{ size?: number }>> = {
  'email.replyReceived': IconReply,
  'email.icsReceived': IconCalendar,
  'antares.mahnung': IconWarning,
  'edoobox.newBooking': IconTag,
  'tasks.dueSoon': IconClock
  // schedule.timer → Modul-Icon IconRefresh (passt: wiederkehrender Zeitplan)
}

export const ModuleIcon: React.FC<{ moduleId: WorkflowModuleId; size?: number }> = ({ moduleId, size = 14 }) => {
  const Comp = MAP[moduleId]
  if (!Comp) return null
  return <Comp size={size} />
}

/** Icon eines Bausteins: pro-Action-Override, sonst Modul-Icon. */
export const ActionIcon: React.FC<{ actionId: string; moduleId: WorkflowModuleId; size?: number }> = ({ actionId, moduleId, size = 14 }) => {
  const Comp = ACTION_MAP[actionId] || MAP[moduleId]
  if (!Comp) return null
  return <Comp size={size} />
}
