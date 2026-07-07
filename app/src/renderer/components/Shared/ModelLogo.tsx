import type { CSSProperties } from 'react'
import { getModelVendor, type ModelVendorId } from '../../../shared/modelCompatibility'
import qwen from '../../assets/model-vendors/qwen.svg'
import gemma from '../../assets/model-vendors/gemma.svg'
import mistral from '../../assets/model-vendors/mistral.svg'
import llama from '../../assets/model-vendors/llama.svg'
import phi from '../../assets/model-vendors/phi.svg'
import deepseek from '../../assets/model-vendors/deepseek.svg'
import openai from '../../assets/model-vendors/openai.svg'
import granite from '../../assets/model-vendors/granite.svg'
import cohere from '../../assets/model-vendors/cohere.svg'
import bge from '../../assets/model-vendors/bge.svg'
import nomic from '../../assets/model-vendors/nomic.svg'
import openrouter from '../../assets/model-vendors/openrouter.svg'
import llmbase from '../../assets/model-vendors/llmbase.svg'
import generic from '../../assets/model-vendors/generic.svg'

// Vendor-Logo → Asset-URL. Single source: getModelVendor() in shared/modelCompatibility.
const VENDOR_LOGOS: Record<ModelVendorId, string> = {
  qwen, gemma, mistral, llama, phi, deepseek, openai, granite, cohere, bge, nomic, openrouter, llmbase, generic
}

interface Props {
  model: string
  size?: number
  className?: string
  style?: CSSProperties
}

/**
 * Kleines Hersteller-Logo neben einem Modellnamen (Wiedererkennung).
 * Leitet den Vendor aus dem Modell-Tag ab und rendert das passende SVG.
 */
export function ModelLogo({ model, size = 16, className, style }: Props) {
  const vendor = getModelVendor(model)
  return (
    <img
      src={VENDOR_LOGOS[vendor.id]}
      width={size}
      height={size}
      alt=""
      title={vendor.name}
      className={className}
      draggable={false}
      style={{
        borderRadius: 4,
        flexShrink: 0,
        display: 'inline-block',
        verticalAlign: 'middle',
        ...style
      }}
    />
  )
}
