import Script from 'next/script'

export default function UmamiAnalytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim()

  if (!websiteId) {
    return null
  }

  return (
    <Script
      data-website-id={websiteId}
      defer
      src="https://cloud.umami.is/script.js"
      strategy="afterInteractive"
    />
  )
}
