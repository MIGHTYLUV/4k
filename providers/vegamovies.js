/**
 * VegaMovies 4K & 1080p Scraper for Nuvio
 * Deobfuscated & Enhanced with High-Speed Filepress, Nexdrive, VCloud & HubCloud Direct Stream Extraction.
 * Strictly filtered to return ONLY 4K (2160p) and 1080p streams (No 720p/480p).
 */

let cheerio;
try {
  cheerio = require('cheerio-without-node-native');
} catch (e) {
  try {
    cheerio = require('cheerio');
  } catch (e2) {
    cheerio = null;
  }
}

const PROVIDER_NAME = 'VegaMovies';
const DEFAULT_BASE_URL = 'https://vegamovies.navy';
const DOMAINS_JSON_URL = 'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json';
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const REQUEST_TIMEOUT = 12000;

let baseUrl = DEFAULT_BASE_URL;
let cachedHubDomain = 'https://hubcloud.cx';
let cachedVcDomain = 'https://vcloud.zip';
let cachedDomains = null;
let domainCacheTime = 0;
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

const MOBILE_UAS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function getMobileHeaders() {
  const ua = MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)];
  return {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': baseUrl + '/'
  };
}

function getOrigin(url) {
  try {
    const parts = url.split('//');
    if (parts.length < 2) return url;
    return parts[0] + '//' + parts[1].split('/')[0];
  } catch (e) {
    return url;
  }
}

function fixUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return baseUrl + url;
  return baseUrl + '/' + url;
}

function parseQuality(str) {
  const s = String(str || '');
  const m = s.match(/(2160|1080|720|480)\s*P/i);
  if (m) return m[1].toLowerCase() + 'p';
  if (/4K|UHD|2160/i.test(s)) return '2160p';
  if (/1440|2K/i.test(s)) return '1440p';
  if (/1080/i.test(s)) return '1080p';
  return 'HD';
}

function decodeEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&#038;/g, '&')
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&quot;/g, '"');
}

async function fetchSafe(url, options = {}, timeout = REQUEST_TIMEOUT) {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeout) : null;
    const headers = { ...getMobileHeaders(), ...(options.headers || {}) };

    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller ? controller.signal : undefined
    });

    if (timeoutId) clearTimeout(timeoutId);
    return res;
  } catch (e) {
    return null;
  }
}

