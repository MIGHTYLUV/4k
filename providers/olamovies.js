const PROVIDER_NAME = 'OlaMovies 4K';
const BASE_URL = 'https://v3.olamovies.mov';
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TIMEOUT = 15000;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

async function fetchWithTimeout(url, options = {}, timeout = TIMEOUT) {
  const fetchOptions = { ...options };
  if (!fetchOptions.headers) fetchOptions.headers = HEADERS;
  return Promise.race([
    fetch(url, fetchOptions),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request Timeout')), timeout))
  ]);
}

async function fetchText(url, options = {}) {
  try {
    const res = await fetchWithTimeout(url, options);
    if (res && res.ok) return await res.text();
    return null;
  } catch (err) {
    return null;
  }
}

async function fetchJson(url, options = {}) {
  try {
    const res = await fetchWithTimeout(url, options);
    if (res && res.ok) return await res.json();
    return null;
  } catch (err) {
    return null;
  }
}

async function getTMDBInfo(tmdbId, type) {
  const mediaType = (type === 'tv' || type === 'series') ? 'tv' : 'movie';
  let title = '';
  let year = '';
  try {
    const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const data = await fetchJson(url);
    if (data) {
      title = data.title || data.name || '';
      const dateStr = data.release_date || data.first_air_date || '';
      year = dateStr.split('-')[0];
    }
  } catch (err) {}
  return { title, year, type: mediaType };
}

async function searchArticles(query, year, isTv, season) {
  const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
  const html = await fetchText(searchUrl);
  if (!html) return [];

  const articles = [];
  const linkRegex = /<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    let titleText = match[2].replace(/<[^>]+>/g, '').replace(/&#8211;/g, '-').replace(/&#038;/g, '&').trim();

    if (url.includes('/category/') || url.includes('/page/')) continue;

    if (!isTv && year && !titleText.includes(year)) {
      if (!titleText.toLowerCase().includes(query.toLowerCase())) continue;
    }

    if (isTv && season) {
      const seasonRegex = new RegExp(`(?:Season\\s*0*${season}|S0*${season}\\b)`, 'i');
      if (!seasonRegex.test(titleText) && !titleText.toLowerCase().includes('complete')) {
        continue;
      }
    }

    articles.push({ url, title: titleText });
  }

  return articles;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '--')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, "'");
}

function extract4KStreams(articleHtml, articleUrl, tmdbInfo) {
  const streams = [];
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  const seenUrls = new Set();

  while ((match = linkRegex.exec(articleHtml)) !== null) {
    const url = match[1].trim();
    const rawText = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, '').trim());

    if (!url.startsWith('http://') && !url.startsWith('https://')) continue;
    if (url.includes('olamovies.mov') || url.includes('google.com') || url.includes('telegram.me') || url.includes('t.me')) continue;

    // STRICT 4K FILTERING: Ensure the link is 4K / 2160p
    const is2160p = /2160p|\b4k\b/i.test(rawText);
    const isLowerQuality = /1080p|720p|480p/i.test(rawText);

    if (!is2160p || (isLowerQuality && !rawText.toLowerCase().includes('2160p'))) {
      continue;
    }

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    const sizeMatch = rawText.match(/\[?(\d+(?:\.\d+)?\s*(?:GB|MB))\]?/i);
    const sizeStr = sizeMatch ? sizeMatch[1].toUpperCase() : 'N/A';

    const tags = [];
    if (/hdr10\+/i.test(rawText)) tags.push('⚡ HDR10+');
    else if (/hdr10/i.test(rawText)) tags.push('⚡ HDR10');
    else if (/hdr/i.test(rawText)) tags.push('⚡ HDR');

    if (/dv|dolby\s*vision/i.test(rawText)) tags.push('🕵️‍♀️ DV');
    if (/remux/i.test(rawText)) tags.push('💎 REMUX');
    if (/bluray/i.test(rawText)) tags.push('📀 BluRay');
    if (/web-dl|webrip/i.test(rawText)) tags.push('🌐 WEB-DL');
    if (/x265|hevc/i.test(rawText)) tags.push('🎥 HEVC x265');
    if (/10bit/i.test(rawText)) tags.push('🔆 10Bit');
    if (/atmos/i.test(rawText)) tags.push('🔊 Atmos');

    const tagStr = tags.length > 0 ? tags.join(' • ') : '🌟 4K UHD';

    streams.push({
      name: `${PROVIDER_NAME} | 2160P (4K)`,
      title: `🎬 ${tmdbInfo.title || 'Movie'} (${tmdbInfo.year || ''})\n🌟 2160P 4K UHD | 💾 ${sizeStr}\n${tagStr} |\n🔗 ${rawText}`,
      url: url,
      quality: '4K',
      size: sizeStr,
      behaviorHints: {
        notWebReady: true,
        proxyHeaders: {
          request: {
            Referer: articleUrl
          }
        }
      }
    });
  }

  return streams;
}

