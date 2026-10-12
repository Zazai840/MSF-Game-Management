const prefix = 'msf:';
export const phoneStorage = {
  token: () => localStorage.getItem(`${prefix}token`),
  join: (token: string) => localStorage.setItem(`${prefix}token`, token),
  clear: () => { for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key); }
};
export class ApiFailure extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const token = phoneStorage.token();
  const response = await fetch(`/api/${path}`, {
    method:body === undefined ? 'GET':'POST',
    headers:{...(token ? {authorization:`Bearer ${token}`} : {}), ...(body === undefined ? {} : {'content-type':'application/json'})},
    ...(body === undefined ? {} : {body:JSON.stringify(body)})
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      phoneStorage.clear();
      window.dispatchEvent(new Event('msf:removed'));
    }
    throw new ApiFailure(response.status, result.message || 'Could not connect - please try again');
  }
  return result as T;
}