async function fetchJson(url, options = {}, timeout = REQUEST_TIMEOUT) {
  const res = await fetchSafe(url, options, timeout);
  if (!res || !res.ok) return null;
  try {
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fetchHtml(url, options = {}, timeout = REQUEST_TIMEOUT) {
  const res = await fetchSafe(url, options, timeout);
  if (!res || !res.ok || !cheerio) return null;
  try {
    const text = await res.text();
    return cheerio.load(text);
  } catch (e) {
    return null;
  }
}

async function refreshDomains() {
  const now = Date.now();
  if (cachedDomains && (now - domainCacheTime < DOMAIN_CACHE_TTL)) {
    return cachedDomains;
  }
  try {
    const data = await fetchJson(DOMAINS_JSON_URL, {}, 6000);
    if (data) {
      cachedDomains = data;
      domainCacheTime = now;
      if (data.vegamovies) baseUrl = data.vegamovies;
      if (data.hubcloud) cachedHubDomain = data.hubcloud;
      if (data.vcloud) cachedVcDomain = data.vcloud;
      console.log(`[${PROVIDER_NAME}] Domains updated: Base=${baseUrl}, Hub=${cachedHubDomain}, VCloud=${cachedVcDomain}`);
    }
  } catch (e) {
    console.warn(`[${PROVIDER_NAME}] Domain refresh failed, using fallback domains.`);
  }
  return cachedDomains || {};
}

async function getTMDBInfo(id, type) {
  const idStr = String(id || '').trim();
  const imdbMatch = idStr.startsWith('tt');
  const mediaType = (type === 'tv' || type === 'series') ? 'tv' : 'movie';

  try {
    if (imdbMatch) {
      const data = await fetchJson(`https://api.themoviedb.org/3/find/${idStr}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
      const results = data ? (mediaType === 'tv' ? data.tv_results : data.movie_results) : null;
      if (results && results.length > 0) {
        const item = results[0];
        const title = mediaType === 'tv' ? item.name : item.title;
        const year = (item.first_air_date || item.release_date || '').split('-')[0];
        return { title, year, imdbId: idStr, tmdbId: item.id, altTitles: [] };
      }
      return { title: idStr, year: null, imdbId: idStr, tmdbId: null, altTitles: [] };
    } else {
      const data = await fetchJson(`https://api.themoviedb.org/3/${mediaType}/${idStr}?api_key=${TMDB_API_KEY}&append_to_response=external_ids,alternative_titles`);
      if (data) {
        const title = mediaType === 'tv' ? data.name : data.title;
        const year = (data.first_air_date || data.release_date || '').split('-')[0];
        const imdbId = data.external_ids?.imdb_id || null;
        let altTitles = [];
        if (data.alternative_titles?.titles) {
          altTitles = data.alternative_titles.titles.map(t => String(t.title || ''));
        } else if (data.alternative_titles?.results) {
          altTitles = data.alternative_titles.results.map(t => String(t.title || ''));
        }
        return { title, year, imdbId, tmdbId: data.id, altTitles };
      }
    }
  } catch (e) {
    console.warn(`[${PROVIDER_NAME}] TMDB lookup error: ${e.message}`);
  }
  return { title: idStr, year: null, imdbId: null, tmdbId: null, altTitles: [] };
}

function isStrictMatch(targetTitle, targetYear, postTitle, postCategory, altTitles = []) {
  if (!postTitle) return false;
  const cleanTarget = (targetTitle || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanPost = postTitle.toLowerCase().replace(/download\s*/gi, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const titlesToCheck = [targetTitle, ...altTitles].filter(Boolean);
  let titleMatch = false;
  for (const t of titlesToCheck) {
    const ct = t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (ct && (cleanPost.includes(ct) || ct.includes(cleanPost))) {
      titleMatch = true;
      break;
    }
  }
  if (!titleMatch) return false;

  if (targetYear && postCategory) {
    const py = parseInt(postCategory);
    const ty = parseInt(targetYear);
    if (!isNaN(py) && !isNaN(ty) && Math.abs(py - ty) > 1) {
      return false;
    }
  }
  return true;
}

async function searchByTitle(query, year) {
  if (!query) return [];
  const qStr = encodeURIComponent(query + (year ? ` ${year}` : ''));
  const searchUrl = `${baseUrl}/wp-json/wp/v2/posts?search=${qStr}&page=1&per_page=15`;

  try {
    const data = await fetchJson(searchUrl);
    if (!data || !Array.isArray(data) || data.length === 0) return [];
    return data.map(item => {
      const title = decodeEntities(item.title?.rendered || '').replace(/Download\s*/gi, '').trim();
      let itemYear = null;
      const ym = title.match(/\b(19\d{2}|20\d{2})\b/);
      if (ym) itemYear = ym[1];
      return {
        postId: String(item.id || ''),
        title,
        permalink: item.link || '',
        imdbId: '',
        year: itemYear
      };
    });
  } catch (e) {
    return [];
  }
}

async function fetchPostContent(postId, permalink) {
  if (!postId && !permalink) return null;

  if (postId) {
    const wpUrl = `${baseUrl}/wp-json/wp/v2/posts/${postId}`;
    try {
      const data = await fetchJson(wpUrl);
      if (data && data.content?.rendered) {
        const html = data.content.rendered;
        if (/nexdrive|vcloud|hubcloud|fastdl|genxfm|filepress|filebee/i.test(html)) {
          const title = decodeEntities(data.title?.rendered || '').replace(/Download\s*/gi, '').trim();
          return { title, html };
        }
      }
    } catch (e) {}
  }

  const pageUrl = fixUrl(permalink || `${baseUrl}/?p=${postId}`);
  try {
    const $ = await fetchHtml(pageUrl);
    if ($) {
      const html = $('.entry-content').html() || $('#content').html() || $('article').html();
      const title = decodeEntities($('h1').first().text()).replace(/Download\s*/gi, '').trim();
      if (html) return { title, html };
    }
  } catch (e) {}
  return null;
}

function makeStream(titleText, qualityTag, streamUrl, quality, refererHeader, postTitle) {
  const cleanTitle = decodeEntities(postTitle || titleText || 'VegaMovies Stream').trim();
  const q = quality || parseQuality(qualityTag || cleanTitle) || '1080p';
  const headers = {
    'User-Agent': getMobileHeaders()['User-Agent'],
    'Referer': refererHeader || baseUrl + '/',
    'Range': 'bytes=0-'
  };

  return {
    name: `VegaMovies | ${q} • High-Speed Direct`,
    title: `${cleanTitle}\n⚡ High-Speed Direct Stream (${qualityTag || q})\n🎥 ${q} | 🚀 Resumable MKV`,
    url: streamUrl,
    quality: q,
    headers: headers,
    _resWeight: q === '2160p' || q === '4K' ? 3 : (q === '1080p' ? 2 : 1),
    behaviorHints: {
      notWebReady: true,
      proxyHeaders: {
        request: headers
      }
    }
  };
}

/**
 * Extracts Filepress / Filebee direct MKV stream URL using the tested two-step (downlaod -> downlaod2) API.
 */
async function extractFilepress(url, quality, referer, titleTag, postTitle, targetSeason, targetEpisode) {
  const idMatch = url.match(/\/file\/([a-f0-9]{24})/i) || url.match(/\/([a-f0-9]{24})/i);
  if (!idMatch) return [];
  const fileId = idMatch[1];
  const origin = getOrigin(url);

  try {
    const reqHeaders = {
      'User-Agent': getMobileHeaders()['User-Agent'],
      'Content-Type': 'application/json',
      'Origin': origin,
      'Referer': `${origin}/file/${fileId}`
    };

    const r1 = await fetchSafe(`${origin}/api/file/downlaod/`, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify({ id: fileId, method: 'indexDownlaod' })
    }, 6000);

    if (!r1 || !r1.ok) return [];
    const data1 = await r1.json();
    if (!data1.status || !data1.data) return [];
    const taskId = data1.data;

    for (let i = 0; i < 5; i++) {
      if (i > 0) await new Promise(res => setTimeout(res, 1200));
      const r2 = await fetchSafe(`${origin}/api/file/downlaod2/`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({ id: taskId, method: 'indexDownlaod' })
      }, 6000);

      if (!r2 || !r2.ok) continue;
      const data2 = await r2.json();
      if (data2 && data2.status && data2.data) {
        const streamUrl = Array.isArray(data2.data) ? data2.data[0] : (typeof data2.data === 'string' ? data2.data : data2.data?.url);
        if (streamUrl && typeof streamUrl === 'string' && streamUrl.startsWith('http')) {
          if (targetEpisode != null) {
            const epMatch = streamUrl.match(/[\.\-_\s][eE]p?(\d{1,3})[\.\-_\s]/i);
            if (epMatch) {
              const epNum = parseInt(epMatch[1], 10);
              if (epNum !== Number(targetEpisode)) {
                continue;
              }
            }
          }
          return [makeStream(titleTag || 'Filepress Direct Stream', quality, streamUrl, quality, origin + '/', postTitle)];
        }
      }
    }
  } catch (e) {
    console.warn(`[${PROVIDER_NAME}] Filepress extraction error: ${e.message}`);
  }
  return [];
}

/**
 * Extracts VCloud / HubCloud streams (FSL, workers, direct DL).
 */
async function extractSingleVc(url, referer, targetSeason, targetEpisode, titleTag, qualityTag, postTitle) {
  if (!url) return [];
  const origin = getOrigin(url);
  const streams = [];

  try {
    const $ = await fetchHtml(url, {
      headers: { 'Referer': referer || baseUrl + '/' },
      redirect: 'follow'
    }, 8000);
    if (!$) return [];

    const pageTitle = $('title').text() || '';
    if (targetEpisode != null) {
      const epMatch = pageTitle.match(/[.\s_\-](?:S|Season)\s*0*(\d{1,2})[.\s_\-]*(?:E|Ep|Episode)\s*0*(\d{1,2})[.\s_\-]/i);
      if (epMatch) {
        const epNum = parseInt(epMatch[2], 10);
        if (epNum !== Number(targetEpisode)) return [];
      }
    }

    const html = $.html();
    let directUrl = '';
    const m1 = html.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);
    const m2 = html.match(/var\s+url\s*=\s*atob\(atob\('([^']+)'\)\)/);
    if (m2) {
      try {
        directUrl = Buffer.from(Buffer.from(m2[1], 'base64').toString(), 'base64').toString();
      } catch (e) {
        directUrl = m2[1];
      }
    } else if (m1) {
      directUrl = m1[1];
    }

    const q = parseQuality(qualityTag || pageTitle) || '1080p';
    if (directUrl && directUrl.includes('.workers.dev')) {
      streams.push(makeStream(titleTag || 'Worker Server', qualityTag || q, `${directUrl}?s=${Date.now()}`, q, url, postTitle));
    }

    $('a.btn, a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href || href === '#' || href.toLowerCase().includes('telegram')) return;
      if (text.includes('10Gbps') || text.includes('FSL') || text.includes('Direct')) {
        const finalUrl = href.includes('?') ? `${href}&s=${Date.now()}` : `${href}?s=${Date.now()}`;
        streams.push(makeStream(text || titleTag || 'Direct Stream', qualityTag || q, finalUrl, q, url, postTitle));
      }
    });
  } catch (e) {}
  return streams;
}

async function loadStreamsFromUrl(url, qualityTag, quality, referer, season, episode, postTitle) {
  if (!url) return [];
  const lower = url.toLowerCase();

  // 1. Filepress / Filebee direct links
  if (lower.includes('filepress') || lower.includes('filebee') || lower.includes('fpgo')) {
    return await extractFilepress(url, quality, referer, qualityTag, postTitle, season, episode);
  }

  // 2. VCloud / Hubcloud links
  if (lower.includes('vcloud') || lower.includes('hubcloud')) {
    return await extractSingleVc(url, referer, season, episode, qualityTag, quality, postTitle);
  }

  // 3. Nexdrive / Genxfm / FastDL links -> visit and extract both Filepress & VCloud links
  if (lower.includes('nexdrive') || lower.includes('genxfm') || lower.includes('fastdl')) {
    const $ = await fetchHtml(url, { headers: { 'Referer': referer || baseUrl + '/' } }, 8000);
    if (!$) return [];

    const targetLinks = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim() || qualityTag || 'Download';
      if (!href) return;
      const lHref = href.toLowerCase();
      if (lHref.includes('filepress') || lHref.includes('filebee') || lHref.includes('fpgo')) {
        targetLinks.push({ href: fixUrl(href), text, type: 'filepress' });
      } else if (lHref.includes('vcloud') || lHref.includes('hubcloud')) {
        targetLinks.push({ href: fixUrl(href), text, type: 'vcloud' });
      }
    });

    const streams = [];
    for (const item of targetLinks) {
      if (item.type === 'filepress') {
        const res = await extractFilepress(item.href, quality, url, item.text, postTitle, season, episode);
        streams.push(...res);
      } else {
        const res = await extractSingleVc(item.href, url, season, episode, item.text, qualityTag, postTitle);
        streams.push(...res);
      }
    }
    return streams;
  }

  return [];
}

