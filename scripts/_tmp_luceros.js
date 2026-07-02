// TEMP: dump carta efectiva de Luceros a JSON. Borrar tras correr.
require('dotenv').config();
const fs = require('fs');
const { supabaseAdmin } = require('../lib/supabase');
const { getEffectiveMenu } = require('../lib/menu-effective');

function nm(x){ if(!x) return ''; if(typeof x==='string') return x; return x.es || x.ES || x.en || Object.values(x)[0] || ''; }

(async () => {
  const slug = process.argv[2] || 'luceros';
  const { data: r } = await supabaseAdmin.from('restaurants').select('id,slug,name').eq('slug', slug).single();
  const eff = await getEffectiveMenu(r.id);
  const out = { local: nm(r.name), slug: r.slug, categories: [] };
  let totItems=0, totPrices=0;
  eff.categories.forEach(c => {
    const cat = { name: nm(c.name), items: [] };
    c.subcategories.forEach(s => {
      const subName = nm(s.name);
      s.items.forEach(i => {
        totItems++;
        const prices = (i.prices||[]).map(p => { totPrices++; return { variant: nm(p.variant_name)||null, price: p.price }; });
        cat.items.push({ sub: subName, name: nm(i.name), desc: nm(i.description), prices });
      });
    });
    out.categories.push(cat);
  });
  out._counts = { items: totItems, priceRows: totPrices };
  fs.writeFileSync(__dirname + '/_' + slug + '.json', JSON.stringify(out, null, 2));
  console.log('OK items=', totItems, 'priceRows=', totPrices, 'cats=', out.categories.map(c=>c.name+':'+c.items.length).join(' | '));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
