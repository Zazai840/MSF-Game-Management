/** A request the server answered with a refusal: its status, its message (the reason, in words) and its body. */
export class ApiFailure extends Error { constructor(public status: number, message: string, public body: {reason?:string;taken?:boolean} = {}) { super(message); } }
