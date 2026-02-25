const router = require('express').Router();
const axios = require('axios');

router.get('/', async (req, res) => {
  try {
    const { niche = 'social media' } = req.query;

    // Fetch trending topics — try multiple methods
    let topics = [];

    // Method 1: Google Trends Trending Now (India)
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          engine: 'google_trends_trending_now',
          frequency: 'realtime',
          geo: 'IN',
          category: 'all',
          api_key: process.env.SERP_API_KEY
        }
      });

      const searches = response.data.realtime_searches || [];
      topics = searches.slice(0, 10).map(t => ({
        title: t.title || t.query || t.entity_names?.[0] || 'Trending',
        traffic: t.traffic || t.search_volume || 'Trending Now'
      })).filter(t => t.title !== 'Trending');

    } catch (err) {
      console.log('Trending Now failed, trying related queries:', err.message);
    }

    // Method 2: Related queries if method 1 gave nothing
    if (topics.length < 3) {
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
        const extra = trending.slice(0, 10).map(t => ({
          title: t.query,
          traffic: t.value || 'Rising'
        }));
        topics = [...topics, ...extra].slice(0, 10);
      } catch (err) {
        console.log('Related queries also failed:', err.message);
      }
    }

    // Method 3: Fallback if both failed
    if (topics.length < 3) {
      topics = [
        { title: `${niche} trends 2025`, traffic: '100K+' },
        { title: `${niche} for beginners`, traffic: '80K+' },
        { title: `best ${niche} tools`, traffic: '60K+' },
        { title: `${niche} tips India`, traffic: '50K+' },
        { title: `${niche} career 2025`, traffic: '40K+' },
        { title: `how to learn ${niche}`, traffic: '35K+' },
        { title: `${niche} salary India`, traffic: '30K+' },
        { title: `${niche} vs traditional`, traffic: '25K+' },
        { title: `${niche} certification`, traffic: '20K+' },
        { title: `${niche} projects`, traffic: '15K+' },
      ];
    }

    // AI content ideas
    let ideas = [];
    try {
      const topicNames = topics.slice(0, 5).map(t => t.title).join(', ') || niche;

      const aiResponse = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'google/gemini-2.5-flash-lite-preview-09-2025',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Give me exactly 6 viral content ideas for a ${niche} creator in India in 2025.
Trending topics: ${topicNames}

Reply ONLY with a valid JSON array, no markdown, no explanation, no extra text:
[{"topic":"...","hook":"...","platform":"LinkedIn","angle":"..."},{"topic":"...","hook":"...","platform":"Instagram","angle":"..."},{"topic":"...","hook":"...","platform":"YouTube","angle":"..."},{"topic":"...","hook":"...","platform":"LinkedIn","angle":"..."},{"topic":"...","hook":"...","platform":"Instagram","angle":"..."},{"topic":"...","hook":"...","platform":"YouTube","angle":"..."}]`
          }]
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://synapsocial.vercel.app',
            'X-Title': 'SynapSocial'
          }
        }
      );

      const raw = aiResponse.data.choices[0].message.content;
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) ideas = JSON.parse(jsonMatch[0]);

    } catch (err) {
      console.log('AI ideas error:', err.message);
    }

    // Fallback ideas if AI failed
    if (ideas.length === 0) {
      ideas = [
        { topic: `${niche} trends 2025`, hook: `Everyone in ${niche} is missing this...`, platform: 'LinkedIn', angle: 'Thought leadership' },
        { topic: `${niche} beginner guide`, hook: `I wish I knew this when starting ${niche}`, platform: 'Instagram', angle: 'Educational carousel' },
        { topic: `${niche} tools review`, hook: `Top 5 ${niche} tools that saved me 10hrs/week`, platform: 'YouTube', angle: 'Product review' },
        { topic: `${niche} mistakes`, hook: `Stop making these ${niche} mistakes in 2025`, platform: 'LinkedIn', angle: 'Cautionary tale' },
        { topic: `${niche} income`, hook: `How I make money with ${niche} — full breakdown`, platform: 'Instagram', angle: 'Income reveal' },
        { topic: `${niche} roadmap`, hook: `Complete ${niche} roadmap for 2025`, platform: 'YouTube', angle: 'Step by step guide' },
      ];
    }

    res.json({ trending: topics, ideas });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Trends error', error: err.message });
  }
});

module.exports = router;