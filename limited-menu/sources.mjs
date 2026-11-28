
const origins = {
  sukiya: 'https://www.sukiya.jp/',
  katsuya: 'https://www.arclandservice.co.jp/katsuya/menu/',
  mcd: 'https://www.mcdonalds.co.jp/menu/',
  yoshinoya: 'https://www.yoshinoya.com/menu/gentei/',
  marugame: 'https://jp.marugame.com/menu/udon/',
  hanamaru: 'https://www.hanamaruudon.com/menu/',
  mos: 'https://www.mos.jp/menu/category/?c_id=26',
};

const clean = html => html.replace(/<!--[\s\S]*?-->/g, '');
const plain = html => (html ?? '').replace(/<[^>]*>/g, ' ')
  .replace(/&(?:amp|quot|nbsp|reg|#39);/g, value => ({
    '&amp;': '&', '&quot;': '"', '&nbsp;': ' ', '&reg;': '®', '&#39;': "'",
  })[value]).replace(/\s+/g, ' ').trim();
const field = (html, pattern) => html.match(pattern)?.[1];
const attr = (tag, name) => field(tag ?? '', new RegExp('(?:^|\\s)' + name + '=["\']([^"\']*)["\']'));
const amount = value => String(value ?? '').match(/\d[\d,]*/)?.[0].replaceAll(',', '');
const yen = value => amount(value) ? Number(amount(value)).toLocaleString('ja-JP') + '円' : '';

function link(value, base) {
  if (!value) return '';
  const url = new URL(value.replaceAll('&amp;', '&'), base);
  return url.protocol === 'https:' ? url.href : '';
}

function item(base, name, price, url, image, note, availability) {
  return { name: plain(name), price, url: link(url, base) || base, image: link(image, base), note, ...availability };
}

function isoDate(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

async function get(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8500),
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' },
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return clean(await response.text());
}

