export function normalizeVietnamesePhoneNumber(input) {
  if (!input) return null;
  const normalized = String(input).replace(/\s+/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const phone = normalized.startsWith("0") ? normalized : `0${normalized}`;
  if (phone.length !== 10) return null;
  return phone;
}

export function isVietnamesePhoneNumberValid(input) {
  const phone = normalizeVietnamesePhoneNumber(input);
  if (!phone) return false;
  return /^(03|05|07|08|09)\d{8}$/.test(phone);
}