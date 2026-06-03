export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'No text provided' })

  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ input: text, model: 'text-moderation-latest' }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[MODERATE] OpenAI error', response.status, err)
      return res.status(200).json({ results: [] }) // fail open — don't block post
    }

    const data = await response.json()
    console.log('[MODERATE] text:', text.slice(0, 60), '| flagged:', data.results?.[0]?.flagged, '| scores:', JSON.stringify(data.results?.[0]?.category_scores))
    res.status(200).json(data)
  } catch (e) {
    console.error('[MODERATE] exception:', e.message)
    res.status(200).json({ results: [] })
  }
}
