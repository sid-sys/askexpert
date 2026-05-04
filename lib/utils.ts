export function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatDuration(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} Minute${minutes !== 1 ? "s" : ""}`;
  }
  if (hours < 24) {
    return `${hours} Hour${hours !== 1 ? "s" : ""}`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours === 0) {
    return `${days} Day${days !== 1 ? "s" : ""}`;
  }
  return `${days} Day${days !== 1 ? "s" : ""} ${remainingHours} Hour${remainingHours !== 1 ? "s" : ""}`;
}
