(function(){
 window.loadProductReviews=function(product){
  const rating=document.querySelector('.rating');
  if(!rating||document.querySelector('#product-reviews'))return;
  const panel=document.createElement('details');
  panel.id='product-reviews';
  panel.innerHTML='<summary>Avaliar este produto</summary><p>Entre na sua conta para publicar sua avaliação. Seu primeiro nome será exibido. Você pode atualizar sua avaliação enviando novamente.</p><a href="conta.html" class="review-login">Entrar ou criar conta</a><form><label>Sua nota<select name="rating" required><option value="">Selecione</option><option value="5">5 estrelas</option><option value="4">4 estrelas</option><option value="3">3 estrelas</option><option value="2">2 estrelas</option><option value="1">1 estrela</option></select></label><label>Comentário (opcional)<textarea name="comment" maxlength="2000" rows="4" placeholder="Conte como foi sua experiência com a peça"></textarea></label><button type="submit" class="button">Enviar avaliação</button></form><p class="review-status" role="status"></p><div class="review-list"></div>';
  document.querySelector('.product-info').append(panel);
  const status=panel.querySelector('.review-status'),list=panel.querySelector('.review-list');
  function render(data){
   const count=Number(data.summary.count),average=Number(data.summary.average);
   rating.replaceChildren();
   const stars=document.createElement('span'),link=document.createElement('a');
   stars.textContent='★'.repeat(Math.round(average))+'☆'.repeat(5-Math.round(average));
   link.href='#product-reviews';
   link.textContent=' '+average.toLocaleString('pt-BR',{maximumFractionDigits:1})+' · '+count+(count===1?' avaliação':' avaliações')+' — Avaliar';
   link.onclick=()=>{panel.open=true;};
   rating.append(stars,link);list.replaceChildren();
   if(!count){list.textContent='Este produto ainda não tem avaliações. Seja o primeiro a avaliar!';return;}
   data.reviews.forEach(review=>{
    const item=document.createElement('article'),title=document.createElement('strong'),comment=document.createElement('p');
    title.textContent=review.name+' · '+review.rating+'/5';comment.textContent=review.comment;
    item.append(title,comment);list.append(item);
   });
  }
  async function request(options){
   const response=await fetch('/api/reviews/'+product.id,options),data=await response.json();
   if(!response.ok)throw new Error(data.error?.message||'Não foi possível carregar as avaliações.');
   render(data);
  }
  panel.querySelector('form').onsubmit=async event=>{
   event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');
   button.disabled=true;status.textContent='Enviando...';
   try{
    await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:Number(form.elements.rating.value),comment:form.elements.comment.value})});
    status.textContent='Avaliação salva! Obrigado por compartilhar sua experiência.';
   }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  };
  request().catch(error=>{status.textContent=error.message;rating.textContent='Avaliações indisponíveis no momento';});
 };
})();
