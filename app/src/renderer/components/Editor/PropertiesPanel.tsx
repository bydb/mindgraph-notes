/**
 * Properties Panel Component
 * Displays and allows editing of YAML frontmatter fields
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '../../utils/translations'
import { parseFrontmatter } from '../../utils/metadataExtractor'
import type { NoteFrontmatter } from '../../../shared/types'

interface PropertiesPanelProps {
  content: string
  onContentChange: (newContent: string) => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

/**
 * Serialize frontmatter back to YAML string
 */
function serializeFrontmatter(frontmatter: NoteFrontmatter): string {
  const lines: string[] = []

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === null || value === undefined) {
      lines.push(`${key}: `)
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`)
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`)
    } else if (value instanceof Date) {
      lines.push(`${key}: ${value.toISOString().split('T')[0]}`)
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`)
      } else {
        lines.push(`${key}: [${value.map(v => typeof v === 'string' ? v : String(v)).join(', ')}]`)
      }
    } else if (typeof value === 'string') {
      // Quote strings that contain special characters
      if (value.includes(':') || value.includes('#') || value.includes('\n')) {
        lines.push(`${key}: "${value}"`)
      } else {
        lines.push(`${key}: ${value}`)
      }
    } else {
      lines.push(`${key}: ${String(value)}`)
    }
  }

  return lines.join('\n')
}

/**
 * Replace frontmatter in content with new frontmatter
 */
function replaceFrontmatter(content: string, newFrontmatter: NoteFrontmatter): string {
  const frontmatterRegex = /^---\s*\n[\s\S]*?\n---/
  const serialized = serializeFrontmatter(newFrontmatter)
  const newFrontmatterBlock = `---\n${serialized}\n---`

  if (frontmatterRegex.test(content)) {
    return content.replace(frontmatterRegex, newFrontmatterBlock)
  } else {
    // No existing frontmatter, add at beginning
    return newFrontmatterBlock + '\n\n' + content
  }
}

/**
 * Detect the type of a frontmatter value
 */
function detectFieldType(value: unknown): 'boolean' | 'number' | 'date' | 'array' | 'string' {
  if (typeof value === 'boolean') return 'boolean'
  // Treat large numbers (timestamps, IDs) as strings to preserve all digits
  if (typeof value === 'number') {
    // Numbers with more than 8 digits are likely timestamps or IDs
    if (Math.abs(value) > 99999999) return 'string'
    return 'number'
  }
  if (value instanceof Date) return 'date'
  if (Array.isArray(value)) return 'array'
  // Check if string looks like a date
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date'
  return 'string'
}

/**
 * Field editor component for different types
 */
const FieldEditor: React.FC<{
  fieldKey: string
  value: unknown
  onChange: (key: string, value: unknown) => void
}> = ({ fieldKey, value, onChange }) => {
  const type = detectFieldType(value)

  switch (type) {
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={value as boolean}
          onChange={(e) => onChange(fieldKey, e.target.checked)}
          className="properties-checkbox"
        />
      )

    case 'number':
      return (
        <input
          type="number"
          value={value as number}
          onChange={(e) => onChange(fieldKey, e.target.value ? Number(e.target.value) : '')}
          className="properties-input properties-number"
        />
      )

    case 'date':
      const dateValue = value instanceof Date
        ? value.toISOString().split('T')[0]
        : (value as string)
      return (
        <input
          type="date"
          value={dateValue}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          className="properties-input properties-date"
        />
      )

    case 'array':
      const arrayValue = Array.isArray(value) ? value.join(', ') : ''
      return (
        <input
          type="text"
          value={arrayValue}
          onChange={(e) => {
            const items = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
            onChange(fieldKey, items)
          }}
          className="properties-input properties-array"
          placeholder="item1, item2, ..."
        />
      )

    default:
      return (
        <input
          type="text"
          value={value as string || ''}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          className="properties-input properties-text"
        />
      )
  }
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  content,
  onContentChange,
  collapsed = false,
  onToggleCollapsed
}) => {
  const { t } = useTranslation()
  const [frontmatter, setFrontmatter] = useState<NoteFrontmatter>({})
  const [originalKeys, setOriginalKeys] = useState<string[]>([])
  const [isAddingField, setIsAddingField] = useState(false)
  const [newFieldKey, setNewFieldKey] = useState('')
  const [newFieldType, setNewFieldType] = useState<'string' | 'number' | 'boolean' | 'date'>('string')

  // Parse frontmatter when content changes
  useEffect(() => {
    const parsed = parseFrontmatter(content)
    setFrontmatter(parsed)
    // Store original key order/casing from the raw YAML
    const keyMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (keyMatch) {
      const keys = keyMatch[1]
        .split('\n')
        .map(line => line.match(/^([^:]+):/)?.[1]?.trim())
        .filter((k): k is string => !!k)
      setOriginalKeys(keys)
    }
  }, [content])

  // Handle field change
  const handleFieldChange = useCallback((key: string, value: unknown) => {
    const newFrontmatter = { ...frontmatter }

    // Find the original key (preserve casing)
    const originalKey = originalKeys.find(k => k.toLowerCase() === key.toLowerCase()) || key

    // Update with original casing
    const updatedFrontmatter: NoteFrontmatter = {}
    for (const origKey of originalKeys) {
      if (origKey.toLowerCase() === key.toLowerCase()) {
        updatedFrontmatter[origKey] = value
      } else {
        updatedFrontmatter[origKey] = frontmatter[origKey.toLowerCase()]
      }
    }

    // Add any keys not in original (new fields)
    for (const [k, v] of Object.entries(newFrontmatter)) {
      if (!originalKeys.some(ok => ok.toLowerCase() === k.toLowerCase())) {
        updatedFrontmatter[k] = v
      }
    }

    // If this is updating an existing key
    if (originalKeys.some(k => k.toLowerCase() === key.toLowerCase())) {
      const keyIndex = originalKeys.findIndex(k => k.toLowerCase() === key.toLowerCase())
      updatedFrontmatter[originalKeys[keyIndex]] = value
    }

    // Build new content
    const newContent = replaceFrontmatterPreservingKeys(content, frontmatter, key, value, originalKeys)
    onContentChange(newContent)
  }, [frontmatter, originalKeys, content, onContentChange])

  // Handle adding new field
  const handleAddField = useCallback(() => {
    if (!newFieldKey.trim()) return

    const key = newFieldKey.trim()
    let defaultValue: unknown

    switch (newFieldType) {
      case 'boolean': defaultValue = false; break
      case 'number': defaultValue = 0; break
      case 'date': defaultValue = new Date().toISOString().split('T')[0]; break
      default: defaultValue = ''
    }

    const newFrontmatter = { ...frontmatter, [key]: defaultValue }
    const newContent = replaceFrontmatter(content, rebuildFrontmatterWithOriginalKeys(newFrontmatter, [...originalKeys, key]))

    setNewFieldKey('')
    setIsAddingField(false)
    onContentChange(newContent)
  }, [newFieldKey, newFieldType, frontmatter, content, originalKeys, onContentChange])

  // Handle removing field
  const handleRemoveField = useCallback((key: string) => {
    const newFrontmatter = { ...frontmatter }
    delete newFrontmatter[key]

    const newOriginalKeys = originalKeys.filter(k => k.toLowerCase() !== key.toLowerCase())
    const newContent = replaceFrontmatter(content, rebuildFrontmatterWithOriginalKeys(newFrontmatter, newOriginalKeys))
    onContentChange(newContent)
  }, [frontmatter, originalKeys, content, onContentChange])

  const hasProperties = Object.keys(frontmatter).length > 0

  if (!hasProperties && collapsed) {
    return null
  }

  return (
    <div className={`properties-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="properties-header" onClick={onToggleCollapsed}>
        <span className="properties-toggle">{collapsed ? '▶' : '▼'}</span>
        <span className="properties-title">{t('properties', 'Properties')}</span>
        <span className="properties-count">{Object.keys(frontmatter).length}</span>
      </div>

      {!collapsed && (
        <div className="properties-content">
          {Object.entries(frontmatter).map(([key, value]) => {
            // Find original key for display
            const displayKey = originalKeys.find(k => k.toLowerCase() === key) || key

            return (
              <div key={key} className="properties-field">
                <label className="properties-label" title={displayKey}>
                  {displayKey}
                </label>
                <div className="properties-value">
                  <FieldEditor
                    fieldKey={key}
                    value={value}
                    onChange={handleFieldChange}
                  />
                </div>
                <button
                  className="properties-remove"
                  onClick={() => handleRemoveField(key)}
                  title={t('removeProperty', 'Remove property')}
                >
                  ×
                </button>
              </div>
            )
          })}

          {isAddingField ? (
            <div className="properties-add-form">
              <input
                type="text"
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
                placeholder={t('propertyName', 'Property name')}
                className="properties-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddField()
                  if (e.key === 'Escape') setIsAddingField(false)
                }}
              />
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as any)}
                className="properties-select"
              >
                <option value="string">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Checkbox</option>
                <option value="date">Date</option>
              </select>
              <button onClick={handleAddField} className="properties-btn-add">
                {t('add', 'Add')}
              </button>
              <button onClick={() => setIsAddingField(false)} className="properties-btn-cancel">
                {t('cancel', 'Cancel')}
              </button>
            </div>
          ) : (
            <button
              className="properties-add-btn"
              onClick={() => setIsAddingField(true)}
            >
              + {t('addProperty', 'Add property')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Rebuild frontmatter preserving original key casing
 */
function rebuildFrontmatterWithOriginalKeys(
  frontmatter: NoteFrontmatter,
  originalKeys: string[]
): NoteFrontmatter {
  const result: NoteFrontmatter = {}

  for (const origKey of originalKeys) {
    const lowerKey = origKey.toLowerCase()
    if (frontmatter[lowerKey] !== undefined) {
      result[origKey] = frontmatter[lowerKey]
    }
  }

  return result
}

/**
 * Replace a single value in frontmatter while preserving key order and casing
 */
function replaceFrontmatterPreservingKeys(
  content: string,
  currentFrontmatter: NoteFrontmatter,
  changedKey: string,
  newValue: unknown,
  originalKeys: string[]
): string {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/
  const match = content.match(frontmatterRegex)

  if (!match) {
    // No frontmatter, create new
    const newFm: NoteFrontmatter = { [changedKey]: newValue }
    return `---\n${serializeFrontmatter(newFm)}\n---\n\n${content}`
  }

  // Parse existing lines to preserve formatting
  const yamlLines = match[1].split('\n')
  const newLines: string[] = []
  let found = false

  for (const line of yamlLines) {
    const keyMatch = line.match(/^([^:]+):/)
    if (keyMatch) {
      const lineKey = keyMatch[1].trim()
      if (lineKey.toLowerCase() === changedKey.toLowerCase()) {
        // Replace this line with new value
        newLines.push(formatYamlLine(lineKey, newValue))
        found = true
        continue
      }
    }
    newLines.push(line)
  }

  // If key wasn't found, add it
  if (!found) {
    newLines.push(formatYamlLine(changedKey, newValue))
  }

  const newFrontmatterBlock = `---\n${newLines.join('\n')}\n---`
  return content.replace(frontmatterRegex, newFrontmatterBlock)
}

/**
 * Format a single YAML line
 */
function formatYamlLine(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return `${key}: `
  } else if (typeof value === 'boolean') {
    return `${key}: ${value}`
  } else if (typeof value === 'number') {
    return `${key}: ${value}`
  } else if (value instanceof Date) {
    return `${key}: ${value.toISOString().split('T')[0]}`
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${key}: []`
    }
    return `${key}: [${value.join(', ')}]`
  } else if (typeof value === 'string') {
    if (value.includes(':') || value.includes('#') || value.includes('\n')) {
      return `${key}: "${value}"`
    }
    return `${key}: ${value}`
  }
  return `${key}: ${String(value)}`
}

export default PropertiesPanel