async function getStreams(tmdbId, type = 'movie', season = null, episode = null) {
  const streams = [];
  try {
    const isTv = (type === 'tv' || type === 'series');
    const tmdbInfo = await getTMDBInfo(tmdbId, type);
    if (!tmdbInfo.title) return streams;

    console.log(`[${PROVIDER_NAME}] Searching for: ${tmdbInfo.title} (${tmdbInfo.year})`);
    const articles = await searchArticles(tmdbInfo.title, tmdbInfo.year, isTv, season);

    for (const article of articles) {
      const articleHtml = await fetchText(article.url);
      if (!articleHtml) continue;

      const extracted = extract4KStreams(articleHtml, article.url, tmdbInfo);
      streams.push(...extracted);
    }
  } catch (err) {
    console.error(`[${PROVIDER_NAME}] Error fetching streams:`, err);
  }
  return streams;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}

// --- AIOSTREAMS RICH CARD 4K-ONLY WRAPPER WITH EXOPLAYER HEADERS ---
if (typeof getStreams === 'function') {
  const __origGetStreams = getStreams;
  getStreams = async function(...args) {
    try {
      const results = await __origGetStreams(...args);
      if (!Array.isArray(results)) return [];
      
      const cleaned = results.map(s => {
        let q = (s.quality || '').toString().toUpperCase();
        const rawText = ((s.name || '') + ' ' + (s.title || '') + ' ' + (s.qualityTag || '') + ' ' + (s.url || '')).toUpperCase();
        
        const is2160 = q === '4K' || q === '2160P' || rawText.includes('2160P') || /\b(4K|2160)\b/.test(rawText);
        if (!is2160) return null;
        
        const reqHeaders = (s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request) ? s.behaviorHints.proxyHeaders.request : (s.headers || {});
        const finalHeaders = { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer', 'Range': 'bytes=0-', ...reqHeaders };
        
        let sizeStr = (s.size || '').toString();
        const sizeMatch = rawText.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i) || sizeStr.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i);
        if (sizeMatch) sizeStr = sizeMatch[1];
        else sizeStr = sizeStr || '4K UHD';
        
        let badge = '4K (WEB)\n⟨Remux⟩';
        if (rawText.includes('BLURAY')) badge = '4K (BluRay)\n⟨Remux⟩';
        else if (rawText.includes('HDRIP') || rawText.includes('WEB')) badge = '4K (WEB)\n★★★★★';
        
        let videoSpecs = [];
        if (rawText.includes('HEVC') || rawText.includes('X265')) videoSpecs.push('HEVC');
        if (rawText.includes('10BIT')) videoSpecs.push('10bit');
        if (rawText.includes('DV') || rawText.includes('DOLBY VISION')) videoSpecs.push('DV');
        if (rawText.includes('HDR')) videoSpecs.push('HDR');
        if (videoSpecs.length === 0) videoSpecs = ['HEVC', '10bit', 'HDR'];
        
        let audioSpecs = [];
        if (rawText.includes('ATMOS')) audioSpecs.push('Atmos');
        if (rawText.includes('DD+') || rawText.includes('DDP')) audioSpecs.push('DD+');
        if (rawText.includes('TRUEHD')) audioSpecs.push('TrueHD');
        if (rawText.includes('DTS')) audioSpecs.push('DTS-HD');
        if (rawText.includes('7.1')) audioSpecs.push('🔊 7.1');
        else if (rawText.includes('5.1')) audioSpecs.push('🔊 5.1');
        else audioSpecs.push('🔊 2.0');
        if (audioSpecs.length === 1) audioSpecs.unshift('Dual Audio');
        
        let langStr = 'HI · EN';
        if (rawText.includes('MULTI')) langStr = 'MULTI';
        
        let cleanTitle = (s.title || '').split('\n')[0].replace(/^🎬\s*/, '').replace(/\s*\n.*$/, '').trim() || (s.name || 'Stream');
        const formattedTitle = '✏  ' + cleanTitle + '\n⏹  ' + videoSpecs.join(' ✦ ') + '\n🎵  ' + audioSpecs.join(' · ') + '\n◈  ' + sizeStr + '\n🛡  Nuvio · OlaMovies\n🏴  ' + langStr;
        
        return {
          name: badge,
          title: formattedTitle,
          url: s.url,
          quality: '4K',
          size: sizeStr,
          headers: finalHeaders,
          provider: 'olamovies'
        };
      }).filter(s => s !== null && s.quality === '4K');
      
      return cleaned;
    } catch (e) {
      return [];
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { getStreams };
  if (typeof global !== 'undefined') global.getStreams = getStreams;
}
