/**
 * Properties Panel Component
 * Displays and allows editing of YAML frontmatter fields
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from '../../utils/translations'
import { parseFrontmatter } from '../../utils/metadataExtractor'
import { useDataviewStore } from '../../stores/dataviewStore'
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
 * Strip # prefix from tag if present
 */
const stripHashFromTag = (tag: string): string => {
  return tag.startsWith('#') ? tag.slice(1) : tag
}

/**
 * Tags field editor with autocomplete from existing tags
 */
const TagsFieldEditor: React.FC<{
  fieldKey: string
  value: unknown
  onChange: (key: string, value: unknown) => void
}> = ({ fieldKey, value, onChange }) => {
  // Strip # from all tags when loading
  const arrayValue = Array.isArray(value) ? value.map(t => stripHashFromTag(String(t))) : []
  const [inputValue, setInputValue] = useState(arrayValue.join(', '))
  const [isFocused, setIsFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filterText, setFilterText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Get all tags from dataview store
  const tagIndex = useDataviewStore(s => s.tagIndex)
  const allTags = useMemo(() => Array.from(tagIndex.keys()).sort(), [tagIndex])

  // Filter suggestions based on current input and already selected tags
  const suggestions = useMemo(() => {
    const currentTags = arrayValue.map(t => t.toLowerCase())
    const filter = filterText.toLowerCase()
    return allTags
      .filter(tag => !currentTags.includes(stripHashFromTag(tag).toLowerCase()))
      .filter(tag => !filter || stripHashFromTag(tag).toLowerCase().includes(filter))
      .slice(0, 10)
  }, [allTags, arrayValue, filterText])

  // Sync input value when external value changes (but not while editing)
  useEffect(() => {
    if (!isFocused) {
      setInputValue(arrayValue.join(', '))
    }
  }, [arrayValue, isFocused])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newInputValue = e.target.value
    setInputValue(newInputValue)

    // Extract filter text (text after last comma)
    const parts = newInputValue.split(',')
    const lastPart = parts[parts.length - 1].trim()
    setFilterText(stripHashFromTag(lastPart))

    // Parse and update the actual value (filtering empty items, stripping #)
    const items = newInputValue.split(',').map(s => stripHashFromTag(s.trim())).filter(Boolean)
    onChange(fieldKey, items)
  }

  const handleAddTag = (tag: string) => {
    // Strip # from tag when adding
    const cleanTag = stripHashFromTag(tag)
    const newTags = [...arrayValue, cleanTag]
    onChange(fieldKey, newTags)
    setInputValue(newTags.join(', '))
    setFilterText('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  return (
    <div className="properties-tags-container">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleChange}
        onFocus={() => {
          setIsFocused(true)
          setShowSuggestions(true)
        }}
        onBlur={() => {
          setIsFocused(false)
          // Clean up the display value on blur (delayed to allow click on suggestion)
          setTimeout(() => {
            if (!showSuggestions) {
              setInputValue(arrayValue.join(', '))
            }
          }, 200)
        }}
        className="properties-input properties-array"
        placeholder="tag1, tag2, ..."
      />
      {showSuggestions && suggestions.length > 0 && (
        <div ref={suggestionsRef} className="properties-tags-suggestions">
          {suggestions.map(tag => (
            <div
              key={tag}
              className="properties-tag-suggestion"
              onMouseDown={(e) => {
                e.preventDefault()
                handleAddTag(tag)
              }}
            >
              {stripHashFromTag(tag)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Array field editor with local state to allow typing commas
 */
const ArrayFieldEditor: React.FC<{
  fieldKey: string
  value: unknown
  onChange: (key: string, value: unknown) => void
}> = ({ fieldKey, value, onChange }) => {
  const arrayValue = Array.isArray(value) ? value : []
  const [inputValue, setInputValue] = useState(arrayValue.join(', '))
  const [isFocused, setIsFocused] = useState(false)

  // Sync input value when external value changes (but not while editing)
  useEffect(() => {
    if (!isFocused) {
      setInputValue(arrayValue.join(', '))
    }
  }, [arrayValue, isFocused])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newInputValue = e.target.value
    setInputValue(newInputValue)

    // Parse and update the actual value (filtering empty items)
    const items = newInputValue.split(',').map(s => s.trim()).filter(Boolean)
    onChange(fieldKey, items)
  }

  return (
    <input
      type="text"
      value={inputValue}
      onChange={handleChange}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false)
        // Clean up the display value on blur
        setInputValue(arrayValue.join(', '))
      }}
      className="properties-input properties-array"
      placeholder="item1, item2, ..."
    />
  )
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
      // Use TagsFieldEditor for 'tags' field with autocomplete
      if (fieldKey.toLowerCase() === 'tags') {
        return (
          <TagsFieldEditor
            fieldKey={fieldKey}
            value={value}
            onChange={onChange}
          />
        )
      }
      return (
        <ArrayFieldEditor
          fieldKey={fieldKey}
          value={value}
          onChange={onChange}
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
 * Arrays are ALWAYS output in block format with dashes for consistency
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

  const yamlContent = match[1]

  // Parse existing lines to preserve formatting
  const yamlLines = yamlContent.split('\n')
  const newLines: string[] = []
  let found = false
  let skipDashLines = false
  let currentKeyForSkipping = ''

  for (let i = 0; i < yamlLines.length; i++) {
    const line = yamlLines[i]

    // Check if this is a dash line (array item) that should be skipped
    if (skipDashLines) {
      if (line.match(/^\s+-/)) {
        continue // Skip this dash line, it belongs to the key we're replacing
      } else {
        skipDashLines = false // End of block array
        currentKeyForSkipping = ''
      }
    }

    const keyMatch = line.match(/^([^:]+):(.*)$/)
    if (keyMatch) {
      const lineKey = keyMatch[1].trim()
      if (lineKey.toLowerCase() === changedKey.toLowerCase()) {
        // Replace this key with new value
        if (Array.isArray(newValue)) {
          // ALWAYS output arrays in block format with dashes
          newLines.push(`${lineKey}:`)
          for (const item of newValue) {
            newLines.push(`  - ${item}`)
          }
        } else {
          newLines.push(formatYamlLine(lineKey, newValue))
        }
        found = true
        // Skip any following dash lines (whether original was block or inline format)
        // Also skip if there was an inline array - the next lines might be orphaned dashes
        skipDashLines = true
        currentKeyForSkipping = lineKey.toLowerCase()
        // Check if next line is a dash line OR if current line had inline array
        const valueAfterColon = keyMatch[2].trim()
        if (valueAfterColon && !valueAfterColon.startsWith('[')) {
          // There's a non-array value after colon, don't skip dash lines
          skipDashLines = false
        }
        continue
      } else {
        // Different key - stop skipping dash lines
        skipDashLines = false
      }
    }
    newLines.push(line)
  }

  // If key wasn't found, add it
  if (!found) {
    if (Array.isArray(newValue) && newValue.length > 0) {
      // New arrays in block format
      newLines.push(`${changedKey}:`)
      for (const item of newValue) {
        newLines.push(`  - ${item}`)
      }
    } else {
      newLines.push(formatYamlLine(changedKey, newValue))
    }
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
