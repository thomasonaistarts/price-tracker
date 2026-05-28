'use client'

import { useState } from 'react'

interface PlatformConfig {
  domain: string
  fallbackColor: string
  initial: string
}

const PLATFORM_CONFIG: Record<string, PlatformConfig> = {
  'Hepsiburada': { domain: 'hepsiburada.com', fallbackColor: '#ff6000', initial: 'H' },
  'N11':         { domain: 'n11.com',          fallbackColor: '#7b2d8b', initial: 'N' },
  'PTTAvm':      { domain: 'pttavm.com',       fallbackColor: '#c8002d', initial: 'P' },
  'İdefix':      { domain: 'idefix.com',       fallbackColor: '#1a56db', initial: 'İ' },
  'Trendyol':    { domain: 'trendyol.com',     fallbackColor: '#f27a1a', initial: 'T' },
}

interface Props {
  name: string
  size?: number
  className?: string
}

export default function PlatformLogo({ name, size = 16, className = '' }: Props) {
  const [errored, setErrored] = useState(false)
  const config = PLATFORM_CONFIG[name]

  // Bilinmeyen platform veya favicon yüklenemedi → renkli harf
  if (!config || errored) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-sm text-white font-bold flex-shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.6,
          backgroundColor: config?.fallbackColor ?? '#6b7280',
        }}
      >
        {(config?.initial ?? name[0]).toUpperCase()}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${config.domain}&sz=32`}
      alt={name}
      width={size}
      height={size}
      className={`flex-shrink-0 rounded-sm ${className}`}
      onError={() => setErrored(true)}
    />
  )
}
