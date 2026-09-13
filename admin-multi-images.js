(function(){
  const style=document.createElement('style');style.textContent='.product-image-preview{flex-wrap:wrap}.product-image-preview img+img{margin-left:4px}.product-image-preview span{flex-basis:100%}';document.head.appendChild(style);
  const originalBind=bindProductImagePreview;
  bindProductImagePreview=function(){
    originalBind();
    const input=document.querySelector('input[name="image_file"]'),preview=document.querySelector('.product-image-preview');
    if(!input||!preview)return;
    input.multiple=true;
    const hint=input.closest('.product-image-picker')?.querySelector('small');
    if(hint)hint.textContent='Selecione uma ou várias fotos em JPG, PNG ou WebP, até 5 MB cada';
    input.onchange=()=>{
      const files=Array.from(input.files||[]);if(!files.length)return;
      preview.innerHTML=files.map(file=>`<img src="${URL.createObjectURL(file)}" alt="Prévia de ${file.name}">`).join('')+`<span>${files.length} foto${files.length>1?'s':''} selecionada${files.length>1?'s':''}</span>`;
      preview.hidden=false;
    };
  };
  uploadProductFile=async function(productId){
    const files=Array.from(document.querySelector('input[name="image_file"]')?.files||[]);
    let result=null;
    for(let index=0;index<files.length;index++){
      const form=new FormData();form.append('image',files[index]);if(index)form.append('append','1');
      const response=await fetch('/api/admin/products/'+productId+'/image',{method:'POST',credentials:'same-origin',body:form});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error?.message||'Não foi possível enviar a imagem.');result=data;
    }
    return result;
  };
})();
