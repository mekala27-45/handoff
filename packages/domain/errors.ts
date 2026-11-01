export class DomainError extends Error {
  constructor(public code:string, public status=400){super(code);this.name='DomainError';}
}
export function requireThat(condition:unknown,code:string,status=400):asserts condition {if(!condition)throw new DomainError(code,status);}
