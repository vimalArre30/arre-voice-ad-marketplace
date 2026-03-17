/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // SharedArrayBuffer is required by ffmpeg.wasm — scope headers to just this route
        source: '/episodes/:id/assemble',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // credentialless (vs require-corp) lets us fetch public Supabase Storage
          // URLs without needing Cross-Origin-Resource-Policy on the CDN responses
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ]
  },
}

export default nextConfig
