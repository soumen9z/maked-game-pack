export function availableItems(items, now = Date.now()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', weekday: 'short',
  }).format(now);
  return items.filter(item =>
    (!item.startsAt || now >= Date.parse(item.startsAt)) &&
    (!item.endsAt || now < Date.parse(item.endsAt)) &&
    (!item.weekday || item.weekday === weekday)
  );
}
