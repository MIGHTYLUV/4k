const fs = require('fs');

const active = [
  { id: '4khdhub', name: '4kHDHub' },
  { id: '4khdhubnew', name: '4kHDHub-New' },
  { id: 'cineby', name: 'Cineby' },
  { id: 'dahmermovies-4k', name: 'DahmerMovies' },
  { id: 'ddlbase', name: 'DDLBase' },
  { id: 'hindmoviez', name: 'HindMoviez' },
  { id: 'moviesdrive', name: 'MoviesDrive' },
  { id: 'nakios', name: 'Nakios' },
  { id: 'olamovies', name: 'OlaMovies' },
  { id: 'uhdmovies', name: 'UHDMovies' },
  { id: 'vegamovies', name: 'VegaMovies' }
];

active.forEach(item => {
  const filePath = 'providers/' + item.id + '.js';
  if (!fs.existsSync(filePath)) return;
  
  let c = fs.readFileSync(filePath, 'utf8');
  
  const idx1 = c.indexOf('// --- 4K & 1080P NORMALIZED WRAPPER');
  const idx2 = c.indexOf('// --- 4K ONLY WRAPPER');
  const idx3 = c.indexOf('// --- AIOSTREAMS RICH CARD');
  let start = -1;
  if (idx3 !== -1) start = idx3;
  else if (idx2 !== -1) start = idx2;
  else if (idx1 !== -1) start = idx1;
  
  if (start !== -1) {
    c = c.substring(0, start);
  }
  
  const wrapper = `// --- AIOSTREAMS RICH CARD 4K-ONLY WRAPPER WITH EXOPLAYER HEADERS & IMDB-TO-TMDB BRIDGE ---
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
        if (!s) return false;
        const q = (s.quality || s.resolution || '').toString().toUpperCase();
        const titleStr = (s.title || s.name || s.description || '').toString().toUpperCase();
        const combined = (q + ' ' + titleStr).toUpperCase();
        
        // Strict rejection of any 1080p, 720p, 480p, FHD, or HD tags
        if (q === '1080P' || q === '720P' || q === '480P' || q === '1080' || q === '720' || q === '480' || q === 'FHD' || q === 'HD') {
          return false;
        }
        if (/\\b(1080P?|720P?|480P?|360P?|FHD)\\b/i.test(combined)) {
          return false;
        }
        
        // Explicit verification of 2160p, 4K, or UHD inside resolution/title field
        const has2160 = q === '4K' || q === '2160P' || q === '2160' || q === 'UHD' || /\\b(2160P?|UHD|4K\\s*(?:UHD|REMUX|BLURAY|WEB|UDR|HDR|HEVC|X265))\\b/i.test(combined);
        return has2160;
      });
      
      // Step 2: Map filtered 4K streams to rich AIOStreams layout with ExoPlayer headers
      return filtered.map(s => {
        const rawText = ((s.name || '') + ' ' + (s.title || '') + ' ' + (s.qualityTag || '')).toUpperCase();
        const reqHeaders = (s.behaviorHints && s.behaviorHints.proxyHints && s.behaviorHints.proxyHints.request) ? s.behaviorHints.proxyHints.request : (s.headers || {});
        const finalHeaders = { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer', 'Range': 'bytes=0-', ...reqHeaders };
        
        let sizeStr = (s.size || '').toString();
        const sizeMatch = rawText.match(/(\\d+(?:\\.\\d+)?\\s*(?:GB|MB))/i) || sizeStr.match(/(\\d+(?:\\.\\d+)?\\s*(?:GB|MB))/i);
        if (sizeMatch) sizeStr = sizeMatch[1];
        else sizeStr = sizeStr || '4K UHD';
        
        let badge = '4K (WEB)\\n⟨Remux⟩';
        if (rawText.includes('BLURAY')) badge = '4K (BluRay)\\n⟨Remux⟩';
        else if (rawText.includes('HDRIP') || rawText.includes('WEB')) badge = '4K (WEB)\\n★★★★★';
        
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
        
        let cleanTitle = (s.title || '').split('\\n')[0].replace(/^🎬\\s*/, '').replace(/\\s*\\n.*$/, '').trim() || (s.name || 'Stream');
        const formattedTitle = '✏  ' + cleanTitle + '\\n⏹  ' + videoSpecs.join(' ✦ ') + '\\n🎵  ' + audioSpecs.join(' · ') + '\\n◈  ' + sizeStr + '\\n🛡  Nuvio · ${item.name}\\n🏴  ' + langStr;
        
        return {
          name: badge,
          title: formattedTitle,
          url: s.url,
          quality: '4K',
          size: sizeStr,
          headers: finalHeaders,
          provider: '${item.id}'
        };
      });
    } catch (e) {
      return [];
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { getStreams };
  if (typeof global !== 'undefined') global.getStreams = getStreams;
}
`;
  
  fs.writeFileSync(filePath, c + wrapper);
  console.log('Updated bridge & rich card wrapper for ' + item.id);
});

if (fs.existsSync('manifest.json')) {
  const m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  m.scrapers = m.scrapers.filter(s => s.id !== 'hdhub4u');
  fs.writeFileSync('manifest.json', JSON.stringify(m, null, 2));
  console.log('Verified hdhub4u removal from manifest.json');
}