function extractPostLinks(html) {
  if (!html || !cheerio) return [];
  const $ = cheerio.load(html);
  const links = [];
  const seen = new Set();

  $('a').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href || href === '#' || href.toLowerCase().includes('telegram')) return;
    if (seen.has(href)) return;
    seen.add(href);

    const lHref = href.toLowerCase();
    if (
      lHref.includes('nexdrive') ||
      lHref.includes('genxfm') ||
      lHref.includes('fastdl') ||
      lHref.includes('filepress') ||
      lHref.includes('filebee') ||
      lHref.includes('vcloud') ||
      lHref.includes('hubcloud') ||
      lHref.includes('workers.dev')
    ) {
      let q = 'HD';
      const parentText = $(el).parent().parent().text() || '';
      if (/4K|UHD|2160/i.test(parentText) || /4K|2160/i.test(text)) q = '2160p';
      else if (/1080/i.test(parentText) || /1080/i.test(text)) q = '1080p';
      else if (/720/i.test(parentText) || /720/i.test(text)) q = '720p';

      links.push({ href: fixUrl(href), quality: q, label: text || q });
    }
  });

  return links;
}

async function getStreams(id, type = 'movie', season = null, episode = null) {
  try {
    await refreshDomains();
    const isTv = (type === 'tv' || type === 'series');
    const tmdbInfo = await getTMDBInfo(id, type);
    let imdbId = tmdbInfo.imdbId || (String(id).startsWith('tt') ? String(id) : null);
    const targetTitle = tmdbInfo.title;
    const targetYear = tmdbInfo.year;

    let searchResults = [];
    if (imdbId) {
      searchResults = await searchByTitle(imdbId, null);
    }
    if (searchResults.length === 0 && targetTitle) {
      let query = targetTitle;
      if (isTv && season != null) query += ` season ${Number(season)}`;
      else if (targetYear) query += ` ${targetYear}`;
      searchResults = await searchByTitle(query, null);
      if (searchResults.length === 0 && isTv && season != null) {
        searchResults = await searchByTitle(targetTitle, targetYear);
      }
    }

    if (searchResults.length === 0) return [];

    let matchedPost = null;
    for (const item of searchResults) {
      if (isStrictMatch(targetTitle, targetYear, item.title, item.year, tmdbInfo.altTitles)) {
        if (isTv && season != null) {
          const sMatch = item.title.match(/(?:s|season|staffel|saison)\s*0*(\d+)/i);
          if (sMatch) {
            const postSeason = parseInt(sMatch[1], 10);
            if (postSeason !== Number(season)) continue;
          }
        }
        matchedPost = item;
        break;
      }
    }

    if (!matchedPost) matchedPost = searchResults[0];

    const postContent = await fetchPostContent(matchedPost.postId, matchedPost.permalink);
    if (!postContent || !postContent.html) return [];

    const links = extractPostLinks(postContent.html);
    const allStreams = [];

    const promises = links
      .filter(l => l.quality !== '720p' && l.quality !== '480p')
      .slice(0, 12)
      .map(l => (() => loadStreamsFromUrl(l.href, l.label, l.quality, matchedPost.permalink || baseUrl + '/', season, episode, postContent.title))());

    const resultsArray = await Promise.all(promises);
    for (const res of resultsArray) {
      if (Array.isArray(res) && res.length > 0) {
        allStreams.push(...res);
      }
    }

    const uniqueStreams = [];
    const seenUrls = new Set();
    for (const s of allStreams) {
      if (!s || !s.url || seenUrls.has(s.url)) continue;
      seenUrls.add(s.url);
      uniqueStreams.push(s);
    }

    return uniqueStreams.sort((a, b) => (b._resWeight || 0) - (a._resWeight || 0));
  } catch (e) {
    console.error(`[${PROVIDER_NAME}] Fatal error: ${e.message}`);
    return [];
  }
}

