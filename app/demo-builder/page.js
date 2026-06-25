'use client'

const C = {
  bg: '#0f0f0f', surface: '#1a1a1a', border: '#2a2a2a',
  accent: '#00d4ff', text: '#ffffff', muted: '#888888',
}

const DEMO_TYPES = [
  { id: 'signup_login',                 label: 'Signup + Login',                      desc: 'Show the full signup and login flow' },
  { id: 'wizard_website_templates',     label: 'Setup Wizard + Website + Templates',  desc: 'Onboarding wizard and site builder' },
  { id: 'products',                     label: 'Products & Services',                 desc: 'Adding and managing products' },
  { id: 'orders',                       label: 'Orders',                              desc: 'Order management dashboard' },
  { id: 'promotions',                   label: 'Promotions',                          desc: 'Creating and managing promotions' },
  { id: 'customers',                    label: 'Customers',                           desc: 'Customer list and profiles' },
  { id: 'announcements',                label: 'Announcements',                       desc: 'Publishing announcements' },
  { id: 'payments_stripe_connect',      label: 'Payment Setup (Stripe Connect)',      desc: 'Connecting Stripe for payments' },
  { id: 'store_agreement',              label: 'Store Agreement',                     desc: 'Store agreement flow' },
  { id: 'ai_mentor_action_plans',       label: 'AI Mentor + Action Plans',            desc: 'AI-powered business guidance' },
  { id: 'referrals_referrer_dashboard', label: 'Referrals + Referrer Dashboard',      desc: 'Referral program and dashboard' },
  { id: 'staff',                        label: 'Staff',                               desc: 'Staff management' },
  { id: 'billing_upgrade',              label: 'Billing + Upgrade',                   desc: 'Billing and plan upgrade flow' },
  { id: 'account',                      label: 'Account',                             desc: 'Account settings' },
  { id: 'main_dashboard',              label: 'Main Dashboard',                      desc: 'Overview of the main dashboard' },
]

export default function DemoBuilderIndex() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '24px 16px', maxWidth: '560px', margin: '0 auto' }}>
      <div style={{ fontSize: '22px', fontWeight: '800', color: C.accent, marginBottom: '4px' }}>Demo Builder</div>
      <div style={{ fontSize: '13px', color: C.muted, marginBottom: '28px' }}>
        <a href="/" style={{ color: C.muted, textDecoration: 'none' }}>← Back to ReelForge</a>
      </div>

      <div style={{ fontSize: '12px', color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
        Choose a demo to build
      </div>

      {DEMO_TYPES.map((d, i) => (
        <a
          key={d.id}
          href={`/demo-builder/${d.id}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            marginBottom: '8px',
            border: `1px solid ${C.border}`,
            borderRadius: '10px',
            background: C.surface,
            color: C.text,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600' }}>{i + 1}. {d.label}</div>
            <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>{d.desc}</div>
          </div>
          <div style={{ color: C.muted, fontSize: '18px' }}>›</div>
        </a>
      ))}
    </div>
  )
}