export const parsers = {
  sukiya(html, base) {
    const list = field(html, /<ul\b[^>]*id="slider02"[^>]*>([\s\S]*?)<\/ul>/);
    if (!list) throw new Error('限定メニュー欄を取得できません');
    const replacements = {
      'ねぎ塩牛タン丼CM': ['ねぎ塩豚タン丼', 'https://news.sukiya.jp/special/negishio202611/index.html'],
      'suki塩バターキャラメル': ['Sukiシェイク 塩バターキャラメル'],
      '牛すき鍋': ['牛すき鍋定食', null, '牛・胡麻麻辣湯鍋定食'],
      '白髪ねぎ牛丼': ['白髪ねぎ牛丼', null, '食べラー白髪ねぎ牛丼'],
    };
    return [...list.matchAll(/(<a\s[^>]*>)\s*(<img\s[^>]*>)/g)].flatMap(([, anchor, image]) => {
      const label = attr(image, 'alt') ?? '';
      const href = attr(anchor, 'href') ?? '';
      const src = attr(image, 'src') ?? '';
      const known = replacements[label];
      if (!known && (!/\/(?:special\/[^/]*20\d{4}\/|menu\/in\/)/.test(href) || /セット|クーポン|キャンペーン|CM|アプリ|注文|辛口ソース/.test(label))) return [];
      const date = src.match(/_(\d{2})(\d{2})(\d{2})\.[a-z]+$/i);
      const startsAt = date && isoDate('20' + date[1] + '-' + date[2] + '-' + date[3] + 'T09:00:00+09:00');
      const [name, url, variant] = known ?? [label];
      return [name, variant].filter(Boolean).map(title => item(base, title, '', url || href, src, undefined, { startsAt }));
    });
  },
  katsuya(html, base) {
    const area = field(html, /<h2[^>]*>\s*期間限定\s*<\/h2>([\s\S]*?)<\/section>/);
    if (area === undefined) throw new Error('期間限定欄を取得できません');
    return [...area.matchAll(/(<a\s[^>]*>)([\s\S]*?)<\/a>/g)].map(([, anchor, card]) => {
      const name = field(card, /<h3[^>]*>([\s\S]*?)<\/h3>/);
      const price = yen(field(card, /class="menu-price__tax"[^>]*>([^<]+)/));
      const image = field(card, /background-image:\s*url\(([^)'"]+)/);
      return item(base, name, price, attr(anchor, 'href'), image,
        /弁当/.test(name ?? '') ? '持ち帰り' : '一部店舗を除く');
    });
  },
  mcd(html, base) {
    const cards = html.split(/<div\b[^>]*class=["']product-list-card\s[^>]*>/).slice(1);
    if (!cards.length) throw new Error('商品一覧を取得できません');
    return cards.flatMap(card => {
      const badge = card.match(/<img\b[^>]*data-time-limited-offer=["']true["'][^>]*>/)?.[0];
      if (!badge || (attr(badge, 'class') ?? '').split(/\s+/).includes('hidden')) return [];
      const startsAt = isoDate(attr(badge, 'data-time-limited-offer-started-at'));
      const endsAt = isoDate(attr(badge, 'data-time-limited-offer-ended-at'));
      const name = field(card, /<strong[^>]*product-list-card-name[^>]*>([\s\S]*?)<\/strong>/);
      const price = field(card, /<span[^>]*product-list-card-price-number[^>]*>([^<]+)/);
      const image = field(card, /<picture\b[^>]*>[\s\S]*?<img[^>]+data-src=['"]([^'"]+)/);
      if (!name || /(?:セット|コンビ)$/.test(plain(name))) return [];
      const url = field(card, /\shref=["'](\/products\/[^"']+)/);
      return [item(base, name, yen(price) + (/[~～]/.test(price ?? '') ? '〜' : ''), url, image, undefined, { startsAt, endsAt })];
    });
  },
  yoshinoya(html, base) {
    if (!html.includes('menu__grand')) throw new Error('期間限定欄を取得できません');
    return [...html.matchAll(/<div class="menu__unit">\s*(<a\s[^>]*>)([\s\S]*?)<\/a>/g)]
      .filter(([, , card]) => card.includes('期間限定'))
      .map(([, anchor, card]) => {
        const name = field(card, /class="menu__title">([^<]+)/);
        const price = yen(field(card, /税込\s*<span>([^<]+)/));
        const image = field(card, /<img[^>]+src="([^"]+)/);
        return item(base, name, price, attr(anchor, 'href'), image);
      });
  },
  marugame(html, base) {
    const data = JSON.parse(field(html, /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/));
    return data.props.pageProps.menus.shop.filter(row =>
      row.attributes?.limited_time_item || row.attributes?.limited ||
      row.notes?.some(note => /早期終売|なくなり次第終了|無くなり次第終了|期間限定/.test(note)) ||
      ['yakikamonegi', 'kakitamaankakeudon', 'kakibukkakeudon'].includes(row.id)
    ).map(row => item(base, row.name, yen(row.prices?.find(price => price.default)?.number),
      row.href, row.image?.url, [
        row.attributes?.shop_exclusive,
        row.label_select?.some(label => label.includes('dine_in_only')) && '店内飲食のみ',
      ].filter(Boolean).join('・')));
  },
  hanamaru(html, base) {
    const area = field(html, /LIMITED MENU<\/span><\/h2>([\s\S]*?)<\/section>/);
    if (area === undefined) throw new Error('期間限定欄を取得できません');
    const launch = area.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^。]{0,12}より/);
    const startsAt = launch && isoDate(launch[1] + '-' + launch[2].padStart(2, '0') + '-' + launch[3].padStart(2, '0') + 'T00:00:00+09:00');
    const detail = field(area, /href="([^"]+)"[^>]*>キャンペーン詳細/);
    const images = [...area.matchAll(/<img\b[^>]*src="([^"]*\/img_campaign_menu[^"]*)"/g)].map(match => match[1]);
    return [...area.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/g)].map(([, title, card], index) => {
      const name = field(title, /class="inline-block">([^<]+)/) ?? title;
      return item(base, name, yen(field(card, /<ul[^>]*menu-limited__price[^>]*>[\s\S]*?<span>([\d,]+)/)),
        detail, images[index], '一部店舗を除く', { startsAt });
    });
  },
  mos(html, base) {
    return JSON.parse(html).filter(row =>
      (row.tags ?? '').split(',').some(tag => ['1', '2', '14'].includes(tag))
    ).map(row => item(base, row.name, yen(row.price),
      '/menu/detail/?menu_id=' + encodeURIComponent(row.id) + '&c_id=26',
      row.image5 && '/img/menu/' + row.id + '/' + row.image5,
      (row.tags ?? '').split(',').includes('14') ? '数量限定' : undefined,
      row.name.includes('金曜日限定') ? { weekday: 'Fri' } : undefined));
  },
};

export async function loadMenu() {
  const entries = await Promise.all(Object.entries(origins).map(async ([id, official]) => {
    const urls = id === 'mcd'
      ? ['', 'burger/', 'side/', 'drink/', 'morning/', 'dinner/', 'dessert/', 'mccafe/'].map(path => official + path)
      : [id === 'mos' ? 'https://www.mos.jp/data/menu/menu_category/36.json' : official];
    const results = await Promise.allSettled(urls.map(async url => parsers[id](await get(url), official)));
    const success = results.filter(result => result.status === 'fulfilled');
    const unique = new Map();
    for (const result of success) {
      for (const product of result.value) {
        if (product.name && !unique.has(product.name)) unique.set(product.name, product);
      }
    }
    return { id, official, status: success.length === urls.length ? 'ok' : success.length ? 'partial' : 'unavailable',
      items: [...unique.values()] };
  }));
  return { checkedAt: new Date().toISOString(), chains: entries };
}
