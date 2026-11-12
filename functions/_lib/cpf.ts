// Validate check digits, not just length. This does not verify CPF ownership.
export function normalizedCpf(value: unknown): string | null {
 if (typeof value !== 'string' || !/^[\d.\-\s]+$/.test(value) || value.length > 20) return null;
 const cpf=value.replace(/\D/g,'');
 if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return null;
 for(let n=9;n<=10;n++){
  let sum=0;for(let i=0;i<n;i++)sum+=Number(cpf[i])*(n+1-i);
  const digit=(sum*10)%11%10;if(digit!==Number(cpf[n]))return null;
 }
 return cpf;
}
