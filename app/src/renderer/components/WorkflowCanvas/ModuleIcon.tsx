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
  IconBox,
  IconClipboard,
  IconRefresh,
  IconReply,
  IconClock
} from '../Shared/Icons'

// Nur KERN-Module. Plugin-Module (antares/edoobox …) haben kein Kern-Icon mehr — sie fallen
// auf das generische IconBox („Baustein/Paket") zurück. So bleibt nach einer Plugin-Löschung
// kein toter Plugin-Name in der Kern-Iconmap.
const MAP: Partial<Record<WorkflowModuleId, React.FC<{ size?: number }>>> = {
  email: IconMail,
  project: IconFolder,
  ollama: IconBrain,
  notes: IconDocument,
  human: IconUser,
  calendar: IconCalendar,
  tasks: IconClipboard,
  schedule: IconRefresh
}

// Pro-Action-Icon-Override nur für KERN-Actions, wo mehrere sich ein Modul teilen
// (die Mail-Trigger) oder ein klareres Logo den Auslöser besser zeigt. Fallback ist das Modul-Icon.
const ACTION_MAP: Record<string, React.FC<{ size?: number }>> = {
  'email.replyReceived': IconReply,
  'email.icsReceived': IconCalendar,
  'tasks.dueSoon': IconClock
  // schedule.timer → Modul-Icon IconRefresh (passt: wiederkehrender Zeitplan)
}

// moduleId ist ein offener String (Plugins bringen eigene) — die Kern-Iconmap kennt nur die
// Kern-Module; alles andere fällt auf das generische IconBox zurück.
export const ModuleIcon: React.FC<{ moduleId: string; size?: number }> = ({ moduleId, size = 14 }) => {
  const Comp = MAP[moduleId as WorkflowModuleId] ?? IconBox
  return <Comp size={size} />
}

/** Icon eines Bausteins: pro-Action-Override, sonst Modul-Icon (Plugin-Module → generisches IconBox). */
export const ActionIcon: React.FC<{ actionId: string; moduleId: string; size?: number }> = ({ actionId, moduleId, size = 14 }) => {
  const Comp = ACTION_MAP[actionId] ?? MAP[moduleId as WorkflowModuleId] ?? IconBox
  return <Comp size={size} />
}
