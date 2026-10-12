const prefix = 'msf:';
export const phoneStorage = {
  token: () => localStorage.getItem(`${prefix}token`),
  join: (token: string) => localStorage.setItem(`${prefix}token`, token),
  clear: () => { for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key); }
};
export class ApiFailure extends Error { constructor(public status: number, message: string) { super(message); } }
/** JSON and binary calls share authentication and removal handling. */
export async function apiResponse(path:string,body?:unknown):Promise<Response> {
  const token = phoneStorage.token();
  const response = await fetch(`/api/${path}`, {
    method:body === undefined ? 'GET':'POST',
    headers:{...(token ? {authorization:`Bearer ${token}`} : {}), ...(body === undefined ? {} : {'content-type':'application/json'})},
    ...(body === undefined ? {} : {body:JSON.stringify(body)})
  });
  if (!response.ok) {
    const result = await response.json().catch(()=>({message:'Could not connect - please try again'}));
    if (response.status === 401) {
      phoneStorage.clear();
      window.dispatchEvent(new Event('msf:removed'));
    }
    throw new ApiFailure(response.status, result.message || 'Could not connect - please try again');
  }
  return response;
}

export async function api<T>(path:string,body?:unknown):Promise<T> {
  return (await apiResponse(path,body)).json() as Promise<T>;
}
export async function apiDownload(path:string):Promise<{blob:Blob;filename:string}> {
 const response=await apiResponse(path,{});
 return {blob:await response.blob(),filename:response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||'day-export.xlsx'};
}
