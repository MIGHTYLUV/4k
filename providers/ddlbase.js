const cheerio = typeof require === 'function' ? (tryRequire('cheerio-without-node-native') || tryRequire('cheerio')) : null;

function tryRequire(mod) {
  try { return require(mod); } catch (e) { return null; }
}

const PROVIDER_NAME = 'DDLBase';
const BASE_URL = 'https://ddlbase.com';
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

async function fetchSafe(url, options = {}, timeoutMs = 12000) {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const fetchOpts = {
      ...options,
      headers: { ...HEADERS, ...(options.headers || {}) },
      signal: controller ? controller.signal : undefined
    };
    const res = await fetch(url, fetchOpts);
    if (timer) clearTimeout(timer);
    return res;
  } catch (e) {
    return null;
  }
}

async function getTMDBInfo(tmdbId, type) {
  try {
    const endpoint = type === 'tv' ? `tv/${tmdbId}` : `movie/${tmdbId}`;
    const url = `https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}`;
    const res = await fetchSafe(url);
    if (res && res.ok) {
      const data = await res.json();
      const title = type === 'tv' ? (data.name || data.original_name) : (data.title || data.original_title);
      const date = type === 'tv' ? data.first_air_date : data.release_date;
      const year = date ? date.split('-')[0] : '';
      return { title: title || '', year };
    }
  } catch (e) {}
  return { title: '', year: '' };
}

function parseQuality(str) {
  const s = (str || '').toUpperCase();
  if (s.includes('2160P') || s.includes('4K') || s.includes('UHD')) return '4K';
  if (s.includes('1080P')) return '1080p';
  if (s.includes('720P')) return '720p';
  if (s.includes('480P')) return '480p';
  return 'HD';
}

function formatStreamName(quality, linkText, postTitle) {
  const fullText = `${postTitle} ${linkText}`.toUpperCase();
  let tags = [];
  
  if (fullText.includes('BLURAY') || fullText.includes('BLU-RAY')) tags.push('☁️ BluRay');
  else if (fullText.includes('WEBRIP') || fullText.includes('WEB-DL') || fullText.includes('WEB')) tags.push('☁️ WEB-DL');
  else tags.push('☁️ WEBRip');

  if (fullText.includes('DV') || fullText.includes('DOLBY VISION')) tags.push('⚡ Dolby Vision');
  else if (fullText.includes('HDR10+')) tags.push('⚡ HDR10+');
  else if (fullText.includes('HDR')) tags.push('⚡ HDR');
  else if (fullText.includes('10BIT')) tags.push('⚡ 10Bit');

  if (fullText.includes('X265') || fullText.includes('HEVC')) tags.push('⚡ x265 HEVC');
  else if (fullText.includes('X264') || fullText.includes('AVC')) tags.push('⚡ x264');

  if (fullText.includes('ATMOS')) tags.push('🔊 Dolby Atmos');
  else if (fullText.includes('TRUEHD') || fullText.includes('7.1')) tags.push('🔊 7.1 TrueHD');
  else if (fullText.includes('5.1') || fullText.includes('DDP5.1')) tags.push('🔊 5.1 DDP');

  let langs = [];
  if (fullText.includes('DUAL AUDIO') || fullText.includes('HINDI') || fullText.includes('HIN')) langs.push('Hindi 🇮🇳');
  if (fullText.includes('ENGLISH') || fullText.includes('ENG') || langs.length === 0) langs.push('English 🇺🇸');

  const qualityBadge = quality === '4K' ? '🌟 2160P UHD' : `${quality.toUpperCase()}`;
  const streamTitle = `${postTitle}\nDDLBase | ${qualityBadge} | 🗣️ ${langs.join(' • ')}\n${tags.join(' | ')}\n🔗 Direct Download / Hosting Link`;

  return {
    name: `DDLBase | ${qualityBadge}`,
    title: streamTitle
  };
}

