export function validate(date:string,time:string,now?:Date):string;
export function availableDays(now?:Date,days?:number):string[];
export function validDay(date:string):boolean;
export function clock(now?:Date):{date:string;time:string};
export function holidays(year:number):Set<string>;
