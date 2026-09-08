export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="wrap"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        paddingBlock: 40,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>{children}</div>
    </main>
  )
}
