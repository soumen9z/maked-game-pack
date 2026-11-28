
import { availableItems } from './availability.js';

const labels = {
  sukiya: 'すき家', katsuya: 'かつや', mcd: 'マクドナルド', yoshinoya: '吉野家',
  marugame: '丸亀製麺', hanamaru: 'はなまるうどん', mos: 'モスバーガー',
};
const filters = document.querySelector('#filters');
const results = document.querySelector('#results');
const summary = document.querySelector('#summary');
const clock = document.querySelector('#clock');
const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
});
let selection = 'all';
let data;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function officialLink(text, url) {
  const link = element('a', text);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function productCard(product) {
  const card = element('article', '', 'card');
  if (product.image) {
    const image = element('img', '', 'product-photo');
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove(), { once: true });
    image.src = product.image;
    card.append(image);
  }
  const body = element('div', '', 'card-body');
  const name = element('h3');
  name.append(officialLink(product.name, product.url));
  body.append(name);
  if (product.price) body.append(element('span', product.price, 'price'));
  if (product.note) body.append(element('span', product.note, 'note'));
  card.append(body);
  return card;
}

function render() {
  for (const button of filters.children) button.setAttribute('aria-pressed', String(button.dataset.id === selection));
  if (!data) return;
  results.replaceChildren();
  const now = Date.now();
  const chains = data.chains.filter(chain => selection === 'all' || selection === chain.id)
    .map(chain => ({ ...chain, items: availableItems(chain.items, now) }));
  const count = chains.reduce((total, chain) => total + chain.items.length, 0);
  const incomplete = chains.filter(chain => chain.status !== 'ok').length;
  summary.textContent = count + '件' + (incomplete ? '・' + incomplete + 'チェーンで取得が不完全' : '');
  for (const chain of chains) {
    const section = element('section', '', 'chain');
    const heading = element('div', '', 'chain-head');
    heading.append(element('h2', labels[chain.id]), officialLink('公式サイト', chain.official));
    section.append(heading);
    if (chain.status !== 'ok') {
      section.append(element('p', chain.status === 'partial' ? '公式情報の一部を取得できませんでした。' : '公式情報を取得できませんでした。', 'error'));
    } else if (!chain.items.length) {
      section.append(element('p', '掲載対象の期間限定メニューは確認できませんでした。', 'note'));
    }
    const grid = element('div', '', 'grid');
    grid.append(...chain.items.map(productCard));
    section.append(grid);
    results.append(section);
  }
}

async function load() {
  try {
    const response = await fetch('./menu.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('メニュー取得に失敗');
    data = await response.json();
    render();
    clock.textContent = '最終更新 ' + dateFormat.format(new Date(data.checkedAt)) + '（日本時間）';
  } catch {
    clock.textContent = 'メニュー一覧を読み込めませんでした';
    summary.textContent = '時間をおいてページを読み込み直してください。';
  } finally {
    results.setAttribute('aria-busy', 'false');
  }
}

for (const [id, label] of [['all', 'すべて'], ...Object.entries(labels)]) {
  const button = element('button', label);
  button.type = 'button';
  button.dataset.id = id;
  button.addEventListener('click', () => {
    selection = id;
    render();
  });
  filters.append(button);
}
render();
load();
