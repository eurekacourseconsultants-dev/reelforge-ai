import supabase from './supabase.js'

export async function getActiveKaggleAccount() {
  const pool = JSON.parse(process.env.KAGGLE_POOL)

  const { data: health } = await supabase
    .from('kaggle_health')
    .select('*')
    .order('account_index', { ascending: true })

  for (const account of pool) {
    const record = health.find(h => h.username === account.username)
    if (!record || !record.is_exhausted) {
      return account
    }
    if (record.is_exhausted && record.unlocks_at && new Date(record.unlocks_at) < new Date()) {
      await supabase
        .from('kaggle_health')
        .update({ is_exhausted: false, exhausted_at: null, unlocks_at: null })
        .eq('username', account.username)
      return account
    }
  }

  throw new Error('All Kaggle accounts exhausted')
}

export async function markAccountExhausted(username) {
  const unlocks = new Date()
  unlocks.setDate(unlocks.getDate() + 7)

  await supabase
    .from('kaggle_health')
    .update({
      is_exhausted: true,
      exhausted_at: new Date().toISOString(),
      unlocks_at: unlocks.toISOString(),
    })
    .eq('username', username)
}
