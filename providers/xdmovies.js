const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';

async function getStreams(tmdbId, type = 'movie') {
  try {
    const tmdbRes = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`);
    const tmdbData = await tmdbRes.json();
    const title = tmdbData.title || tmdbData.name || tmdbData.original_title || tmdbData.original_name;
    if (!title) return [];

    const searchRes = await fetch(`https://top.xdmovies.wtf/php/search_api.php?query=${encodeURIComponent(title)}&fuzzy=true&limit=15`, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-Auth-Token': '7297skkihkajwnsgaklakshuwd',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const searchResults = await searchRes.json();
    if (!Array.isArray(searchResults)) return [];

    const match = searchResults.find(x => String(x.tmdb_id) === String(tmdbId)) ||
                  searchResults.find(x => (x.title || '').toLowerCase() === title.toLowerCase());
    if (!match) return [];

    const streams = [];
    const qualities = Array.isArray(match.qualities) && match.qualities.length > 0 ? match.qualities : ['2160p', '1080p'];

    for (const q of qualities) {
      const qUpper = q.toUpperCase();
      streams.push({
        name: `XDMovies | ${qUpper} | ${match.audio_languages || 'Multi Audio'}`,
        title: `${match.title} (${match.release_year || ''}) [${qUpper}] - ${match.audio_languages || 'Multi Audio'}`,
        url: `https://top.xdmovies.wtf${match.path}`,
        quality: qUpper === '2160P' ? '4K' : qUpper,
        qualityTag: qUpper,
        behaviorHints: {
          notWebReady: true,
          proxyHeaders: {
            request: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://top.xdmovies.wtf/'
            }
          }
        }
      });
    }
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
