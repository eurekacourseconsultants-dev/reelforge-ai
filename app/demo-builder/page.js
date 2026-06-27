'use client'
import { useRouter } from 'next/navigation'

const C = {
  bg: '#0f0f0f', surface: '#1a1a1a', border: '#2a2a2a',
  accent: '#00d4ff', text: '#ffffff', muted: '#888888',
}

const DEMO_TYPES = [
  { id: 'signup_login',                 label: '1. Signup + Login' },
  { id: 'wizard_website_templates',     label: '2. Setup Wizard + Website + Templates' },
  { id: 'products',                     label: '3. Products & Services' },
  { id: 'orders',                       label: '4. Orders' },
  { id: 'promotions',                   label: '5. Promotions' },
  { id: 'customers',                    label: '6. Customers' },
  { id: 'announcements',                label: '7. Announcements' },
  { id: 'payments_stripe_connect',      label: '8. Payment Setup (Stripe Connect)' },
  { id: 'store_agreement',              label: '9. Store Agreement' },
  { id: 'ai_mentor_action_plans',       label: '10. AI Mentor + Action Plans' },
  { id: 'referrals_referrer_dashboard', label: '11. Referrals + Referrer Dashboard' },
  { id: 'staff',                        label: '12. Staff' },
  { id: 'billing_upgrade',              label: '13. Billing + Upgrade' },
  { id: 'account',                      label: '14. Account' },
  { id: 'main_dashboard',               label: '15. Main Dashboard' },
]

export default function DemoBuilderList() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#ffffff', fontFamily: 'system-ui, sans-serif', padding: '24px 16px', maxWidth: '560px', margin: '0 auto' }}>
      <div style={{ fontSize: '13px', color: '#888888', marginBottom: '20px' }}>
        <a href="/" style={{ color: '#888888', textDecoration: 'none' }}>← Back</a>
      </div>
      <div style={{ fontSize: '26px', fontWeight: '800', color: '#00d4ff', marginBottom: '4px' }}>Demo Builder</div>
      <div style={{ fontSize: '13px', color: '#888888', marginBottom: '28px' }}>Choose a demo to generate.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {DEMO_TYPES.map(d => (
          <div
            key={d.id}
            onClick={() => router.push('/demo-builder/' + d.id)}
            style={{ padding: '14px 16px', border: '2px solid #2a2a2a', borderRadius: '8px', background: '#1a1a1a', cursor: 'pointer', fontSize: '14px', color: '#ffffff' }}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  )
}
