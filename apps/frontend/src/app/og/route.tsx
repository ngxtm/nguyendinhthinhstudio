import React from 'react'
import { ImageResponse } from 'next/og'

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'center',
          backgroundColor: '#171717',
          color: '#f5f5f5',
          display: 'flex',
          height: '100%',
          justifyContent: 'center',
          padding: '72px',
          width: '100%'
        }}
      >
        <div
          style={{
            alignItems: 'center',
            border: '2px solid #525252',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            justifyContent: 'center',
            width: '100%'
          }}
        >
          <div style={{ color: '#d4d4d4', fontSize: 32, letterSpacing: '0.32em' }}>NDT STUDIO</div>
          <div style={{ color: '#ffffff', fontSize: 66, fontWeight: 700, marginTop: 28 }}>Nhiếp ảnh chuyên nghiệp</div>
          <div style={{ color: '#a3a3a3', fontSize: 28, marginTop: 26 }}>Nha Trang · Việt Nam</div>
        </div>
      </div>
    ),
    {
      height: 630,
      width: 1200
    }
  )
}
