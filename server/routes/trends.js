const router = require('express').Router();
const axios = require('axios');

router.get('/', async (req, res) => {
  try {
    const { niche = 'social media' } = req.query;

    // Fetch trending topics
    let topics = [];
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          engine: 'google_trends',
          q: niche,
          geo: 'IN',
          data_type: 'RELATED_QUERIES',
          api_key: process.env.SERP_API_KEY
        }
      });
      const trending = response.data.related_queries?.rising ||
                       response.data.related_queries?.top || [];
      topics = trending.slice(0, 10).map(t => ({
        title: t.query,
        traffic: t.value || 'Rising'
      }));
    } catch (err) {
      console.log('SerpAPI error:', err.message);
      // fallback topics so AI still runs
      topics = [
        { title: `${niche} tips 2025`, traffic: 'Trending' },
        { title: `best ${niche} tools`, traffic: 'Rising' },
        { title: `${niche} for beginners`, traffic: 'Trending' },
      ];
    }

    // AI content ideas — separate try/catch so it never blocks
    let ideas = [];
    try {
      const topicNames = topics.slice(0, 5).map(t => t.title).join(', ') || niche;

      const aiResponse = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'google/gemini-2.5-flash-lite-preview-09-2025',
          max_tokens: 400,
          messages: [{
            role: 'user',
            content: `Give me exactly 5 viral content ideas for a ${niche} creator in India in 2025.
Trending topics to consider: ${topicNames}

Reply ONLY with a valid JSON array, no markdown, no explanation:
[{"topic":"...","hook":"...","platform":"LinkedIn","angle":"..."},{"topic":"...","hook":"...","platform":"Instagram","angle":"..."},{"topic":"...","hook":"...","platform":"YouTube","angle":"..."},{"topic":"...","hook":"...","platform":"LinkedIn","angle":"..."},{"topic":"...","hook":"...","platform":"Instagram","angle":"..."}]`
          }]
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'SynapSocial'
          }
        }
      );

      const raw = aiResponse.data.choices[0].message.content;
      // aggressive cleaning
      const cleaned = raw
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .replace(/^[^[]*/, '')  // remove anything before [
        .replace(/[^\]]*$/, '') // remove anything after ]
        .trim();

      ideas = JSON.parse(cleaned);
    } catch (err) {
      console.log('AI ideas error:', err.message);
      // fallback hardcoded ideas so UI never shows empty
      ideas = [
        { topic: `${niche} trends 2025`, hook: `Everyone in ${niche} is missing this...`, platform: 'LinkedIn', angle: 'Thought leadership' },
        { topic: `${niche} beginner guide`, hook: `I wish I knew this when starting ${niche}`, platform: 'Instagram', angle: 'Educational carousel' },
        { topic: `${niche} tools review`, hook: `Top 5 ${niche} tools that saved me 10hrs/week`, platform: 'YouTube', angle: 'Product review' },
        { topic: `${niche} mistakes`, hook: `Stop making these ${niche} mistakes in 2025`, platform: 'LinkedIn', angle: 'Cautionary tale' },
        { topic: `${niche} income`, hook: `How I make money with ${niche} — full breakdown`, platform: 'Instagram', angle: 'Income reveal' },
      ];
    }

    res.json({ trending: topics, ideas });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Trends error', error: err.message });
  }
});

module.exports = router;