/** Workers fetch uses the public network; private VPC bindings are not used. */
export function fetchPublicUrl(
  url: string,
  init: RequestInit
): Promise<Response> {
  return fetch(url, init);
}
