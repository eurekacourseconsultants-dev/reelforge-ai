export const metadata = {
  title: 'ReelForge AI',
  description: 'AI video generation',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0f0f0f" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#0f0f0f' }}>
        {children}
      </body>
    </html>
  )
}