async function getStreams(tmdbId, type = 'movie') {
  const streams = [];
  try {
    const info = await getTMDBInfo(tmdbId, type);
    if (!info.title) return streams;

    const query = `${info.title} ${info.year}`.trim();
    console.log(`[DDLBase] Searching for: "${query}" (TMDB: ${tmdbId})`);

    // Search via HTML search page
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
    const searchRes = await fetchSafe(searchUrl);
    
    let postLinks = [];
    if (searchRes && searchRes.ok) {
      const html = await searchRes.text();
      // Extract post permalinks matching our query
      const linkRegex = /<a[^>]+href="https?:\/\/ddlbase\.com\/([^"\/]+)\/?"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const slug = match[1];
        const text = match[2].replace(/<[^>]+>/g, '').trim();
        if (slug && !slug.includes('category') && !slug.includes('page') && text.length > 3) {
          const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, ' ');
          const cleanTitle = info.title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
          if (cleanSlug.includes(cleanTitle) || text.toLowerCase().includes(cleanTitle)) {
            const fullUrl = `${BASE_URL}/${slug}/`;
            if (!postLinks.some(p => p.url === fullUrl)) {
              postLinks.push({ url: fullUrl, title: text });
            }
          }
        }
      }
    }

    // Fallback to WP-JSON search if HTML yielded no posts
    if (postLinks.length === 0) {
      const apiUrl = `${BASE_URL}/wp-json/wp/v2/posts?search=${encodeURIComponent(info.title)}&per_page=5`;
      const apiRes = await fetchSafe(apiUrl);
      if (apiRes && apiRes.ok) {
        const posts = await apiRes.json();
        if (Array.isArray(posts)) {
          posts.forEach(p => {
            const title = (p.title && p.title.rendered ? p.title.rendered : '').replace(/<[^>]+>/g, '');
            const url = p.link || `${BASE_URL}/${p.slug}/`;
            postLinks.push({ url, title, content: p.content && p.content.rendered ? p.content.rendered : '' });
          });
        }
      }
    }

    // Process up to 3 matching posts
    for (const post of postLinks.slice(0, 3)) {
      let htmlContent = post.content || '';
      if (!htmlContent) {
        const postRes = await fetchSafe(post.url);
        if (postRes && postRes.ok) {
          htmlContent = await postRes.text();
        }
      }

      if (!htmlContent) continue;

      // Extract all download anchors
      const anchorRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let aMatch;
      while ((aMatch = anchorRegex.exec(htmlContent)) !== null) {
        const href = aMatch[1].trim();
        const linkText = aMatch[2].replace(/<[^>]+>/g, '').trim();

        // Skip internal navigation or spam links
        if (!href || href.startsWith('#') || href.includes('ddlbase.com') || href.includes('imdb.com') || href.includes('youtube.com')) {
          continue;
        }

        const quality = parseQuality(`${post.title} ${linkText}`);
        const formatted = formatStreamName(quality, linkText, post.title);

        streams.push({
          name: formatted.name,
          title: formatted.title,
          url: href,
          quality: quality
        });
      }
    }
  } catch (e) {
    console.error(`[DDLBase] Error scraping:`, e);
  }

  return streams;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
}

// --- 4K ONLY WRAPPER (STRICTLY NO 1080P/720P/480P) ---
if (typeof getStreams === 'function') {
  const __origGetStreams = getStreams;
  getStreams = async function(...args) {
    try {
      let runArgs = args;
      // Only for OlaMovies and Cineby when given an IMDB string (tt...), safely attempt resolution without blocking fallback
      if (('ddlbase' === 'olamovies' || 'ddlbase' === 'cineby') && args.length > 0 && typeof args[0] === 'string' && args[0].startsWith('tt')) {
        try {
          let cleanId = args[0];
          let season = args[2];
          let episode = args[3];
          if (cleanId.includes(':')) {
            const parts = cleanId.split(':');
            cleanId = parts[0];
            if (parts[1] && season == null) season = parseInt(parts[1], 10);
            if (parts[2] && episode == null) episode = parseInt(parts[2], 10);
          }
          const type = args[1] || 'movie';
          if (type === 'tv' || type === 'series') {
            const res = await fetch('https://api.themoviedb.org/3/find/' + cleanId + '?api_key=1865f43a0549ca50d341dd9ab8b29f49&external_source=imdb_id');
            const json = await res.json();
            if (json && json.tv_results && json.tv_results.length > 0) {
              const newArgs = [...args];
              newArgs[0] = json.tv_results[0].id.toString();
              if (season != null) newArgs[2] = season;
              if (episode != null) newArgs[3] = episode;
              runArgs = newArgs;
            }
          }
        } catch (err) {}
      }
      
      const results = await __origGetStreams(...runArgs);
      if (!Array.isArray(results)) return [];
      
      return results.filter(s => {
        if (!s || !s.url) return false;
        const q = (s.quality || s.resolution || '').toString().toUpperCase();
        const str = ((s.name || '') + ' ' + (s.title || '') + ' ' + (s.qualityTag || '')).toUpperCase();
        
        // Strictly eliminate 1080p, 720p, 480p, SD, or lower resolutions
        if (q === '1080P' || q === '720P' || q === '480P' || q === '1080' || q === '720' || q === '480' || /(1080P|720P|480P|360P|240P|1080|720|480|FHD)/.test(str)) {
          return false;
        }
        
        // Keep ONLY 4K (2160p) streams
        const is2160 = q === '4K' || q === '2160P' || q === '2160' || q === 'UHD' || str.includes('2160P') || /(4K|2160|UHD|REMUX)/.test(str);
        return is2160;
      });
    } catch (e) {
      return [];
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { getStreams };
  if (typeof global !== 'undefined') global.getStreams = getStreams;
}
