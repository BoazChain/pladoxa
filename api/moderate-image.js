export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { imageBase64, mimeType } = req.body
  if (!imageBase64) return res.status(400).json({ error: 'No image provided' })

  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`,
            },
          },
        ],
      }),
    })

    const data = await response.json()
    console.log('[IMAGE MOD]', JSON.stringify(data))
    res.status(200).json(data)
  } catch (e) {
    console.error('[IMAGE MOD] error:', e)
    res.status(500).json({ error: e.message })
  }
}
