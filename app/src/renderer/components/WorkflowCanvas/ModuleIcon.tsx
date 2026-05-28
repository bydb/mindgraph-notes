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
  IconBox
} from '../Shared/Icons'

const MAP: Record<WorkflowModuleId, React.FC<{ size?: number }>> = {
  email: IconMail,
  project: IconFolder,
  ollama: IconBrain,
  notes: IconDocument,
  human: IconUser,
  calendar: IconCalendar,
  edoobox: IconGraduation,
  antares: IconBox
}

export const ModuleIcon: React.FC<{ moduleId: WorkflowModuleId; size?: number }> = ({ moduleId, size = 14 }) => {
  const Comp = MAP[moduleId]
  if (!Comp) return null
  return <Comp size={size} />
}
