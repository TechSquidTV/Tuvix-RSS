import ipaddr from "ipaddr.js";

export function assertPublicAddress(address: string): void {
  if (
    !ipaddr.isValid(address) ||
    ipaddr.process(address).range() !== "unicast"
  ) {
    throw new Error(
      "Requests to private or reserved network addresses are not allowed"
    );
  }
}

export function validatePublicUrl(input: string | URL): URL {
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Only HTTP(S) URLs without embedded credentials are allowed"
    );
  }
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (ipaddr.isValid(host)) {
    assertPublicAddress(host);
  } else if (
    !host.includes(".") ||
    /\.(localhost|local|internal|lan|home|test|invalid)$/.test(host)
  ) {
    throw new Error("Requests to local hostnames are not allowed");
  }
  return url;
}
