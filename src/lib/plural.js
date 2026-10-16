export function ruCount(amount, one, few, many) {
  const mod10 = amount % 10;
  const mod100 = amount % 100;
  if (mod10 === 1 && mod100 !== 11) return `${amount} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${amount} ${few}`;
  return `${amount} ${many}`;
}