// --- AIOSTREAMS RICH CARD 4K-ONLY WRAPPER WITH EXOPLAYER HEADERS & IMDB-TO-TMDB BRIDGE ---
if (typeof getStreams === 'function') {
  const __origGetStreams = getStreams;
  getStreams = async function(...args) {
    try {
      let [id, type, season, episode, ...rest] = args;
      let cleanId = id;
      if (typeof cleanId === 'string' && cleanId.includes(':')) {
        const parts = cleanId.split(':');
        cleanId = parts[0];
        if (parts[1] && season == null) season = parseInt(parts[1], 10);
        if (parts[2] && episode == null) episode = parseInt(parts[2], 10);
      }
      if ((type === 'tv' || type === 'series') && typeof cleanId === 'string' && cleanId.startsWith('tt')) {
        try {
          const res = await fetch('https://api.themoviedb.org/3/find/' + cleanId + '?api_key=1865f43a0549ca50d341dd9ab8b29f49&external_source=imdb_id');
          const json = await res.json();
          if (json && json.tv_results && json.tv_results.length > 0) {
            cleanId = json.tv_results[0].id.toString();
          }
        } catch (err) {}
      }
      const results = await __origGetStreams(cleanId, type, season, episode, ...rest);
      if (!Array.isArray(results)) return [];
      
      // Step 1: Strict 4K filter before modifying stream objects
      const filtered = results.filter(s => {
        if (!s || !s.url) return false;
        const q = (s.quality || s.resolution || '').toString().toUpperCase();
        const titleStr = (s.title || s.name || s.description || '').toString().toUpperCase();
        const combined = (q + ' ' + titleStr).toUpperCase();
        
        // Strict rejection of any 1080p, 720p, 480p, FHD, or HD tags
        if (q === '1080P' || q === '720P' || q === '480P' || q === '1080' || q === '720' || q === '480' || q === 'FHD' || q === 'HD') {
          return false;
        }
        if (/\b(1080P?|720P?|480P?|360P?|FHD)\b/i.test(combined)) {
          return false;
        }
        
        // Explicit verification of 2160p, 4K, or UHD inside resolution/title field
        const has2160 = q === '4K' || q === '2160P' || q === '2160' || q === 'UHD' || /\b(2160P?|UHD|4K\s*(?:UHD|REMUX|BLURAY|WEB|UDR|HDR|HEVC|X265))\b/i.test(combined);
        return has2160;
      });
      
      // Step 2: Clean mapping preserving website name (s.name) and native stream title
      return filtered.map(s => {
        const reqHeaders = (s.behaviorHints && s.behaviorHints.proxyHints && s.behaviorHints.proxyHints.request) ? s.behaviorHints.proxyHints.request : (s.headers || {});
        const finalHeaders = { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer', 'Range': 'bytes=0-', ...reqHeaders };
        
        let qVal = (s.quality || '2160p').toString();
        if (qVal.toUpperCase() !== '4K' && qVal.toUpperCase() !== '2160P') qVal = '2160p';
        
        return {
          ...s,
          name: s.name || 'VegaMovies',
          title: s.title || 'VegaMovies 4K UHD Stream',
          quality: qVal,
          headers: finalHeaders
        };
      });
    } catch (e) {
      return [];
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { getStreams };
  if (typeof global !== 'undefined') global.getStreams = getStreams;
}
