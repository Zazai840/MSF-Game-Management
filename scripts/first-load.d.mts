export interface ManifestChunk { file:string; isEntry?:boolean; imports?:string[]; css?:string[]; assets?:string[] }
export function firstLoadFiles(manifest:Record<string,ManifestChunk>):string[];
