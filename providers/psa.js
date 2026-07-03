const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';

async function getStreams(tmdbId, type = 'movie') {
  try {
    const tmdbRes = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`);
    const tmdbData = await tmdbRes.json();
    const title = tmdbData.title || tmdbData.name || tmdbData.original_title || tmdbData.original_name;
    const year = (tmdbData.release_date || tmdbData.first_air_date || '').slice(0, 4);
    if (!title) return [];

    const feeds = [
      'https://psa.wf/tag/2160p/feed/',
      `https://psa.wf/category/${type === 'movie' ? 'movie' : 'tv-show'}/feed/`,
      'https://psa.wf/feed/'
    ];

    let exactLink = null;
    let found2160p = false;
    let found1080p = false;

    for (const feedUrl of feeds) {
      try {
        const res = await fetch(feedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const xml = await res.text();
        const items = xml.split('<item>');
        for (let i = 1; i < items.length; i++) {
          const itemXml = items[i];
          const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) || itemXml.match(/<title>(.*?)<\/title>/i);
          const linkMatch = itemXml.match(/<link>(.*?)<\/link>/i);
          if (titleMatch && linkMatch) {
            const itemTitle = titleMatch[1];
            const cleanItemTitle = itemTitle.replace(/[^a-z0-9]/gi, ' ').toLowerCase();
            const cleanSearchTitle = title.replace(/[^a-z0-9]/gi, ' ').toLowerCase();
            if (cleanItemTitle.includes(cleanSearchTitle)) {
              exactLink = linkMatch[1];
              if (itemXml.toUpperCase().includes('2160P') || itemXml.toUpperCase().includes('4K')) found2160p = true;
              if (itemXml.toUpperCase().includes('1080P')) found1080p = true;
              break;
            }
          }
        }
        if (exactLink) break;
      } catch (err) {}
    }

    const streams = [];
    const targetUrl = exactLink || `https://psa.wf/?s=${encodeURIComponent(title)}`;

    streams.push({
      name: 'PSArips | 2160P | x265 HEVC 10-Bit',
      title: `${title} (${year}) [2160P 4K x265 HEVC] - PSArips High Quality Encode`,
      url: targetUrl,
      quality: '4K',
      qualityTag: '2160P',
      behaviorHints: {
        notWebReady: true,
        proxyHeaders: {
          request: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://psa.wf/'
          }
        }
      }
    });

    streams.push({
      name: 'PSArips | 1080P | x265 HEVC 10-Bit',
      title: `${title} (${year}) [1080P x265 HEVC] - PSArips High Quality Encode`,
      url: targetUrl,
      quality: '1080P',
      qualityTag: '1080P',
      behaviorHints: {
        notWebReady: true,
        proxyHeaders: {
          request: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://psa.wf/'
          }
        }
      }
    });

    return streams;
  } catch (e) {
    console.error(e);
    return [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
}
if (typeof global !== 'undefined') {
  global.getStreams = getStreams;
}

// --- 4K-NUVIO STRICT FILTER WRAPPER ---
if (typeof getStreams === 'function') {
  const __origGetStreams = getStreams;
  getStreams = async function(...args) {
    try {
      const results = await __origGetStreams(...args);
      if (!Array.isArray(results)) return [];
      return results.filter(s => {
        const q = (s.quality || '').toUpperCase();
        const str = ((s.name || '') + ' ' + (s.title || '') + ' ' + (s.qualityTag || '')).toUpperCase();
        const is2160 = q === '4K' || q === '2160P' || str.includes('2160P') || /\b(4K\s*UHD|UHD\s*4K|2160)\b/.test(str);
        const isLower = /\b(1080P|720P|480P)\b/.test(str);
        if (isLower && !str.includes('2160P')) return false;
        return is2160 || (q === '4K' && !isLower);
      });
    } catch (e) {
      return [];
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { getStreams };
  if (typeof global !== 'undefined') global.getStreams = getStreams;
}
