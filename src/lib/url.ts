export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return trimmed;
  }

  if (!url.pathname || url.pathname === "") {
    url.pathname = "/";
  }

  return url.toString();
}
