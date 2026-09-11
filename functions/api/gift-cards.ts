import type { Env } from "../_lib/types";
import { giftCardsRequest } from "../_lib/gift-cards";
import { apiError } from "../_lib/http";
export const onRequest:PagesFunction<Env>=async({request,env})=>{
 try{return await giftCardsRequest(request,env);}catch{return apiError("Não foi possível concluir. Confira Meus cartões e tente novamente.",502);}
};
