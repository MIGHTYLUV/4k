const cheerio = require('cheerio');
async function test() {
  const res = await fetch('https://vegamovies.navy/', {headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}});
  const text = await res.text();
  const $ = cheerio.load(text);
  console.log('Search form action:', $('form').attr('action'));
  console.log('Search input name:', $('form input[type="text"], form input[type="search"]').attr('name'));
  console.log('Search script src:', $('script[src*="search"], script[src*="ajax"]').map((i,el)=>$(el).attr('src')).get());
}
test();
