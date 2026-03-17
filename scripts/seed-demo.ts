/*
 * DEMO FLOW
 * ---------
 * Creator:  MrBottomLine uploads "Why Most Indians Are Getting Term Insurance Wrong"
 *           → AI detects 4 ad moments (2 approved, 2 pending)
 *           → Creator assigns HDFC Life ad to slot 1, Zerodha to slot 2
 *           → Assembles final audio, previews with timeline
 *
 * Brand:    Searches for "finance podcast Mumbai 25-34 male"
 *           → Finds MrBottomLine episode with 2 approved insurance/fintech slots
 *           → Requests placement
 *
 * Run:  npx tsx scripts/seed-demo.ts
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

// ── Episode ────────────────────────────────────────────────────────────────

const EPISODE = {
  creator_name: 'MrBottomLine',
  title: 'Why Most Indians Are Getting Term Insurance Wrong',
  category: 'finance',
  audience_tier: 'metro',
  geography: 'Mumbai',
  age_group: '25-34',
  gender: 'male',
  audio_url: null as string | null,
  duration_seconds: 2400,
  status: 'ready',
  transcript: [
    { t: 0,    text: 'Welcome to MrBottomLine. I\'m your host and today we\'re talking about something most Indians get completely wrong.' },
    { t: 18,   text: 'Term insurance. It\'s the most important financial product you\'ll ever buy — and most people treat it as an afterthought.' },
    { t: 42,   text: 'Let\'s start with the basics. Term insurance is pure protection. No investment component, no maturity benefit.' },
    { t: 67,   text: 'You pay a premium, and if something happens to you, your family gets a large lump sum. That\'s it.' },
    { t: 95,   text: 'The problem? Most people buy 25 lakh of cover when they should be buying 1.5 crore or more.' },
    { t: 124,  text: 'Here\'s a simple rule: your cover should be at least 10–15 times your annual income.' },
    { t: 156,  text: 'If you earn 12 lakh a year, you need minimum 1.2 crore in term cover. Non-negotiable.' },
    { t: 189,  text: 'Now the second mistake — buying an endowment or ULIP thinking it\'s the same as term. It\'s not.' },
    { t: 228,  text: 'Endowments mix insurance with investment. You get a lower cover at a much higher premium. Terrible deal.' },
    { t: 271,  text: 'The math is brutal. Same premium, a pure term plan gives you 5–8x the coverage.' },
    { t: 318,  text: 'So why do agents push endowments? Because they earn 25–40% commission in year one. That\'s why.' },
    { t: 370,  text: 'Let\'s talk about when to buy. The answer is: as soon as you have dependents or debt.' },
    { t: 415,  text: 'Got a home loan? Your term cover should at minimum cover that outstanding loan amount.' },
    { t: 460,  text: 'Got married? Add your spouse\'s financial dependence into the calculation. Kids? Double it.' },
    { t: 487,  text: 'Speaking of financial protection — this episode is brought to you by a sponsor who gets this right.' },
    { t: 518,  text: 'Back to it. Riders. Should you add them? Accidental death benefit is usually worth it — low cost, high value.' },
    { t: 562,  text: 'Critical illness rider is situational. If your family has a history of cancer or cardiac disease, consider it.' },
    { t: 611,  text: 'Waiver of premium rider — absolutely yes. If you\'re disabled and can\'t pay premiums, policy stays active.' },
    { t: 658,  text: 'Now, online vs offline. Buy online. Always. Same cover, 20–30% cheaper premiums, no agent bias.' },
    { t: 710,  text: 'The claim settlement ratio — this is the metric you should obsess over, not the lowest premium.' },
  ],
}

// ── Moments ────────────────────────────────────────────────────────────────

const MOMENTS = [
  {
    timestamp_seconds: 487,
    context_snippet: 'Speaking of financial protection — this episode is brought to you by a sponsor who gets this right.',
    ad_category: 'insurance',
    confidence_score: 0.96,
    status: 'approved',
  },
  {
    timestamp_seconds: 923,
    context_snippet: 'If you\'re already investing in mutual funds, this is the perfect segue to talk about your portfolio health.',
    ad_category: 'fintech',
    confidence_score: 0.88,
    status: 'approved',
  },
  {
    timestamp_seconds: 1456,
    context_snippet: 'Your home loan EMI is a liability. Let\'s make sure your assets are growing faster than your debt.',
    ad_category: 'real-estate',
    confidence_score: 0.74,
    status: 'pending',
  },
  {
    timestamp_seconds: 1891,
    context_snippet: 'Upskilling is the best hedge against income uncertainty. If your income grows, your insurance needs grow too.',
    ad_category: 'ed-tech',
    confidence_score: 0.71,
    status: 'pending',
  },
]

// ── Ads ────────────────────────────────────────────────────────────────────

const ADS = [
  {
    title: 'HDFC Life Click 2 Protect — 30s',
    brand_name: 'HDFC Life',
    category: 'insurance',
    audio_url: '',
    duration_seconds: 30,
  },
  {
    title: 'Zerodha Kite — Start Your Investment Journey — 25s',
    brand_name: 'Zerodha',
    category: 'fintech',
    audio_url: '',
    duration_seconds: 25,
  },
  {
    title: 'NoBroker — Find Your Home Without Brokerage — 28s',
    brand_name: 'NoBroker',
    category: 'real-estate',
    audio_url: '',
    duration_seconds: 28,
  },
]

// ── Seed ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Seeding demo data…\n')

  // ── 1. Episode (idempotent) ──────────────────────────────────────────────

  const { data: existing } = await supabase
    .from('episodes')
    .select('id')
    .eq('creator_name', 'MrBottomLine')
    .eq('title', EPISODE.title)
    .single()

  let episodeId: string

  if (existing) {
    episodeId = existing.id
    console.log(`✓ Episode already exists — id: ${episodeId}`)
  } else {
    const { data: ep, error: epErr } = await supabase
      .from('episodes')
      .insert(EPISODE)
      .select('id')
      .single()

    if (epErr || !ep) {
      console.error('✗ Failed to insert episode:', epErr?.message)
      process.exit(1)
    }

    episodeId = ep.id
    console.log(`✓ Episode inserted — id: ${episodeId}`)
  }

  // ── 2. Moments (idempotent by timestamp + episode_id) ────────────────────

  for (const moment of MOMENTS) {
    const { data: existingMoment } = await supabase
      .from('moments')
      .select('id')
      .eq('episode_id', episodeId)
      .eq('timestamp_seconds', moment.timestamp_seconds)
      .single()

    if (existingMoment) {
      console.log(`✓ Moment @${moment.timestamp_seconds}s already exists`)
      continue
    }

    const { error: mErr } = await supabase
      .from('moments')
      .insert({ ...moment, episode_id: episodeId })

    if (mErr) {
      console.error(`✗ Failed to insert moment @${moment.timestamp_seconds}s:`, mErr.message)
    } else {
      console.log(`✓ Moment @${moment.timestamp_seconds}s inserted (${moment.ad_category}, ${moment.status})`)
    }
  }

  // ── 3. Ads (idempotent by title) ─────────────────────────────────────────

  for (const ad of ADS) {
    const { data: existingAd } = await supabase
      .from('ads')
      .select('id')
      .eq('title', ad.title)
      .single()

    if (existingAd) {
      console.log(`✓ Ad "${ad.title}" already exists`)
      continue
    }

    const { error: adErr } = await supabase
      .from('ads')
      .insert(ad)

    if (adErr) {
      console.error(`✗ Failed to insert ad "${ad.title}":`, adErr.message)
    } else {
      console.log(`✓ Ad "${ad.title}" inserted (${ad.category}, ${ad.duration_seconds}s)`)
    }
  }

  console.log('\n✅ Demo seed complete.')
  console.log(`\n   Episode ID: ${episodeId}`)
  console.log(`   Preview:    /episodes/${episodeId}/ads`)
}

seed().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
